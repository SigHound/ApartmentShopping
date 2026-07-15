const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'apartments.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database at:', dbPath);
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) console.error('Pragma foreign keys error', err);
    });
    initializeDatabase();
  }
});

// Run a SQL query returning a promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

// Get single row from SQL query returning a promise
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Get all rows from SQL query returning a promise
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Initialize SQLite Schema
function initializeDatabase() {
  db.serialize(() => {
    // Settings table (stores API key, etc.)
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    // Apartments table
    db.run(`CREATE TABLE IF NOT EXISTS apartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      rent INTEGER,
      url TEXT,
      google_review_score REAL,
      floorplan_image TEXT,
      notes TEXT,
      latitude REAL,
      longitude REAL,
      bedrooms INTEGER,
      bathrooms REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // POIs (Points of Interest) table
    db.run(`CREATE TABLE IF NOT EXISTS pois (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Apartment-to-POI Commute Matrix
    db.run(`CREATE TABLE IF NOT EXISTS apartment_distances (
      apartment_id INTEGER,
      poi_id INTEGER,
      normal_time_mins INTEGER,
      rush_hour_time_mins INTEGER,
      distance_miles REAL,
      PRIMARY KEY (apartment_id, poi_id),
      FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
      FOREIGN KEY (poi_id) REFERENCES pois(id) ON DELETE CASCADE
    )`);

    // Migration for existing databases
    db.run(`ALTER TABLE apartment_distances RENAME COLUMN distance_km TO distance_miles;`, (err) => {
      // Safely ignore error if it fails (e.g. column already renamed, or table doesn't exist yet)
    });
    db.run(`ALTER TABLE apartments ADD COLUMN bedrooms INTEGER;`, (err) => {
      // Safely ignore error if column already exists
    });
    db.run(`ALTER TABLE apartments ADD COLUMN bathrooms REAL;`, (err) => {
      // Safely ignore error if column already exists
    });

    // Criteria table (Pros & Cons)
    db.run(`CREATE TABLE IF NOT EXISTS criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('pro', 'con'))
    )`);

    // User & Partner weights for criteria
    db.run(`CREATE TABLE IF NOT EXISTS criteria_weights (
      criteria_id INTEGER PRIMARY KEY,
      user_weight INTEGER DEFAULT 0,
      partner_weight INTEGER DEFAULT 0,
      FOREIGN KEY (criteria_id) REFERENCES criteria(id) ON DELETE CASCADE
    )`);

    // Apartment attributes linking table
    db.run(`CREATE TABLE IF NOT EXISTS apartment_criteria (
      apartment_id INTEGER,
      criteria_id INTEGER,
      value INTEGER DEFAULT 0, -- 0 for false, 1 for true
      PRIMARY KEY (apartment_id, criteria_id),
      FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
      FOREIGN KEY (criteria_id) REFERENCES criteria(id) ON DELETE CASCADE
    )`);

    // Clean out default criteria to let the user add their own
    db.run(`DELETE FROM criteria WHERE name IN (
      'Has Garage Parking', 'Nice Neighborhood / Safe', 'Good Layout / Floorplan', 
      'Modern Kitchen / Appliances', 'In-unit Washer/Dryer', 'Balcony or Patio', 
      'Allows Pets', 'Noisy Area', 'High Utility Costs', 'No Elevator (Upper floors)'
    )`);

    // Seed default POIs if none exist
    db.get("SELECT COUNT(*) as count FROM pois", (err, row) => {
      if (err) return;
      if (row.count === 0) {
        console.log('Seeding default POIs...');
        db.run("INSERT INTO pois (name, address) VALUES (?, ?)", ['Work', 'Downtown Office']);
        db.run("INSERT INTO pois (name, address) VALUES (?, ?)", ['Grocery Store', 'Nearest Supermarket']);
      }
    });

    console.log('Database schema initialization checked.');
  });
}

module.exports = {
  db,
  run,
  get,
  all
};
