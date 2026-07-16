// Curated Austin Demo Data for VibeNest Demo Mode

const demoPois = [
  { id: 101, name: 'Work', address: '11500 N Mopac Expwy, Austin, TX 78759', latitude: 30.4015, longitude: -97.7265, icon: '💼', is_chain: 0, display_order: 0 },
  { id: 102, name: 'H-E-B', address: 'H-E-B', latitude: null, longitude: null, icon: '🛒', is_chain: 1, display_order: 1 },
  { id: 103, name: 'Costco', address: 'Costco', latitude: null, longitude: null, icon: '🛒', is_chain: 1, display_order: 2 },
  { id: 104, name: 'Zilker Park', address: 'Zilker Metropolitan Park, Austin, TX', latitude: 30.2669, longitude: -97.7728, icon: '🌳', is_chain: 0, display_order: 3 }
];

const demoCriteria = [
  { id: 201, name: 'Has Garage Space', type: 'pro', user_weight: 4, partner_weight: 3 },
  { id: 202, name: 'In-unit Washer/Dryer', type: 'pro', user_weight: 5, partner_weight: 5 },
  { id: 203, name: 'Balcony or Patio', type: 'pro', user_weight: 3, partner_weight: 2 },
  { id: 204, name: 'Noisy Area', type: 'con', user_weight: 4, partner_weight: 4 },
  { id: 205, name: 'High Utility Costs', type: 'con', user_weight: 2, partner_weight: 3 }
];

const demoApartments = [
  {
    id: 9001,
    name: 'Edison Austin',
    address: '4711 E Riverside Dr, Austin, TX 78741',
    rent: 2295,
    url: 'https://www.apartments.com/edison-austin-austin-tx/j3w7y2q/',
    google_review_score: 4.5,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Newburn_Flats_floor_plan.png',
    notes: 'Modern building in Southeast Austin. Pros: great gym, close to downtown and boardwalk. Cons: Riverside traffic noise.',
    latitude: 30.2372,
    longitude: -97.7289,
    bedrooms: 2,
    bathrooms: 1.0,
    created_at: '2026-07-15T12:00:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 1, 205: 0 },
    commutes: {
      101: { normal: 24, traffic: 34, dist: 11.9 }, // Work
      102: { normal: 3, traffic: 3, dist: 0.4 },    // H-E-B (closest is on Riverside)
      103: { normal: 11, traffic: 12, dist: 3.8 },  // Costco
      104: { normal: 15, traffic: 16, dist: 10.0 }  // Zilker Park
    }
  },
  {
    id: 9002,
    name: 'Solaris House at Uptown ATX',
    address: '2800 Solaris St, Austin, TX 78758',
    rent: 2300,
    url: 'https://www.apartments.com/solaris-apartments-austin-tx/y5d5e2e/',
    google_review_score: 4.3,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/FOCSA_Apartment_Type_A.jpg',
    notes: 'Located in North Austin near The Domain. Pros: Quiet neighborhood, new finishes. Cons: Slightly higher utility costs.',
    latitude: 30.4012,
    longitude: -97.7123,
    bedrooms: 2,
    bathrooms: 2.5,
    created_at: '2026-07-15T12:01:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 0, 204: 0, 205: 1 },
    commutes: {
      101: { normal: 6, traffic: 6, dist: 1.86 },
      102: { normal: 5, traffic: 5, dist: 1.66 },
      103: { normal: 11, traffic: 10, dist: 3.98 },
      104: { normal: 10, traffic: 10, dist: 3.69 }
    }
  },
  {
    id: 9003,
    name: 'Beck at Wells Branch',
    address: '2801 Wells Branch Pkwy, Austin, TX 78728',
    rent: 1885,
    url: 'https://www.apartments.com/beck-at-wells-branch-austin-tx/x8e3r2w/',
    google_review_score: 3.3,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/FOCSA_Apartment_Type_B.jpg',
    notes: 'Suburban feel in North Austin. Pros: spacious patio, great natural light. Cons: Small walk-in closet.',
    latitude: 30.4378,
    longitude: -97.6582,
    bedrooms: 2,
    bathrooms: 1.5,
    created_at: '2026-07-15T12:02:00Z',
    criteriaValues: { 201: 0, 202: 1, 203: 1, 204: 0, 205: 0 },
    commutes: {
      101: { normal: 10, traffic: 17, dist: 4.82 },
      102: { normal: 8, traffic: 8, dist: 2.17 },
      103: { normal: 8, traffic: 8, dist: 2.67 },
      104: { normal: 13, traffic: 13, dist: 6.22 }
    }
  },
  {
    id: 9004,
    name: 'The Triangle Apartments',
    address: '4600 W Guadalupe St, Austin, TX 78751',
    rent: 2150,
    url: 'https://www.apartments.com/the-triangle-austin-tx/q3w7w8e/',
    google_review_score: 4.1,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/FOCSA_Apartment_Type_D.jpg',
    notes: 'Centrally located, highly walkable plaza context. Pros: walk to restaurants/shops, farmers market. Cons: Limited guest parking.',
    latitude: 30.3155,
    longitude: -97.7324,
    bedrooms: 1,
    bathrooms: 1.0,
    created_at: '2026-07-15T12:03:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 1, 205: 0 },
    commutes: {
      101: { normal: 12, traffic: 18, dist: 6.5 },
      102: { normal: 1, traffic: 1, dist: 0.1 },
      103: { normal: 14, traffic: 16, dist: 7.2 },
      104: { normal: 8, traffic: 10, dist: 4.1 }
    }
  },
  {
    id: 9005,
    name: 'Gables Park Plaza',
    address: '115 Sandra Muraida Way, Austin, TX 78703',
    rent: 2850,
    url: 'https://www.apartments.com/gables-park-plaza-austin-tx/r5d5t3e/',
    google_review_score: 4.7,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Baldwin_Spencer_Building_floor_plan.png',
    notes: 'Premium downtown location. Pros: direct trail access, rooftop view pool, dog park. Cons: High rent.',
    latitude: 30.2704,
    longitude: -97.7533,
    bedrooms: 2,
    bathrooms: 2.0,
    created_at: '2026-07-15T12:04:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 0, 205: 1 },
    commutes: {
      101: { normal: 18, traffic: 26, dist: 10.2 },
      102: { normal: 2, traffic: 2, dist: 0.3 },
      103: { normal: 15, traffic: 18, dist: 7.8 },
      104: { normal: 4, traffic: 5, dist: 1.5 }
    }
  },
  {
    id: 9006,
    name: 'Monarch by Windsor',
    address: '805 W 5th St, Austin, TX 78703',
    rent: 3200,
    url: 'https://www.apartments.com/monarch-by-windsor-austin-tx/x3e3e2t/',
    google_review_score: 4.6,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Newburn_Flats_floor_plan.png',
    notes: 'High-rise luxury in Market District. Pros: Walk to Whole Foods, high-end amenities. Cons: Elevator wait times.',
    latitude: 30.2691,
    longitude: -97.7512,
    bedrooms: 2,
    bathrooms: 2.0,
    created_at: '2026-07-15T12:05:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 1, 205: 1 },
    commutes: {
      101: { normal: 18, traffic: 28, dist: 10.4 },
      102: { normal: 1, traffic: 1, dist: 0.1 },
      103: { normal: 14, traffic: 18, dist: 7.6 },
      104: { normal: 5, traffic: 6, dist: 1.8 }
    }
  },
  {
    id: 9007,
    name: 'Eastside Station',
    address: '1700 E 4th St, Austin, TX 78702',
    rent: 2050,
    url: 'https://www.apartments.com/eastside-station-austin-tx/w3r7t5e/',
    google_review_score: 4.2,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/FOCSA_Apartment_Type_A.jpg',
    notes: 'Trendy East Austin location. Pros: Walk to coffee shops, bars, light rail station. Cons: Weekend street noise.',
    latitude: 30.2618,
    longitude: -97.7244,
    bedrooms: 1,
    bathrooms: 1.0,
    created_at: '2026-07-15T12:06:00Z',
    criteriaValues: { 201: 0, 202: 1, 203: 1, 204: 1, 205: 0 },
    commutes: {
      101: { normal: 20, traffic: 30, dist: 11.2 },
      102: { normal: 4, traffic: 4, dist: 0.8 },
      103: { normal: 16, traffic: 20, dist: 9.2 },
      104: { normal: 10, traffic: 12, dist: 4.5 }
    }
  },
  {
    id: 9008,
    name: 'The Catherine',
    address: '214 Barton Springs Rd, Austin, TX 78704',
    rent: 2900,
    url: 'https://www.apartments.com/the-catherine-austin-tx/t3e2w8q/',
    google_review_score: 4.5,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/FOCSA_Apartment_Type_B.jpg',
    notes: 'Premium South Congress edge. Pros: Infinity pool, eco-friendly green features, walk to bridge views. Cons: High deposit.',
    latitude: 30.2605,
    longitude: -97.7471,
    bedrooms: 2,
    bathrooms: 2.0,
    created_at: '2026-07-15T12:07:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 0, 205: 0 },
    commutes: {
      101: { normal: 19, traffic: 28, dist: 10.8 },
      102: { normal: 3, traffic: 4, dist: 0.9 },
      103: { normal: 14, traffic: 18, dist: 7.2 },
      104: { normal: 3, traffic: 4, dist: 1.1 }
    }
  },
  {
    id: 9009,
    name: 'Avery Ranch Apartments',
    address: '14200 Avery Ranch Blvd, Austin, TX 78717',
    rent: 1750,
    url: 'https://www.apartments.com/avery-ranch-apartments-austin-tx/v3r5y8w/',
    google_review_score: 3.9,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/FOCSA_Apartment_Type_D.jpg',
    notes: 'Suburban community in far North Austin. Pros: Quiet golf course view, top school district. Cons: 20+ mile commute to downtown.',
    latitude: 30.4901,
    longitude: -97.7712,
    bedrooms: 2,
    bathrooms: 2.0,
    created_at: '2026-07-15T12:08:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 0, 205: 0 },
    commutes: {
      101: { normal: 12, traffic: 18, dist: 6.9 },
      102: { normal: 6, traffic: 6, dist: 1.8 },
      103: { normal: 18, traffic: 22, dist: 9.5 },
      104: { normal: 24, traffic: 32, dist: 18.2 }
    }
  },
  {
    id: 9010,
    name: 'RISE at Temple',
    address: '3908 S Lamar Blvd, Austin, TX 78704',
    rent: 1950,
    url: 'https://www.apartments.com/rise-apartments-austin-tx/y3w7t2w/',
    google_review_score: 4.0,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Baldwin_Spencer_Building_floor_plan.png',
    notes: 'South Lamar hub. Pros: Close to Barton Springs, walk to food trucks and coffee. Cons: Older building charm.',
    latitude: 30.2312,
    longitude: -97.7891,
    bedrooms: 1,
    bathrooms: 1.0,
    created_at: '2026-07-15T12:09:00Z',
    criteriaValues: { 201: 0, 202: 1, 203: 0, 204: 1, 205: 0 },
    commutes: {
      101: { normal: 22, traffic: 32, dist: 13.5 },
      102: { normal: 3, traffic: 3, dist: 0.7 },
      103: { normal: 10, traffic: 12, dist: 3.2 },
      104: { normal: 8, traffic: 10, dist: 3.1 }
    }
  },
  {
    id: 9011,
    name: 'AMLI Downtown',
    address: '201 Lavaca St, Austin, TX 78701',
    rent: 2700,
    url: 'https://www.apartments.com/amli-downtown-austin-tx/e3w7t4w/',
    google_review_score: 4.4,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Newburn_Flats_floor_plan.png',
    notes: 'Heart of the Second Street District. Pros: Extremely walkable, 24/7 concierge. Cons: Weekend street noise.',
    latitude: 30.2642,
    longitude: -97.7445,
    bedrooms: 2,
    bathrooms: 2.0,
    created_at: '2026-07-15T12:10:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 1, 205: 0 },
    commutes: {
      101: { normal: 18, traffic: 26, dist: 10.0 },
      102: { normal: 3, traffic: 3, dist: 0.5 },
      103: { normal: 13, traffic: 16, dist: 7.0 },
      104: { normal: 5, traffic: 6, dist: 1.4 }
    }
  },
  {
    id: 9012,
    name: 'Windsor Oak Hill',
    address: '7101 W Highway 290, Austin, TX 78736',
    rent: 1800,
    url: 'https://www.apartments.com/windsor-oak-hill-austin-tx/r3w7y5q/',
    google_review_score: 4.3,
    floorplan_image: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/FOCSA_Apartment_Type_A.jpg',
    notes: 'Southwest Austin green belt border. Pros: Hill Country views, large private dog park. Cons: High traffic peak hours on 290.',
    latitude: 30.2398,
    longitude: -97.8721,
    bedrooms: 2,
    bathrooms: 2.0,
    created_at: '2026-07-15T12:11:00Z',
    criteriaValues: { 201: 1, 202: 1, 203: 1, 204: 0, 205: 1 },
    commutes: {
      101: { normal: 26, traffic: 36, dist: 15.2 },
      102: { normal: 8, traffic: 10, dist: 4.5 },
      103: { normal: 12, traffic: 15, dist: 6.2 },
      104: { normal: 14, traffic: 18, dist: 8.5 }
    }
  }
];

module.exports = {
  demoPois,
  demoCriteria,
  demoApartments
};
