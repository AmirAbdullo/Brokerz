const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'brokerz-secret-change-in-production';
const dbPath = path.join(__dirname, 'brokerz.db');
const db = new Database(dbPath);

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    portal TEXT NOT NULL CHECK(portal IN ('client', 'broker')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(email, portal)
  )
`);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(__dirname));

// Serve index.html at /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Optional: auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next();
  }
}

// POST /api/signup
app.post('/api/signup', (req, res) => {
  const { firstName, lastName, email, password, confirmPassword, portal } = req.body;

  if (!firstName || !lastName || !email || !password || !confirmPassword || !portal) {
    return res.status(400).json({
      error: 'Missing fields',
      details: 'First name, last name, email, password, confirm password, and portal are required.'
    });
  }

  if (portal !== 'client' && portal !== 'broker') {
    return res.status(400).json({ error: 'Invalid portal. Use "client" or "broker".' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const emailTrim = String(email).trim().toLowerCase();
  const firstNameTrim = String(firstName).trim();
  const lastNameTrim = String(lastName).trim();

  if (!emailTrim || !firstNameTrim || !lastNameTrim) {
    return res.status(400).json({ error: 'First name, last name, and email cannot be empty.' });
  }

  const password_hash = bcrypt.hashSync(password, 10);

  try {
    const stmt = db.prepare(`
      INSERT INTO users (first_name, last_name, email, password_hash, portal)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(firstNameTrim, lastNameTrim, emailTrim, password_hash, portal);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        error: 'An account with this email already exists for this portal.',
        code: 'EMAIL_EXISTS'
      });
    }
    throw err;
  }

  const row = db.prepare('SELECT id, first_name, last_name, email, portal, created_at FROM users WHERE email = ? AND portal = ?')
    .get(emailTrim, portal);

  const token = jwt.sign(
    { id: row.id, email: row.email, portal: row.portal },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    success: true,
    message: 'Account created.',
    token,
    user: {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      portal: row.portal
    }
  });
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { email, password, portal } = req.body;

  if (!email || !password || !portal) {
    return res.status(400).json({
      error: 'Email, password, and portal are required.'
    });
  }

  if (portal !== 'client' && portal !== 'broker') {
    return res.status(400).json({ error: 'Invalid portal. Use "client" or "broker".' });
  }

  const emailTrim = String(email).trim().toLowerCase();
  const row = db.prepare('SELECT id, first_name, last_name, email, password_hash, portal FROM users WHERE email = ? AND portal = ?')
    .get(emailTrim, portal);

  if (!row) {
    return res.status(401).json({ error: 'Invalid email or password for this portal.' });
  }

  const match = bcrypt.compareSync(password, row.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password for this portal.' });
  }

  const token = jwt.sign(
    { id: row.id, email: row.email, portal: row.portal },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      portal: row.portal
    }
  });
});

// GET /api/me — current user (optional, for future use)
app.get('/api/me', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });

  const row = db.prepare('SELECT id, first_name, last_name, email, portal, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!row) return res.status(401).json({ error: 'User not found.' });

  res.json({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    portal: row.portal,
    createdAt: row.created_at
  });
});

app.listen(PORT, () => {
  console.log('BrokerZ server running at http://localhost:' + PORT);
});
