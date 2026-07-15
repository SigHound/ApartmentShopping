const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5252;

app.use(cors());
app.use(express.json());

// Set up image upload directory
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded floorplans statically
app.use('/uploads', express.static(uploadsDir));

// Multer disk storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'floorplan-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Helper to get Google Maps API key from settings table
async function getGoogleApiKey() {
  try {
    const row = await db.get("SELECT value FROM settings WHERE key = ?", ['GOOGLE_MAPS_API_KEY']);
    return row ? row.value : null;
  } catch (error) {
    console.error('Error fetching API key from database:', error);
    return null;
  }
}

// Helper to calculate Unix timestamps for next Tuesday (Rush hour at 8am, Normal driving at 10pm)
function getNextTuesdayTimestamps() {
  const now = new Date();
  const nextTuesday = new Date();
  // If today is Tuesday and past 8am, we go to next Tuesday
  const daysToAdd = (2 + 7 - now.getDay()) % 7 || 7;
  nextTuesday.setDate(now.getDate() + daysToAdd);

  const rushHour = new Date(nextTuesday);
  rushHour.setHours(8, 0, 0, 0);

  const normalHour = new Date(nextTuesday);
  normalHour.setHours(22, 0, 0, 0);

  return {
    rushHour: Math.floor(rushHour.getTime() / 1000),
    normalHour: Math.floor(normalHour.getTime() / 1000)
  };
}

// Geocoding helper (OSM Nominatim)
async function geocodeAddress(address) {
  if (!address) return { lat: null, lon: null };
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'ApartmentScoringApp/1.0 (contact: local@app.com)'
      }
    });

    if (response.data && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lon: parseFloat(response.data[0].lon)
      };
    }
  } catch (err) {
    console.error('Geocoding error for:', address, err.message);
  }
  return { lat: null, lon: null };
}

// Haversine formula for straight line distance fallback (in miles)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 3958.8; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper to calculate commute distance and time for a single apartment and POI
async function calculateCommute(apartment, poi, apiKey) {
  const result = {
    distance_miles: null,
    normal_time_mins: null,
    rush_hour_time_mins: null
  };

  if (!apartment.address || !poi.address) return result;

  // Calculate straight line distance as baseline
  const straightLineMiles = calculateHaversineDistance(apartment.latitude, apartment.longitude, poi.latitude, poi.longitude);
  if (straightLineMiles) {
    result.distance_miles = parseFloat(straightLineMiles.toFixed(2));
    // Assume average speed of 30 mph for baseline estimate (normal driving)
    result.normal_time_mins = Math.round((straightLineMiles / 30) * 60) || 1;
    // Assume average speed of 15 mph for baseline rush hour estimate
    result.rush_hour_time_mins = Math.round((straightLineMiles / 15) * 60) || 2;
  }

  if (!apiKey) {
    return result; // Fallback to straight-line estimates
  }

  try {
    const times = getNextTuesdayTimestamps();
    
    // 1. Fetch Normal driving time (without traffic / standard conditions)
    const normalRes = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: apartment.address,
        destinations: poi.address,
        key: apiKey
      }
    });

    if (normalRes.data && normalRes.data.rows && normalRes.data.rows[0].elements[0].status === 'OK') {
      const element = normalRes.data.rows[0].elements[0];
      result.distance_miles = parseFloat((element.distance.value / 1609.344).toFixed(2));
      result.normal_time_mins = Math.round(element.duration.value / 60);
    }

    // 2. Fetch Rush Hour driving time (with traffic predictions for next Tuesday at 8 AM)
    const rushHourRes = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: apartment.address,
        destinations: poi.address,
        departure_time: times.rushHour,
        traffic_model: 'pessimistic', // Pessimistic for rush hour max time
        key: apiKey
      }
    });

    if (rushHourRes.data && rushHourRes.data.rows && rushHourRes.data.rows[0].elements[0].status === 'OK') {
      const element = rushHourRes.data.rows[0].elements[0];
      result.rush_hour_time_mins = Math.round((element.duration_in_traffic || element.duration).value / 60);
    }

  } catch (error) {
    console.error(`Google Distance Matrix API error between "${apartment.address}" and "${poi.address}":`, error.message);
  }

  return result;
}

// ------------------- API ROUTES -------------------

// 1. SETTINGS
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM settings");
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key is required' });
  try {
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POIs (Points of Interest)
app.get('/api/pois', async (req, res) => {
  try {
    const pois = await db.all("SELECT * FROM pois ORDER BY name ASC");
    res.json(pois);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pois', async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'POI Name is required' });
  try {
    const { lat, lon } = await geocodeAddress(address);
    const result = await db.run("INSERT INTO pois (name, address, latitude, longitude) VALUES (?, ?, ?, ?)", 
      [name, address || '', lat, lon]
    );

    const newPoi = { id: result.id, name, address, latitude: lat, longitude: lon };

    // Trigger commute recalculation for all existing apartments to this new POI
    const apartments = await db.all("SELECT * FROM apartments");
    const apiKey = await getGoogleApiKey();
    for (const apt of apartments) {
      const commute = await calculateCommute(apt, newPoi, apiKey);
      await db.run(`INSERT OR REPLACE INTO apartment_distances 
        (apartment_id, poi_id, normal_time_mins, rush_hour_time_mins, distance_miles) 
        VALUES (?, ?, ?, ?, ?)`,
        [apt.id, newPoi.id, commute.normal_time_mins, commute.rush_hour_time_mins, commute.distance_miles]
      );
    }

    res.json(newPoi);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pois/:id', async (req, res) => {
  const { id } = req.params;
  const { name, address } = req.body;
  try {
    const current = await db.get("SELECT * FROM pois WHERE id = ?", [id]);
    if (!current) return res.status(404).json({ error: 'POI not found' });

    let lat = current.latitude;
    let lon = current.longitude;
    if (address !== current.address) {
      const geocoded = await geocodeAddress(address);
      lat = geocoded.lat;
      lon = geocoded.lon;
    }

    await db.run("UPDATE pois SET name = ?, address = ?, latitude = ?, longitude = ? WHERE id = ?",
      [name, address, lat, lon, id]
    );

    const updatedPoi = { id: parseInt(id), name, address, latitude: lat, longitude: lon };

    // Update commute times for all apartments to this POI since address changed
    if (address !== current.address) {
      const apartments = await db.all("SELECT * FROM apartments");
      const apiKey = await getGoogleApiKey();
      for (const apt of apartments) {
        const commute = await calculateCommute(apt, updatedPoi, apiKey);
        await db.run(`INSERT OR REPLACE INTO apartment_distances 
          (apartment_id, poi_id, normal_time_mins, rush_hour_time_mins, distance_miles) 
          VALUES (?, ?, ?, ?, ?)`,
          [apt.id, id, commute.normal_time_mins, commute.rush_hour_time_mins, commute.distance_miles]
        );
      }
    }

    res.json(updatedPoi);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pois/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM pois WHERE id = ?", [id]);
    res.json({ success: true, message: `POI ${id} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CRITERIA & WEIGHTS
app.get('/api/criteria', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT c.*, w.user_weight, w.partner_weight 
      FROM criteria c
      LEFT JOIN criteria_weights w ON c.id = w.criteria_id
      ORDER BY c.type DESC, c.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/criteria', async (req, res) => {
  const { name, type, user_weight = 0, partner_weight = 0 } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and Type are required' });
  try {
    const result = await db.run("INSERT INTO criteria (name, type) VALUES (?, ?)", [name, type]);
    const criteriaId = result.id;
    await db.run("INSERT INTO criteria_weights (criteria_id, user_weight, partner_weight) VALUES (?, ?, ?)",
      [criteriaId, user_weight, partner_weight]
    );
    res.json({ id: criteriaId, name, type, user_weight, partner_weight });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/criteria/:id', async (req, res) => {
  const { id } = req.params;
  const { name, type } = req.body;
  try {
    await db.run("UPDATE criteria SET name = ?, type = ? WHERE id = ?", [name, type, id]);
    res.json({ id: parseInt(id), name, type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/criteria/:id/weights', async (req, res) => {
  const { id } = req.params;
  const { user_weight, partner_weight } = req.body;
  try {
    await db.run(`INSERT OR REPLACE INTO criteria_weights 
      (criteria_id, user_weight, partner_weight) VALUES (?, ?, ?)`,
      [id, user_weight, partner_weight]
    );
    res.json({ criteria_id: parseInt(id), user_weight, partner_weight });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/criteria/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM criteria WHERE id = ?", [id]);
    res.json({ success: true, message: `Criteria ${id} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. APARTMENTS
app.get('/api/apartments', async (req, res) => {
  try {
    const apartments = await db.all("SELECT * FROM apartments ORDER BY created_at DESC");
    
    // For each apartment, fetch distances and criteria matches
    for (let apt of apartments) {
      const distances = await db.all(`
        SELECT ad.*, p.name as poi_name, p.address as poi_address 
        FROM apartment_distances ad
        JOIN pois p ON ad.poi_id = p.id
        WHERE ad.apartment_id = ?`, 
        [apt.id]
      );
      
      const criteriaMatches = await db.all(`
        SELECT ac.criteria_id, ac.value, c.name, c.type, w.user_weight, w.partner_weight
        FROM apartment_criteria ac
        JOIN criteria c ON ac.criteria_id = c.id
        JOIN criteria_weights w ON c.id = w.criteria_id
        WHERE ac.apartment_id = ?`,
        [apt.id]
      );

      apt.distances = distances;
      apt.criteria = criteriaMatches;
    }
    
    res.json(apartments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Apartment (Includes file upload or base64 data for pasted floorplans)
app.post('/api/apartments', upload.single('floorplan'), async (req, res) => {
  const {
    name,
    address,
    rent,
    url,
    google_review_score,
    bedrooms,
    bathrooms,
    notes,
    criteriaMap, // JSON string of criteria_id -> true/false
    custom_distances // Optional pre-filled manual distances from frontend (JSON string of poi_id -> {normal_time_mins, rush_hour_time_mins, distance_km})
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Apartment name is required' });

  let floorplan_image = '';
  if (req.file) {
    floorplan_image = `/uploads/${req.file.filename}`;
  } else if (req.body.floorplan_base64) {
    // Process base64 pasted images
    const base64Data = req.body.floorplan_base64.replace(/^data:image\/\w+;base64,/, '');
    const ext = req.body.floorplan_ext || '.png';
    const filename = `floorplan-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, base64Data, { encoding: 'base64' });
    floorplan_image = `/uploads/${filename}`;
  }

  try {
    // 1. Geocode the address
    const { lat, lon } = await geocodeAddress(address);

    // 2. Insert the main apartment row
    const result = await db.run(`
      INSERT INTO apartments (name, address, rent, url, google_review_score, floorplan_image, notes, latitude, longitude, bedrooms, bathrooms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, 
        address || '', 
        rent ? parseInt(rent) : null, 
        url || '', 
        google_review_score ? parseFloat(google_review_score) : null, 
        floorplan_image, 
        notes || '', 
        lat, 
        lon,
        bedrooms ? parseInt(bedrooms) : null,
        bathrooms ? parseFloat(bathrooms) : null
      ]
    );

    const apartmentId = result.id;
    const insertedApartment = { 
      id: apartmentId, 
      name, 
      address, 
      rent, 
      url, 
      google_review_score, 
      floorplan_image, 
      notes, 
      latitude: lat, 
      longitude: lon,
      bedrooms: bedrooms ? parseInt(bedrooms) : null,
      bathrooms: bathrooms ? parseFloat(bathrooms) : null
    };

    // 3. Initialize distance mapping to all POIs
    const pois = await db.all("SELECT * FROM pois");
    const apiKey = await getGoogleApiKey();
    const parsedCustomDistances = custom_distances ? JSON.parse(custom_distances) : {};

    for (const poi of pois) {
      let commute = { distance_km: null, normal_time_mins: null, rush_hour_time_mins: null };

      // If user manually entered it, use that first
      if (parsedCustomDistances[poi.id]) {
        commute.normal_time_mins = parsedCustomDistances[poi.id].normal_time_mins ? parseInt(parsedCustomDistances[poi.id].normal_time_mins) : null;
        commute.rush_hour_time_mins = parsedCustomDistances[poi.id].rush_hour_time_mins ? parseInt(parsedCustomDistances[poi.id].rush_hour_time_mins) : null;
        commute.distance_km = parsedCustomDistances[poi.id].distance_km ? parseFloat(parsedCustomDistances[poi.id].distance_km) : null;
      } else {
        // Otherwise, calculate standard geocoded / Google Maps travel times
        commute = await calculateCommute(insertedApartment, poi, apiKey);
      }

      await db.run(`
        INSERT INTO apartment_distances (apartment_id, poi_id, normal_time_mins, rush_hour_time_mins, distance_miles)
        VALUES (?, ?, ?, ?, ?)`,
        [apartmentId, poi.id, commute.normal_time_mins, commute.rush_hour_time_mins, commute.distance_miles]
      );
    }

    // 4. Associate criteria values (Pros and Cons)
    const criteriaList = await db.all("SELECT id FROM criteria");
    const activeCriteria = criteriaMap ? JSON.parse(criteriaMap) : {};

    for (const crit of criteriaList) {
      const isSet = activeCriteria[crit.id] ? 1 : 0;
      await db.run(`
        INSERT INTO apartment_criteria (apartment_id, criteria_id, value)
        VALUES (?, ?, ?)`,
        [apartmentId, crit.id, isSet]
      );
    }

    res.json({ id: apartmentId, ...insertedApartment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Apartment (Includes floorplan re-upload or criteria update)
app.put('/api/apartments/:id', upload.single('floorplan'), async (req, res) => {
  const { id } = req.params;
  const {
    name,
    address,
    rent,
    url,
    google_review_score,
    bedrooms,
    bathrooms,
    notes,
    criteriaMap,
    custom_distances
  } = req.body;

  try {
    const current = await db.get("SELECT * FROM apartments WHERE id = ?", [id]);
    if (!current) return res.status(404).json({ error: 'Apartment not found' });

    let floorplan_image = current.floorplan_image;
    if (req.file) {
      floorplan_image = `/uploads/${req.file.filename}`;
    } else if (req.body.floorplan_base64) {
      const base64Data = req.body.floorplan_base64.replace(/^data:image\/\w+;base64,/, '');
      const ext = req.body.floorplan_ext || '.png';
      const filename = `floorplan-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, base64Data, { encoding: 'base64' });
      floorplan_image = `/uploads/${filename}`;
    }

    // Geocode if address changed
    let lat = current.latitude;
    let lon = current.longitude;
    let addressChanged = address !== current.address;

    if (addressChanged) {
      const geocoded = await geocodeAddress(address);
      lat = geocoded.lat;
      lon = geocoded.lon;
    }

    await db.run(`
      UPDATE apartments 
      SET name = ?, address = ?, rent = ?, url = ?, google_review_score = ?, floorplan_image = ?, notes = ?, latitude = ?, longitude = ?, bedrooms = ?, bathrooms = ?
      WHERE id = ?`,
      [
        name, 
        address, 
        rent ? parseInt(rent) : null, 
        url, 
        google_review_score ? parseFloat(google_review_score) : null, 
        floorplan_image, 
        notes, 
        lat, 
        lon, 
        bedrooms ? parseInt(bedrooms) : null,
        bathrooms ? parseFloat(bathrooms) : null,
        id
      ]
    );

    const updatedApartment = { 
      id: parseInt(id), 
      name, 
      address, 
      rent, 
      url, 
      google_review_score, 
      floorplan_image, 
      notes, 
      latitude: lat, 
      longitude: lon,
      bedrooms: bedrooms ? parseInt(bedrooms) : null,
      bathrooms: bathrooms ? parseFloat(bathrooms) : null
    };

    // Update commute times if address changed or manual commute values provided
    const pois = await db.all("SELECT * FROM pois");
    const apiKey = await getGoogleApiKey();
    const parsedCustomDistances = custom_distances ? JSON.parse(custom_distances) : {};

    for (const poi of pois) {
      let commute = null;

      if (parsedCustomDistances[poi.id]) {
        commute = {
          normal_time_mins: parsedCustomDistances[poi.id].normal_time_mins ? parseInt(parsedCustomDistances[poi.id].normal_time_mins) : null,
          rush_hour_time_mins: parsedCustomDistances[poi.id].rush_hour_time_mins ? parseInt(parsedCustomDistances[poi.id].rush_hour_time_mins) : null,
          distance_miles: parsedCustomDistances[poi.id].distance_miles ? parseFloat(parsedCustomDistances[poi.id].distance_miles) : null
        };
      } else if (addressChanged) {
        commute = await calculateCommute(updatedApartment, poi, apiKey);
      }

      if (commute) {
        await db.run(`
          INSERT OR REPLACE INTO apartment_distances (apartment_id, poi_id, normal_time_mins, rush_hour_time_mins, distance_miles)
          VALUES (?, ?, ?, ?, ?)`,
          [id, poi.id, commute.normal_time_mins, commute.rush_hour_time_mins, commute.distance_miles]
        );
      }
    }

    // Update criteria values
    if (criteriaMap) {
      const activeCriteria = JSON.parse(criteriaMap);
      for (const critId of Object.keys(activeCriteria)) {
        const isSet = activeCriteria[critId] ? 1 : 0;
        await db.run(`
          INSERT OR REPLACE INTO apartment_criteria (apartment_id, criteria_id, value)
          VALUES (?, ?, ?)`,
          [id, parseInt(critId), isSet]
        );
      }
    }

    res.json(updatedApartment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Apartment
app.delete('/api/apartments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const apt = await db.get("SELECT floorplan_image FROM apartments WHERE id = ?", [id]);
    
    // Try to remove local file if exists
    if (apt && apt.floorplan_image) {
      const filePath = path.join(__dirname, apt.floorplan_image);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.run("DELETE FROM apartments WHERE id = ?", [id]);
    res.json({ success: true, message: `Apartment ${id} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Apartment Shopping API Server listening on port ${PORT}`);
});
