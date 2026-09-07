'use strict';

/**
 * Migration: admin account suspension.
 *
 * Adds to dealerships and users:
 *   suspended          INTEGER NOT NULL DEFAULT 0
 *   suspension_reason  TEXT
 *   suspended_at       TEXT
 *
 * server.js applies the same change automatically at boot (case-insensitive column check,
 * tolerant of an existing column), so running this by hand is only needed for a database the
 * server has not started against yet.
 *
 *   node db/migrate-add-suspension.js
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
  const wanted = column.toLowerCase();
  return db.prepare('PRAGMA table_info(' + table + ')').all().some(function (c) {
    return String(c.name).toLowerCase() === wanted;
  });
}

const added = [];
[['dealerships', 'suspended', 'INTEGER NOT NULL DEFAULT 0'],
 ['dealerships', 'suspension_reason', 'TEXT'],
 ['dealerships', 'suspended_at', 'TEXT'],
 ['users', 'suspended', 'INTEGER NOT NULL DEFAULT 0'],
 ['users', 'suspension_reason', 'TEXT'],
 ['users', 'suspended_at', 'TEXT']].forEach(function (spec) {
  const table = spec[0], column = spec[1], definition = spec[2];
  if (hasColumn(table, column)) return;
  try {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition + ';');
    added.push(table + '.' + column);
  } catch (err) {
    if (!/duplicate column/i.test(String(err && err.message))) throw err;
  }
});

if (TURSO_URL) db.sync();

console.log(added.length ? 'Migration complete: added ' + added.join(', ') : 'Nothing to do: suspension columns already exist.');
