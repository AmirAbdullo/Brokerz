'use strict';

/**
 * Database cleanup: removes blank drafts and test accounts (with everything they own).
 *
 * Connects exactly like server.js: with TURSO_URL + TURSO_AUTH_TOKEN set it works on the
 * production Turso database, otherwise on the local carfox.db.
 *
 * Usage:
 *   node scripts/cleanup-production.js                 # dry run: prints what would be deleted
 *   node scripts/cleanup-production.js --apply         # actually delete
 *   node scripts/cleanup-production.js --email a@x.com --email b@y.com   # extra accounts to remove
 *   node scripts/cleanup-production.js --pattern "%@test.com"           # extra SQL LIKE pattern
 *
 * What gets removed:
 *   1. Blank drafts: status = 'draft', empty make AND model, no photos (any dealer).
 *   2. Test accounts: emails LIKE 'e2e.%@example.com' plus any --email / --pattern matches,
 *      together with their dealerships, vehicles, photos (R2 objects too), conversations,
 *      messages, attachments, saved cars, inquiries, verification tokens and avatars.
 *
 * The seed accounts (admin@carfox.com, dealer@carfox.com, buyer@carfox.com) are never touched.
 * No transactions are used (Turso does not support them); deletes run child-rows-first.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const Database = require('libsql');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { r2, bucket: r2Bucket, publicUrl: r2PublicUrl } = require('../lib/r2');

const SEED_EMAILS = ['admin@carfox.com', 'dealer@carfox.com', 'buyer@carfox.com'];
const DEFAULT_PATTERNS = ['e2e.%@example.com'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const extraEmails = [];
const extraPatterns = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' && args[i + 1]) extraEmails.push(String(args[++i]).trim().toLowerCase());
  if (args[i] === '--pattern' && args[i + 1]) extraPatterns.push(String(args[++i]).trim().toLowerCase());
}

const TURSO_URL = process.env.TURSO_URL || '';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';
const dbPath = TURSO_URL
  ? path.join(__dirname, '..', 'turso-replica.db')
  : path.join(__dirname, '..', 'carfox.db');
const db = TURSO_URL
  ? new Database(dbPath, { syncUrl: TURSO_URL, authToken: TURSO_AUTH_TOKEN })
  : new Database(dbPath);

if (TURSO_URL) {
  db.sync();
  console.log('Connected to Turso (production) and synced.');
} else {
  console.log('Connected to local carfox.db (no TURSO_URL set).');
}
console.log(APPLY ? 'MODE: APPLY (rows will be deleted)' : 'MODE: DRY RUN (nothing will be deleted)');
console.log('');

function r2Configured() {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && r2Bucket && r2PublicUrl);
}

function urlToKey(url) {
  const base = String(r2PublicUrl || '').replace(new RegExp('/+$'), '');
  const u = String(url || '').trim();
  if (base && u.indexOf(base + '/') === 0) return u.slice(base.length + 1);
  try {
    return new URL(u).pathname.replace(new RegExp('^/'), '');
  } catch (_) {
    return null;
  }
}

async function deleteR2Objects(urls) {
  if (!urls.length) return 0;
  if (!r2Configured()) {
    console.log('  (R2 not configured: skipping ' + urls.length + ' object deletions)');
    return 0;
  }
  let n = 0;
  for (const url of urls) {
    const key = urlToKey(url);
    if (!key) continue;
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }));
      n++;
    } catch (e) {
      console.log('  R2 delete failed for ' + key + ': ' + (e && e.message));
    }
  }
  return n;
}

function placeholders(list) {
  return list.map(function () { return '?'; }).join(', ');
}

// ---------------------------------------------------------------------------
// 1. Test accounts
// ---------------------------------------------------------------------------
const patterns = DEFAULT_PATTERNS.concat(extraPatterns);
const userWhere = [];
const userParams = [];
patterns.forEach(function (p) { userWhere.push('LOWER(email) LIKE ?'); userParams.push(p); });
extraEmails.forEach(function (e) { userWhere.push('LOWER(email) = ?'); userParams.push(e); });

const testUsers = db
  .prepare(
    'SELECT id, email, full_name, role, avatar_url FROM users WHERE (' + userWhere.join(' OR ') +
    ') AND LOWER(email) NOT IN (' + placeholders(SEED_EMAILS) + ') ORDER BY id'
  )
  .all(...userParams, ...SEED_EMAILS);
const testUserIds = testUsers.map(function (u) { return u.id; });

const testDealerships = testUserIds.length
  ? db.prepare('SELECT id, user_id, business_name, status FROM dealerships WHERE user_id IN (' + placeholders(testUserIds) + ')').all(...testUserIds)
  : [];
const testDealershipIds = testDealerships.map(function (d) { return d.id; });

const testVehicles = testDealershipIds.length
  ? db.prepare('SELECT id, dealership_id, year, make, model, status FROM vehicles WHERE dealership_id IN (' + placeholders(testDealershipIds) + ')').all(...testDealershipIds)
  : [];
const testVehicleIds = testVehicles.map(function (v) { return v.id; });

// ---------------------------------------------------------------------------
// 2. Blank drafts (any dealer, including seed/real dealers)
// ---------------------------------------------------------------------------
const blankDrafts = db
  .prepare(
    "SELECT v.id, v.dealership_id, v.created_at FROM vehicles v WHERE v.status = 'draft'" +
    " AND TRIM(COALESCE(v.make, '')) = '' AND TRIM(COALESCE(v.model, '')) = ''" +
    ' AND NOT EXISTS (SELECT 1 FROM vehicle_photos p WHERE p.vehicle_id = v.id)' +
    (testVehicleIds.length ? ' AND v.id NOT IN (' + placeholders(testVehicleIds) + ')' : '') +
    ' ORDER BY v.id'
  )
  .all(...testVehicleIds);
const blankDraftIds = blankDrafts.map(function (v) { return v.id; });

// ---------------------------------------------------------------------------
// Related rows
// ---------------------------------------------------------------------------
const allVehicleIds = testVehicleIds.concat(blankDraftIds);

const photos = allVehicleIds.length
  ? db.prepare('SELECT id, vehicle_id, url FROM vehicle_photos WHERE vehicle_id IN (' + placeholders(allVehicleIds) + ')').all(...allVehicleIds)
  : [];

const convWhere = [];
const convParams = [];
if (testUserIds.length) { convWhere.push('buyer_id IN (' + placeholders(testUserIds) + ')'); convParams.push(...testUserIds); }
if (testDealershipIds.length) { convWhere.push('dealership_id IN (' + placeholders(testDealershipIds) + ')'); convParams.push(...testDealershipIds); }
if (allVehicleIds.length) { convWhere.push('vehicle_id IN (' + placeholders(allVehicleIds) + ')'); convParams.push(...allVehicleIds); }
const conversations = convWhere.length
  ? db.prepare('SELECT id, buyer_id, dealership_id, vehicle_id FROM conversations WHERE ' + convWhere.join(' OR ')).all(...convParams)
  : [];
const conversationIds = conversations.map(function (c) { return c.id; });

const messageIds = conversationIds.length
  ? db.prepare('SELECT id FROM messages WHERE conversation_id IN (' + placeholders(conversationIds) + ')').all(...conversationIds).map(function (m) { return m.id; })
  : [];
const attachments = messageIds.length
  ? db.prepare('SELECT id, url FROM message_attachments WHERE message_id IN (' + placeholders(messageIds) + ')').all(...messageIds)
  : [];

const savedCarsCount = (function () {
  const w = [];
  const p = [];
  if (testUserIds.length) { w.push('buyer_id IN (' + placeholders(testUserIds) + ')'); p.push(...testUserIds); }
  if (allVehicleIds.length) { w.push('vehicle_id IN (' + placeholders(allVehicleIds) + ')'); p.push(...allVehicleIds); }
  if (!w.length) return 0;
  return db.prepare('SELECT COUNT(*) AS c FROM saved_cars WHERE ' + w.join(' OR ')).get(...p).c;
})();

const inquiriesCount = (function () {
  const w = [];
  const p = [];
  if (testDealershipIds.length) { w.push('dealership_id IN (' + placeholders(testDealershipIds) + ')'); p.push(...testDealershipIds); }
  if (allVehicleIds.length) { w.push('vehicle_id IN (' + placeholders(allVehicleIds) + ')'); p.push(...allVehicleIds); }
  if (testUsers.length) { w.push('LOWER(buyer_email) IN (' + placeholders(testUsers) + ')'); p.push(...testUsers.map(function (u) { return u.email.toLowerCase(); })); }
  if (!w.length) return 0;
  return db.prepare('SELECT COUNT(*) AS c FROM inquiries WHERE ' + w.join(' OR ')).get(...p).c;
})();

const tokensCount = testUserIds.length
  ? db.prepare('SELECT COUNT(*) AS c FROM email_verification_tokens WHERE user_id IN (' + placeholders(testUserIds) + ')').get(...testUserIds).c
  : 0;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('Test accounts to delete (' + testUsers.length + '):');
testUsers.forEach(function (u) { console.log('  #' + u.id + ' ' + u.email + ' [' + u.role + '] ' + u.full_name); });
console.log('  dealerships: ' + testDealerships.map(function (d) { return '#' + d.id + ' ' + d.business_name + ' (' + d.status + ')'; }).join(', ') || '  dealerships: none');
console.log('  their vehicles (' + testVehicles.length + '): ' + testVehicles.map(function (v) { return '#' + v.id + ' ' + [v.year, v.make, v.model].filter(Boolean).join(' ') + ' (' + v.status + ')'; }).join(', '));
console.log('');
console.log('Blank drafts to delete (' + blankDrafts.length + '): ' + blankDrafts.map(function (v) { return '#' + v.id + ' (dealership ' + v.dealership_id + ')'; }).join(', '));
console.log('');
console.log('Related rows: photos=' + photos.length + ' conversations=' + conversations.length + ' messages=' + messageIds.length +
  ' attachments=' + attachments.length + ' saved_cars=' + savedCarsCount + ' inquiries=' + inquiriesCount + ' verification_tokens=' + tokensCount);
console.log('R2 objects: ' + (photos.length + attachments.length + testUsers.filter(function (u) { return u.avatar_url; }).length));
console.log('');

if (!APPLY) {
  console.log('Dry run complete. Re-run with --apply to delete the above.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Apply (children first; no transaction for Turso compatibility)
// ---------------------------------------------------------------------------
(async function apply() {
  const r2Urls = photos.map(function (p) { return p.url; })
    .concat(attachments.map(function (a) { return a.url; }))
    .concat(testUsers.map(function (u) { return u.avatar_url; }).filter(Boolean));

  if (attachments.length) db.prepare('DELETE FROM message_attachments WHERE id IN (' + placeholders(attachments) + ')').run(...attachments.map(function (a) { return a.id; }));
  if (messageIds.length) db.prepare('DELETE FROM messages WHERE id IN (' + placeholders(messageIds) + ')').run(...messageIds);
  if (conversationIds.length) db.prepare('DELETE FROM conversations WHERE id IN (' + placeholders(conversationIds) + ')').run(...conversationIds);

  if (allVehicleIds.length) {
    db.prepare('DELETE FROM saved_cars WHERE vehicle_id IN (' + placeholders(allVehicleIds) + ')').run(...allVehicleIds);
    db.prepare('DELETE FROM inquiries WHERE vehicle_id IN (' + placeholders(allVehicleIds) + ')').run(...allVehicleIds);
    db.prepare('DELETE FROM vehicle_photos WHERE vehicle_id IN (' + placeholders(allVehicleIds) + ')').run(...allVehicleIds);
    db.prepare('DELETE FROM vehicles WHERE id IN (' + placeholders(allVehicleIds) + ')').run(...allVehicleIds);
  }
  if (testUserIds.length) {
    db.prepare('DELETE FROM saved_cars WHERE buyer_id IN (' + placeholders(testUserIds) + ')').run(...testUserIds);
    db.prepare('DELETE FROM inquiries WHERE LOWER(buyer_email) IN (' + placeholders(testUsers) + ')').run(...testUsers.map(function (u) { return u.email.toLowerCase(); }));
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id IN (' + placeholders(testUserIds) + ')').run(...testUserIds);
  }
  if (testDealershipIds.length) {
    db.prepare('DELETE FROM inquiries WHERE dealership_id IN (' + placeholders(testDealershipIds) + ')').run(...testDealershipIds);
    db.prepare('DELETE FROM dealerships WHERE id IN (' + placeholders(testDealershipIds) + ')').run(...testDealershipIds);
  }
  if (testUserIds.length) db.prepare('DELETE FROM users WHERE id IN (' + placeholders(testUserIds) + ')').run(...testUserIds);

  if (TURSO_URL) {
    db.sync();
    console.log('Synced deletions to Turso.');
  }

  const deletedObjects = await deleteR2Objects(r2Urls);
  console.log('Deleted ' + deletedObjects + ' R2 objects.');

  const remainingUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const remainingBlank = db.prepare("SELECT COUNT(*) AS c FROM vehicles v WHERE v.status = 'draft' AND TRIM(COALESCE(v.make, '')) = '' AND TRIM(COALESCE(v.model, '')) = '' AND NOT EXISTS (SELECT 1 FROM vehicle_photos p WHERE p.vehicle_id = v.id)").get().c;
  console.log('Done. Users remaining: ' + remainingUsers + '. Blank drafts remaining: ' + remainingBlank + '.');
})().catch(function (err) {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
