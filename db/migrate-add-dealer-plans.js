'use strict';

/**
 * Migration: dealer membership plans (phase 1, no payments).
 *
 * Adds to dealerships:
 *   plan           TEXT    NOT NULL DEFAULT 'basic'   -- basic | pro | custom
 *   listing_limit  INTEGER NOT NULL DEFAULT 50        -- published listings allowed
 *
 * server.js applies the same change automatically at boot, so running this by hand is
 * only needed for a database the server has not started against yet.
 *
 *   node db/migrate-add-dealer-plans.js
 *
 * Uses Turso when TURSO_URL / TURSO_AUTH_TOKEN are set, otherwise the local carfox.db.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const Database = require('libsql');

const TURSO_URL = process.env.TURSO_URL || '';
const dbPath = TURSO_URL
  ? path.join(__dirname, '..', 'turso-replica.db')
  : path.join(__dirname, '..', 'carfox.db');
const db = TURSO_URL
  ? new Database(dbPath, { syncUrl: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN || '' })
  : new Database(dbPath);

if (TURSO_URL) db.sync();

function hasColumn(table, column) {
  return db.prepare('PRAGMA table_info(' + table + ')').all().some(function (c) { return c.name === column; });
}

const added = [];
if (!hasColumn('dealerships', 'plan')) {
  db.exec("ALTER TABLE dealerships ADD COLUMN plan TEXT NOT NULL DEFAULT 'basic';");
  added.push('plan');
}
if (!hasColumn('dealerships', 'listing_limit')) {
  db.exec('ALTER TABLE dealerships ADD COLUMN listing_limit INTEGER NOT NULL DEFAULT 50;');
  added.push('listing_limit');
}

if (TURSO_URL) db.sync();

console.log(added.length ? 'Migration complete: added ' + added.join(', ') + ' to dealerships.' : 'Nothing to do: dealerships already has plan and listing_limit.');
