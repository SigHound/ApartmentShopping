const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const db = require('./database');
const demoData = require('./demoData');

const app = express();
const PORT = process.env.PORT || 5252;

app.use(cors());
app.use(express.json());

// Global protection middleware for Demo Mode
app.use(async (req, res, next) => {
  const method = req.method;
  const path = req.path;
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    // Exception for toggling demo mode itself
    if (path === '/api/settings' && req.body && req.body.key === 'DEMO_MODE') {
      return next();
    }
    if (await isDemoActive()) {
      return res.status(403).json({ error: 'Edits are disabled in Demo Mode.' });
    }
  }
  next();
});

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

async function isDemoActive() {
  try {
    const row = await db.get("SELECT value FROM settings WHERE key = ?", ['DEMO_MODE']);
    return row && row.value === '1';
  } catch (error) {
    console.error('Error fetching DEMO_MODE setting:', error);
    return false;
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

// Geocoding helper (OSM Nominatim / Google fallback)
async function geocodeAddress(address) {
  if (!address) return { lat: null, lon: null };

  // 1. Try Google Geocoding first if we have a key
  const apiKey = await getGoogleApiKey();
  if (apiKey) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: address,
          key: apiKey
        }
      });
      if (response.data && response.data.status === 'OK' && response.data.results.length > 0) {
        const loc = response.data.results[0].geometry.location;
        return {
          lat: parseFloat(loc.lat),
          lon: parseFloat(loc.lng)
        };
      } else {
        console.warn('Google Geocoding API returned status:', response.data.status, 'for address:', address);
      }
    } catch (err) {
      console.error('Google Geocoding error for:', address, err.message);
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim
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

// Overpass API and Google Places helper to resolve closest chain branch to coordinates
async function resolveNearestChainBranch(apartment, poi, apiKey) {
  const aptLat = apartment.latitude;
  const aptLon = apartment.longitude;
  if (!aptLat || !aptLon) return null;

  const searchTerm = (poi.address && poi.address.trim()) ? poi.address.trim() : poi.name;

  // 1. Try Google Places Text Search if we have a key
  if (apiKey) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params: {
          query: searchTerm,
          location: `${aptLat},${aptLon}`,
          radius: 15000,
          key: apiKey
        }
      });
      if (response.data && response.data.results && response.data.results.length > 0) {
        const branches = response.data.results.map(r => {
          const loc = r.geometry.location;
          const dist = calculateHaversineDistance(aptLat, aptLon, parseFloat(loc.lat), parseFloat(loc.lng));
          return {
            name: r.name,
            address: r.formatted_address || r.vicinity || '',
            lat: parseFloat(loc.lat),
            lon: parseFloat(loc.lng),
            distance: dist
          };
        });
        branches.sort((a, b) => a.distance - b.distance);
        return branches[0];
      }
    } catch (err) {
      console.error('Google Places TextSearch error for:', searchTerm, err.message);
    }
  }

  // 2. OpenStreetMap Overpass API fallback
  try {
    const query = `[out:json][timeout:15];
(
  node["name"~"${searchTerm}",i](around:15000,${aptLat},${aptLon});
  way["name"~"${searchTerm}",i](around:15000,${aptLat},${aptLon});
  node["brand"~"${searchTerm}",i](around:15000,${aptLat},${aptLon});
  way["brand"~"${searchTerm}",i](around:15000,${aptLat},${aptLon});
);
out center;`;

    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query },
      headers: { 'User-Agent': 'VibeNest-ApartmentShopping/1.0' }
    });

    if (response.data && response.data.elements && response.data.elements.length > 0) {
      const branches = response.data.elements.map(el => {
        const lat = el.lat || (el.center && el.center.lat);
        const lon = el.lon || (el.center && el.center.lon);
        if (!lat || !lon) return null;

        const tags = el.tags || {};
        const name = tags.name || tags.brand || poi.name;
        const street = tags["addr:street"] || "";
        const housenumber = tags["addr:housenumber"] || "";
        const city = tags["addr:city"] || "";
        const address = `${housenumber} ${street} ${city}`.trim() || name;

        const dist = calculateHaversineDistance(aptLat, aptLon, parseFloat(lat), parseFloat(lon));
        return {
          name,
          address,
          lat: parseFloat(lat),
          lon: parseFloat(lon),
          distance: dist
        };
      }).filter(Boolean);

      if (branches.length > 0) {
        branches.sort((a, b) => a.distance - b.distance);
        return branches[0];
      }
    }
  } catch (err) {
    console.error('OSM Overpass API error for chain:', poi.name, err.message);
  }

  return null;
}

// Helper to calculate commute distance and time for a single apartment and POI
async function calculateCommute(apartment, poi, apiKey) {
  const result = {
    distance_miles: null,
    normal_time_mins: null,
    rush_hour_time_mins: null
  };

  let targetPoi = { ...poi };

  if (poi.is_chain === 1) {
    try {
      const cached = await db.get(
        "SELECT * FROM apartment_chain_branches WHERE apartment_id = ? AND poi_id = ?",
        [apartment.id, poi.id]
      );
      if (cached) {
        targetPoi.latitude = cached.latitude;
        targetPoi.longitude = cached.longitude;
        targetPoi.address = cached.branch_address;
        targetPoi.name = cached.branch_name;
      } else {
        const resolved = await resolveNearestChainBranch(apartment, poi, apiKey);
        if (resolved) {
          await db.run(`
            INSERT INTO apartment_chain_branches (apartment_id, poi_id, branch_name, branch_address, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [apartment.id, poi.id, resolved.name, resolved.address, resolved.lat, resolved.lon]
          );
          targetPoi.latitude = resolved.lat;
          targetPoi.longitude = resolved.lon;
          targetPoi.address = resolved.address;
          targetPoi.name = resolved.name;
        }
      }
    } catch (err) {
      console.error('Error handling cached chain branches:', err.message);
    }
  }

  if (!apartment.latitude || !apartment.longitude || !targetPoi.latitude || !targetPoi.longitude) return result;

  // 1. Try Google Distance Matrix first if we have a key
  if (apiKey && apartment.address && targetPoi.address) {
    try {
      const times = getNextTuesdayTimestamps();
      
      // Fetch Normal driving time (without traffic / standard conditions)
      const normalRes = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          origins: apartment.address,
          destinations: targetPoi.address,
          key: apiKey
        }
      });

      if (normalRes.data && normalRes.data.rows && normalRes.data.rows[0].elements[0].status === 'OK') {
        const element = normalRes.data.rows[0].elements[0];
        result.distance_miles = parseFloat((element.distance.value / 1609.344).toFixed(2));
        result.normal_time_mins = Math.round(element.duration.value / 60);
      }

      // Fetch Rush Hour driving time (with traffic predictions for next Tuesday at 8 AM)
      const rushHourRes = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          origins: apartment.address,
          destinations: targetPoi.address,
          departure_time: times.rushHour,
          traffic_model: 'pessimistic', // Pessimistic for rush hour max time
          key: apiKey
        }
      });

      if (rushHourRes.data && rushHourRes.data.rows && rushHourRes.data.rows[0].elements[0].status === 'OK') {
        const element = rushHourRes.data.rows[0].elements[0];
        result.rush_hour_time_mins = Math.round((element.duration_in_traffic || element.duration).value / 60);
      }

      if (result.distance_miles !== null && result.normal_time_mins !== null) {
        return result; // Successfully got Google values
      }
    } catch (error) {
      console.error(`Google Distance Matrix API error between "${apartment.address}" and "${targetPoi.address}":`, error.message);
    }
  }

  // 2. Try OSRM (Open Source Routing Machine) API as fallback for actual road routing
  try {
    const osrmUrl = `https://router.projectosrm.org/route/v1/driving/${apartment.longitude},${apartment.latitude};${targetPoi.longitude},${targetPoi.latitude}?overview=false`;
    const response = await axios.get(osrmUrl);
    if (response.data && response.data.code === 'Ok' && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      result.distance_miles = parseFloat((route.distance / 1609.344).toFixed(2));
      result.normal_time_mins = Math.round(route.duration / 60) || 1;
      // Estimate rush hour using the flat offset + multiplier heuristic (1.25x + 4 mins)
      result.rush_hour_time_mins = Math.round(result.normal_time_mins * 1.25) + 4;
      return result;
    }
  } catch (err) {
    console.error('OSM OSRM Routing error:', err.message);
  }

  // 3. Ultimate fallback: Haversine formula (straight-line distance)
  const straightLineMiles = calculateHaversineDistance(apartment.latitude, apartment.longitude, targetPoi.latitude, targetPoi.longitude);
  if (straightLineMiles) {
    result.distance_miles = parseFloat(straightLineMiles.toFixed(2));
    result.normal_time_mins = Math.round((straightLineMiles / 30) * 60) || 1;
    result.rush_hour_time_mins = Math.round(result.normal_time_mins * 1.25) + 4;
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
    if (key !== 'DEMO_MODE' && await isDemoActive()) {
      return res.status(403).json({ error: 'Edits are disabled in Demo Mode.' });
    }
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POIs (Points of Interest)
app.get('/api/pois', async (req, res) => {
  try {
    if (await isDemoActive()) {
      return res.json(demoData.demoPois);
    }
    const pois = await db.all("SELECT * FROM pois ORDER BY display_order ASC, name ASC");
    res.json(pois);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getDefaultPoiEmoji(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('work')) return '💼';
  if (lower.includes('office')) return '🏢';
  if (lower.includes('gym') || lower.includes('workout') || lower.includes('fitness')) return '🏋️';
  if (lower.includes('grocery') || lower.includes('market') || lower.includes('trader') || lower.includes('whole foods') || lower.includes('heb') || lower.includes('target') || lower.includes('store') || lower.includes('shop')) return '🛒';
  if (lower.includes('park') || lower.includes('trail') || lower.includes('outdoor') || lower.includes('nature') || lower.includes('lake') || lower.includes('beach')) return '🌳';
  if (lower.includes('coffee') || lower.includes('cafe') || lower.includes('starbucks') || lower.includes('dunkin')) return '☕';
  if (lower.includes('restaurant') || lower.includes('food') || lower.includes('eat') || lower.includes('dinner') || lower.includes('lunch') || lower.includes('bar') || lower.includes('pub')) return '🍴';
  if (lower.includes('school') || lower.includes('university') || lower.includes('college') || lower.includes('class')) return '🎓';
  return '📍';
}

app.post('/api/pois', async (req, res) => {
  const { name, address, icon, latitude, longitude, is_chain } = req.body;
  if (!name) return res.status(400).json({ error: 'POI Name is required' });
  const finalIcon = icon || getDefaultPoiEmoji(name);
  const isChainVal = is_chain ? 1 : 0;
  try {
    let lat = latitude;
    let lon = longitude;
    if (isChainVal === 0 && (lat === undefined || lon === undefined || lat === null || lon === null)) {
      const geocoded = await geocodeAddress(address);
      lat = geocoded.lat;
      lon = geocoded.lon;
    } else if (isChainVal === 1) {
      lat = null;
      lon = null;
    }
    const result = await db.run("INSERT INTO pois (name, address, latitude, longitude, icon, is_chain) VALUES (?, ?, ?, ?, ?, ?)", 
      [name, address || '', lat, lon, finalIcon, isChainVal]
    );

    const newPoi = { id: result.id, name, address, latitude: lat, longitude: lon, icon: finalIcon, is_chain: isChainVal };

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
  const { name, address, icon, latitude, longitude, is_chain } = req.body;
  const isChainVal = is_chain ? 1 : 0;
  try {
    const current = await db.get("SELECT * FROM pois WHERE id = ?", [id]);
    if (!current) return res.status(404).json({ error: 'POI not found' });

    let lat = latitude;
    let lon = longitude;
    if (isChainVal === 0 && (lat === undefined || lon === undefined || lat === null || lon === null)) {
      if (address !== current.address) {
        const geocoded = await geocodeAddress(address);
        lat = geocoded.lat;
        lon = geocoded.lon;
      } else {
        lat = current.latitude;
        lon = current.longitude;
      }
    } else if (isChainVal === 1) {
      lat = null;
      lon = null;
    }

    const finalIcon = icon || current.icon || getDefaultPoiEmoji(name);

    await db.run("UPDATE pois SET name = ?, address = ?, latitude = ?, longitude = ?, icon = ?, is_chain = ? WHERE id = ?",
      [name, address, lat, lon, finalIcon, isChainVal, id]
    );

    const updatedPoi = { id: parseInt(id), name, address, latitude: lat, longitude: lon, icon: finalIcon, is_chain: isChainVal };

    // Invalidate cached branches and trigger recalculation if query parameter, name, or chain flag changes
    const needsRecalc = name !== current.name || address !== current.address || lat !== current.latitude || lon !== current.longitude || isChainVal !== current.is_chain;

    if (needsRecalc) {
      await db.run("DELETE FROM apartment_chain_branches WHERE poi_id = ?", [id]);
      
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

app.put('/api/pois/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.run("UPDATE pois SET display_order = ? WHERE id = ?", [i, orderedIds[i]]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CRITERIA & WEIGHTS
app.get('/api/criteria', async (req, res) => {
  try {
    if (await isDemoActive()) {
      return res.json(demoData.demoCriteria);
    }
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

// 3.5. AUTOCOMPLETE PROXY ENDPOINTS
app.get('/api/autocomplete', async (req, res) => {
  const { input } = req.query;
  if (!input || input.trim().length < 3) {
    return res.json([]);
  }

  const apiKey = await getGoogleApiKey();

  if (apiKey) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
        params: {
          input: input,
          types: 'geocode|establishment',
          key: apiKey
        }
      });
      if (response.data && response.data.predictions) {
        const results = response.data.predictions.map(p => ({
          label: p.description,
          place_id: p.place_id,
          name: p.structured_formatting?.main_text || p.description,
          isGoogle: true
        }));
        return res.json(results);
      }
    } catch (err) {
      console.error('Google Places Autocomplete Proxy Error:', err.message);
    }
  }

  // Fallback: Nominatim OpenStreetMap search
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: input,
        format: 'json',
        limit: 5,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'VibeNest-ApartmentShopping/1.0'
      }
    });
    if (response.data && Array.isArray(response.data)) {
      const results = response.data.map(item => ({
        label: item.display_name,
        name: item.name || item.display_name.split(',')[0],
        address: item.display_name,
        lat: item.lat,
        lon: item.lon,
        isGoogle: false
      }));
      return res.json(results);
    }
  } catch (err) {
    console.error('Nominatim Autocomplete Proxy Error:', err.message);
  }

  res.json([]);
});

app.get('/api/place-details', async (req, res) => {
  const { place_id } = req.query;
  if (!place_id) return res.status(400).json({ error: 'place_id is required' });

  const apiKey = await getGoogleApiKey();
  if (!apiKey) return res.status(400).json({ error: 'Google API key is not configured' });

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: place_id,
        fields: 'formatted_address,geometry,rating',
        key: apiKey
      }
    });
    if (response.data && response.data.result) {
      const resData = response.data.result;
      return res.json({
        formatted_address: resData.formatted_address,
        rating: resData.rating,
        latitude: resData.geometry?.location?.lat || null,
        longitude: resData.geometry?.location?.lng || null
      });
    }
  } catch (err) {
    console.error('Google Place Details Proxy Error:', err.message);
  }

  res.status(500).json({ error: 'Failed to fetch place details' });
});

// 4. APARTMENTS
app.get('/api/apartments', async (req, res) => {
  try {
    if (await isDemoActive()) {
      const enriched = demoData.demoApartments.map(apt => {
        const distances = Object.keys(apt.commutes).map(poiId => {
          const poi = demoData.demoPois.find(p => p.id === parseInt(poiId));
          return {
            apartment_id: apt.id,
            poi_id: parseInt(poiId),
            normal_time_mins: apt.commutes[poiId].normal,
            rush_hour_time_mins: apt.commutes[poiId].traffic,
            distance_miles: apt.commutes[poiId].dist,
            is_manual: 0,
            poi_name: poi ? poi.name : '',
            poi_address: poi ? poi.address : '',
            poi_icon: poi ? poi.icon : '📍',
            poi_is_chain: poi ? poi.is_chain : 0
          };
        });

        const criteriaMatches = demoData.demoCriteria.map(c => {
          return {
            criteria_id: c.id,
            value: apt.criteriaValues[c.id] || 0,
            name: c.name,
            type: c.type,
            user_weight: c.user_weight,
            partner_weight: c.partner_weight
          };
        });

        const { commutes, criteriaValues, ...rest } = apt;
        return {
          ...rest,
          distances,
          criteria: criteriaMatches
        };
      });
      return res.json(enriched);
    }

    const apartments = await db.all("SELECT * FROM apartments ORDER BY created_at DESC");
    
    // For each apartment, fetch distances and criteria matches
    for (let apt of apartments) {
      const distances = await db.all(`
        SELECT ad.*, p.name as poi_name, p.address as poi_address, p.icon as poi_icon, p.is_chain as poi_is_chain 
        FROM apartment_distances ad
        JOIN pois p ON ad.poi_id = p.id
        WHERE ad.apartment_id = ?
        ORDER BY p.display_order ASC, p.name ASC`, 
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
    latitude,
    longitude,
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
    // 1. Geocode the address if coords not provided
    let lat = (latitude !== undefined && latitude !== null && latitude !== '') ? parseFloat(latitude) : null;
    let lon = (longitude !== undefined && longitude !== null && longitude !== '') ? parseFloat(longitude) : null;

    if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
      const geocoded = await geocodeAddress(address);
      lat = geocoded.lat;
      lon = geocoded.lon;
    }

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
      let commute = { distance_miles: null, normal_time_mins: null, rush_hour_time_mins: null };
      const manual = parsedCustomDistances[poi.id];
      const hasManualValue = manual && (
        (manual.normal_time_mins !== undefined && manual.normal_time_mins !== null && manual.normal_time_mins !== '') ||
        (manual.rush_hour_time_mins !== undefined && manual.rush_hour_time_mins !== null && manual.rush_hour_time_mins !== '') ||
        (manual.distance_miles !== undefined && manual.distance_miles !== null && manual.distance_miles !== '')
      );

      // If user manually entered a value, use that first
      if (hasManualValue) {
        commute.normal_time_mins = (manual.normal_time_mins !== '' && manual.normal_time_mins !== null) ? parseInt(manual.normal_time_mins) : null;
        commute.rush_hour_time_mins = (manual.rush_hour_time_mins !== '' && manual.rush_hour_time_mins !== null) ? parseInt(manual.rush_hour_time_mins) : null;
        commute.distance_miles = (manual.distance_miles !== '' && manual.distance_miles !== null) ? parseFloat(manual.distance_miles) : null;
      } else {
        // Otherwise, calculate standard geocoded / Google Maps / OSRM travel times
        commute = await calculateCommute(insertedApartment, poi, apiKey);
      }

      await db.run(`
        INSERT INTO apartment_distances (apartment_id, poi_id, normal_time_mins, rush_hour_time_mins, distance_miles, is_manual)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [apartmentId, poi.id, commute.normal_time_mins, commute.rush_hour_time_mins, commute.distance_miles, hasManualValue ? 1 : 0]
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
    latitude,
    longitude,
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

    const addressChanged = address !== current.address;

    // Geocode if address changed or if coords are null
    let lat = (latitude !== undefined && latitude !== null && latitude !== '') ? parseFloat(latitude) : null;
    let lon = (longitude !== undefined && longitude !== null && longitude !== '') ? parseFloat(longitude) : null;

    if (lat === null || lon === null || isNaN(lat) || isNaN(lon) || addressChanged) {
      if (addressChanged || lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
        const geocoded = await geocodeAddress(address);
        lat = geocoded.lat;
        lon = geocoded.lon;
      }
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

    // Invalidate cached chain branch locations if address coordinates changed
    if (addressChanged || lat !== current.latitude || lon !== current.longitude) {
      await db.run("DELETE FROM apartment_chain_branches WHERE apartment_id = ?", [id]);
    }

    // Update commute times if address changed or manual commute values provided
    const pois = await db.all("SELECT * FROM pois");
    const apiKey = await getGoogleApiKey();
    const parsedCustomDistances = custom_distances ? JSON.parse(custom_distances) : {};

    for (const poi of pois) {
      let commute = null;
      const manual = parsedCustomDistances[poi.id];
      const hasManualValue = manual && (
        (manual.normal_time_mins !== undefined && manual.normal_time_mins !== null && manual.normal_time_mins !== '') ||
        (manual.rush_hour_time_mins !== undefined && manual.rush_hour_time_mins !== null && manual.rush_hour_time_mins !== '') ||
        (manual.distance_miles !== undefined && manual.distance_miles !== null && manual.distance_miles !== '')
      );

      if (hasManualValue) {
        commute = {
          normal_time_mins: (manual.normal_time_mins !== '' && manual.normal_time_mins !== null) ? parseInt(manual.normal_time_mins) : null,
          rush_hour_time_mins: (manual.rush_hour_time_mins !== '' && manual.rush_hour_time_mins !== null) ? parseInt(manual.rush_hour_time_mins) : null,
          distance_miles: (manual.distance_miles !== '' && manual.distance_miles !== null) ? parseFloat(manual.distance_miles) : null
        };
      } else {
        // If there's no manual override or user cleared manual values (Reset to Auto), always calculate/recalculate the commute
        commute = await calculateCommute(updatedApartment, poi, apiKey);
      }

      if (commute) {
        await db.run(`
          INSERT OR REPLACE INTO apartment_distances (apartment_id, poi_id, normal_time_mins, rush_hour_time_mins, distance_miles, is_manual)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [id, poi.id, commute.normal_time_mins, commute.rush_hour_time_mins, commute.distance_miles, hasManualValue ? 1 : 0]
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
