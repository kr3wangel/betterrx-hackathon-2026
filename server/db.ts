import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'

mkdirSync('data', { recursive: true })
mkdirSync('data/pods', { recursive: true })

export const db = new Database(process.env.DB_PATH ?? 'data/app.db')
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  address TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'sms',
  service_area TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS vendor_stats (
  vendor_id INTEGER NOT NULL,
  hcpcs_code TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  on_time_rate REAL NOT NULL,
  avg_delivery_hours REAL NOT NULL,
  sample_size INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  hcpcs_code TEXT NOT NULL,
  equipment_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  urgency TEXT NOT NULL DEFAULT 'routine',
  target_at TEXT,
  state TEXT NOT NULL DEFAULT 'ordered',
  eta_at TEXT,
  risk_score INTEGER,
  risk_reasons TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  order_id INTEGER,
  vendor_id INTEGER NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  parsed TEXT,
  confidence REAL,
  review_status TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS pods (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  photo_path TEXT,
  signature_path TEXT,
  condition TEXT,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS condition_reports (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'caregiver',
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_condition_vendor ON condition_reports (vendor_id);
CREATE INDEX IF NOT EXISTS idx_condition_order ON condition_reports (order_id);
`)

// Additive columns for the caregiver condition channel. Wrapped because teammates have
// existing dev databases that predate them and SQLite has no ADD COLUMN IF NOT EXISTS.
for (const stmt of [
  "ALTER TABLE patients ADD COLUMN caregiver_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE patients ADD COLUMN caregiver_phone TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE patients ADD COLUMN contact_ok INTEGER NOT NULL DEFAULT 1',
]) {
  try {
    db.exec(stmt)
  } catch {
    // column already present
  }
}
