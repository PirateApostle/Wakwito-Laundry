import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import express from 'express';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const cookieName = 'wakwito_session';
const jwtSecret = process.env.JWT_SECRET || (!isProduction ? crypto.randomBytes(48).toString('hex') : null);
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '.data', 'wakwito.sqlite');

if (!jwtSecret) {
  throw new Error('Set JWT_SECRET before starting the server in production.');
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'ADMIN', 'DRIVER')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL UNIQUE,
    customer_user_id INTEGER NOT NULL REFERENCES users(id),
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    fulfillment TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    eta TEXT NOT NULL DEFAULT 'Awaiting confirmation',
    notes TEXT NOT NULL DEFAULT '',
    items_json TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    service_fee INTEGER NOT NULL,
    total INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS orders_customer_user_id_idx ON orders(customer_user_id);
`);

const userColumns = new Set(database.pragma('table_info(users)').map((column) => column.name));
if (!userColumns.has('username')) database.exec('ALTER TABLE users ADD COLUMN username TEXT');
if (!userColumns.has('location')) database.exec("ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT ''");
if (!userColumns.has('profile_photo')) database.exec('ALTER TABLE users ADD COLUMN profile_photo TEXT');

function usernameFromEmail(email) {
  const localPart = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return (localPart.length >= 3 ? localPart : `user_${localPart}`).slice(0, 24);
}

const existingUsernames = new Set(
  database.prepare('SELECT username FROM users WHERE username IS NOT NULL').all()
    .map(({ username }) => username.toLowerCase()),
);
const updateUsername = database.prepare('UPDATE users SET username = ? WHERE id = ?');
for (const user of database.prepare('SELECT id, email FROM users WHERE username IS NULL ORDER BY id').all()) {
  const base = usernameFromEmail(user.email);
  let username = base;
  let suffix = 2;
  while (existingUsernames.has(username.toLowerCase())) {
    const suffixText = String(suffix++);
    username = `${base.slice(0, 24 - suffixText.length)}${suffixText}`;
  }
  updateUsername.run(username, user.id);
  existingUsernames.add(username.toLowerCase());
}
database.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users(username COLLATE NOCASE)');

const serviceCatalog = {
  washing: { name: 'Washing', pricePerKg: 99 },
  'dry-cleaning': { name: 'Dry Cleaning', pricePerKg: 180 },
  ironing: { name: 'Ironing', pricePerKg: 120 },
  'duvet-cleaning': { name: 'Duvet Cleaning', pricePerKg: 260 },
  'curtain-cleaning': { name: 'Curtain Cleaning', pricePerKg: 220 },
  'carpet-cleaning': { name: 'Carpet Cleaning', pricePerKg: 310 },
};

const validFulfillment = new Set(['Customer Drop-off', 'Pickup', 'Delivery', 'Pickup + Delivery']);
const validPaymentMethods = new Set(['M-Pesa', 'Cash']);
const validOrderStatuses = new Set(['Pending', 'In Progress', 'Picked Up', 'Completed']);

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    username: user.username,
    location: user.location,
    profilePhoto: user.profile_photo,
  };
}

function makeUniqueUsername(email) {
  const base = usernameFromEmail(email);
  let username = base;
  let suffix = 2;
  while (database.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
    const suffixText = String(suffix++);
    username = `${base.slice(0, 24 - suffixText.length)}${suffixText}`;
  }
  return username;
}

function sendError(response, status, message) {
  return response.status(status).json({ error: message });
}

function normalizeOrder(row) {
  return {
    id: row.order_code,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    phone: row.phone,
    address: row.address,
    fulfillment: row.fulfillment,
    paymentMethod: row.payment_method,
    status: row.status,
    eta: row.eta,
    notes: row.notes,
    items: JSON.parse(row.items_json),
    subtotal: row.subtotal,
    serviceFee: row.service_fee,
    total: row.total,
    createdAt: row.created_at,
  };
}

function authenticate(request, response, next) {
  const token = request.cookies[cookieName];
  if (!token) return sendError(response, 401, 'Please sign in to continue.');

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = database.prepare(`
      SELECT id, name, email, phone, role, username, location, profile_photo
      FROM users WHERE id = ?
    `).get(payload.sub);
    if (!user) return sendError(response, 401, 'Your session is no longer valid. Please sign in again.');
    request.user = user;
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
      return sendError(response, 401, 'Your session has expired. Please sign in again.');
    }
    return next(error);
  }
}

function authorize(...roles) {
  return (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return sendError(response, 403, 'You do not have permission to perform this action.');
    }
    return next();
  };
}

function setSessionCookie(response, user, remember = true) {
  const expiresIn = remember ? '7d' : '12h';
  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn });
  response.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: remember ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000,
  });
}

function seedUser({ name, email, phone, password, role }) {
  const existingUser = database.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) return existingUser.id;
  const result = database.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, username)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, email, phone, bcrypt.hashSync(password, 12), role, makeUniqueUsername(email));
  return Number(result.lastInsertRowid);
}

function seedDemoData() {
  if (isProduction) {
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      seedUser({
        name: process.env.ADMIN_NAME || 'Wakwito Administrator',
        email: process.env.ADMIN_EMAIL,
        phone: process.env.ADMIN_PHONE || '0000000000',
        password: process.env.ADMIN_PASSWORD,
        role: 'ADMIN',
      });
    }
    return;
  }

  const customerId = seedUser({
    name: 'Mainoo Kibet',
    email: 'mainoo@wakwito.co.ke',
    phone: '0712345678',
    password: 'demo123',
    role: 'CUSTOMER',
  });
  seedUser({
    name: 'Amina Wanjiku',
    email: 'admin@wakwito.co.ke',
    phone: '0700000000',
    password: 'admin123',
    role: 'ADMIN',
  });
  seedUser({
    name: 'Moses Kariuki',
    email: 'driver@wakwito.co.ke',
    phone: '0723456789',
    password: 'driver123',
    role: 'DRIVER',
  });

  const existingOrders = database.prepare('SELECT COUNT(*) AS count FROM orders').get().count;
  if (existingOrders > 0) return;

  const samples = [
    {
      code: 'WK-1024',
      customerName: 'Mainoo Kibet',
      email: 'mainoo@wakwito.co.ke',
      phone: '0712345678',
      address: 'Nairobi West, Nairobi',
      fulfillment: 'Pickup + Delivery',
      payment: 'M-Pesa',
      status: 'In Progress',
      eta: 'Pickup in 2h',
      items: [{ id: 'washing', name: 'Washing', kg: 2, quantity: 1, price: 198 }],
      total: 214,
      created: '2026-10-05T09:45:00.000Z',
    },
    {
      code: 'WK-1019',
      customerName: 'Mainoo Kibet',
      email: 'mainoo@wakwito.co.ke',
      phone: '0712345678',
      address: 'Kilimani, Nairobi',
      fulfillment: 'Customer Drop-off',
      payment: 'Cash',
      status: 'Picked Up',
      eta: 'Dry clean finishing',
      items: [{ id: 'dry-cleaning', name: 'Dry Cleaning', kg: 1.5, quantity: 1, price: 270 }],
      total: 292,
      created: '2026-10-04T18:20:00.000Z',
    },
    {
      code: 'WK-1008',
      customerName: 'Mainoo Kibet',
      email: 'mainoo@wakwito.co.ke',
      phone: '0712345678',
      address: 'Westlands, Nairobi',
      fulfillment: 'Delivery',
      payment: 'M-Pesa',
      status: 'Completed',
      eta: 'Delivered',
      items: [{ id: 'curtain-cleaning', name: 'Curtain Cleaning', kg: 2, quantity: 1, price: 440 }],
      total: 475,
      created: '2026-10-02T11:00:00.000Z',
    },
  ];
  const insertOrder = database.prepare(`
    INSERT INTO orders (
      order_code, customer_user_id, customer_name, customer_email, phone, address,
      fulfillment, payment_method, status, eta, items_json, subtotal, service_fee,
      total, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const order of samples) {
    const subtotal = order.items.reduce((sum, item) => sum + item.price, 0);
    insertOrder.run(
      order.code,
      customerId,
      order.customerName,
      order.email,
      order.phone,
      order.address,
      order.fulfillment,
      order.payment,
      order.status,
      order.eta,
      JSON.stringify(order.items),
      subtotal,
      order.total - subtotal,
      order.total,
      order.created,
    );
  }
}

seedDemoData();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'wakwito-api' });
});

app.post('/api/auth/login', (request, response) => {
  const identifier = String(request.body?.identifier || '').trim();
  const password = String(request.body?.password || '');
  if (!identifier || !password) return sendError(response, 400, 'Email/phone and password are required.');

  const user = database.prepare(`
    SELECT id, name, email, phone, role, username, location, profile_photo, password_hash
    FROM users
    WHERE email = ? COLLATE NOCASE OR phone = ? OR username = ? COLLATE NOCASE
  `).get(identifier, identifier, identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return sendError(response, 401, 'Incorrect email, phone, username, or password.');
  }

  setSessionCookie(response, user, request.body?.remember !== false);
  return response.json({ user: publicUser(user) });
});

app.post('/api/auth/signup', (request, response) => {
  const name = String(request.body?.name || '').trim();
  const email = String(request.body?.email || '').trim().toLowerCase();
  const phone = String(request.body?.phone || '').trim();
  const password = String(request.body?.password || '');

  if (!name || name.length > 100) return sendError(response, 400, 'Enter a valid full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(response, 400, 'Enter a valid email address.');
  if (!/^[+]?[\d\s()-]{7,20}$/.test(phone)) return sendError(response, 400, 'Enter a valid phone number.');
  if (password.length < 8) return sendError(response, 400, 'Password must be at least 8 characters.');

  try {
    const result = database.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role, username)
      VALUES (?, ?, ?, ?, 'CUSTOMER', ?)
    `).run(name, email, phone, bcrypt.hashSync(password, 12), makeUniqueUsername(email));
    const user = database.prepare('SELECT id, name, email, phone, role, username, location, profile_photo FROM users WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    setSessionCookie(response, user);
    return response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(response, 409, 'An account already exists with that email or phone number.');
    }
    throw error;
  }
});

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
  return response.json({ success: true });
});

app.get('/api/auth/me', authenticate, (request, response) => {
  response.json({ user: publicUser(request.user) });
});

app.put('/api/auth/profile', authenticate, (request, response) => {
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
  const username = typeof request.body?.username === 'string' ? request.body.username.trim().toLowerCase() : '';
  const phone = typeof request.body?.phone === 'string' ? request.body.phone.trim() : '';
  const location = typeof request.body?.location === 'string' ? request.body.location.trim() : '';
  const profilePhoto = request.body?.profilePhoto;

  if (!name || name.length > 100) return sendError(response, 400, 'Enter a valid full name.');
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return sendError(response, 400, 'Username must be 3–24 characters using letters, numbers, or underscores.');
  }
  if (!/^[+]?[\d\s()-]{7,20}$/.test(phone)) return sendError(response, 400, 'Enter a valid phone number.');
  if (location.length > 240) return sendError(response, 400, 'Location must be 240 characters or fewer.');

  let photo = request.user.profile_photo;
  if (profilePhoto === null) {
    photo = null;
  } else if (typeof profilePhoto === 'string') {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(profilePhoto);
    if (!match) return sendError(response, 400, 'Choose a PNG, JPEG, or WebP profile photo.');
    const imageBytes = Buffer.from(match[2], 'base64');
    if (imageBytes.length > 512 * 1024 || imageBytes.toString('base64') !== match[2]) {
      return sendError(response, 400, 'Profile photos must be valid images no larger than 512 KB.');
    }
    const signatureMatches = match[1] === 'png'
      ? imageBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : match[1] === 'jpeg'
        ? imageBytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        : imageBytes.toString('ascii', 0, 4) === 'RIFF' && imageBytes.toString('ascii', 8, 12) === 'WEBP';
    if (!signatureMatches) return sendError(response, 400, 'The selected file is not a valid PNG, JPEG, or WebP image.');
    photo = profilePhoto;
  } else if (profilePhoto !== undefined) {
    return sendError(response, 400, 'Profile photo is invalid.');
  }

  const conflictingUser = database.prepare(`
    SELECT username FROM users
    WHERE (username = ? COLLATE NOCASE OR phone = ?) AND id != ?
  `).get(username, phone, request.user.id);
  if (conflictingUser) {
    return sendError(response, 409, conflictingUser.username?.toLowerCase() === username
      ? 'That username is already in use.'
      : 'That phone number is already in use.');
  }

  try {
    database.prepare(`
      UPDATE users SET name = ?, username = ?, phone = ?, location = ?, profile_photo = ?
      WHERE id = ?
    `).run(name, username, phone, location, photo, request.user.id);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(response, 409, 'That username or phone number is already in use.');
    }
    throw error;
  }

  const user = database.prepare(`
    SELECT id, name, email, phone, role, username, location, profile_photo
    FROM users WHERE id = ?
  `).get(request.user.id);
  return response.json({ user: publicUser(user) });
});

app.get('/api/orders', authenticate, (request, response) => {
  const orders = request.user.role === 'CUSTOMER'
    ? database.prepare('SELECT * FROM orders WHERE customer_user_id = ? ORDER BY created_at DESC, id DESC')
      .all(request.user.id)
    : database.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all();
  response.json({ orders: orders.map(normalizeOrder) });
});

app.post('/api/orders', authenticate, authorize('CUSTOMER'), (request, response) => {
  const { address, fulfillment, paymentMethod, notes = '', items } = request.body || {};
  if (typeof address !== 'string' || address.trim().length < 4 || address.length > 240) {
    return sendError(response, 400, 'Enter a valid pickup or delivery address.');
  }
  if (!validFulfillment.has(fulfillment)) return sendError(response, 400, 'Choose a valid fulfillment option.');
  if (!validPaymentMethods.has(paymentMethod)) return sendError(response, 400, 'Choose a valid payment method.');
  if (typeof notes !== 'string' || notes.length > 1000) return sendError(response, 400, 'Special instructions must be under 1,000 characters.');
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
    return sendError(response, 400, 'An order must contain between 1 and 30 service items.');
  }

  const normalizedItems = [];
  for (const item of items) {
    const service = serviceCatalog[item?.id];
    const kg = Number(item?.kg);
    const quantity = Number(item?.quantity);
    if (!service || !Number.isFinite(kg) || kg < 0.5 || kg > 100 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return sendError(response, 400, 'One or more order items are invalid.');
    }
    normalizedItems.push({
      id: item.id,
      name: service.name,
      kg,
      quantity,
      unitPrice: service.pricePerKg,
      price: Math.round(service.pricePerKg * kg * quantity),
    });
  }

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.price, 0);
  const serviceFee = Math.round(subtotal * 0.08);
  const total = subtotal + serviceFee;
  const orderCount = database.prepare('SELECT COUNT(*) AS count FROM orders').get().count;
  let orderCode = `WK-${String(Number(orderCount) + 1001).padStart(4, '0')}`;
  while (database.prepare('SELECT 1 FROM orders WHERE order_code = ?').get(orderCode)) {
    orderCode = `WK-${String(Number(orderCode.slice(3)) + 1).padStart(4, '0')}`;
  }
  const customerName = String(request.body?.customerName || request.user.name).trim();
  const phone = String(request.body?.phone || request.user.phone).trim();
  if (!customerName || customerName.length > 100) return sendError(response, 400, 'Enter a valid customer name.');
  if (!/^[+]?[\d\s()-]{7,20}$/.test(phone)) return sendError(response, 400, 'Enter a valid phone number.');
  const insert = database.prepare(`
    INSERT INTO orders (
      order_code, customer_user_id, customer_name, customer_email, phone, address,
      fulfillment, payment_method, notes, items_json, subtotal, service_fee, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = insert.run(
    orderCode,
    request.user.id,
    customerName,
    request.user.email,
    phone,
    address.trim(),
    fulfillment,
    paymentMethod,
    notes.trim(),
    JSON.stringify(normalizedItems),
    subtotal,
    serviceFee,
    total,
  );
  const order = database.prepare('SELECT * FROM orders WHERE id = ?').get(Number(result.lastInsertRowid));
  return response.status(201).json({ order: normalizeOrder(order) });
});

app.patch('/api/orders/:orderCode/status', authenticate, authorize('ADMIN'), (request, response) => {
  const status = request.body?.status;
  if (!validOrderStatuses.has(status)) return sendError(response, 400, 'Choose a valid order status.');

  const eta = status === 'Completed'
    ? 'Delivered'
    : status === 'Picked Up'
      ? 'On route'
      : status === 'In Progress'
        ? 'Pickup in 2h'
        : 'Awaiting confirmation';
  const result = database.prepare('UPDATE orders SET status = ?, eta = ? WHERE order_code = ?')
    .run(status, eta, request.params.orderCode);
  if (result.changes === 0) return sendError(response, 404, 'Order not found.');

  const order = database.prepare('SELECT * FROM orders WHERE order_code = ?').get(request.params.orderCode);
  return response.json({ order: normalizeOrder(order) });
});

app.use('/api', (_request, response) => sendError(response, 404, 'API endpoint not found.'));

if (isProduction) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get(/.*/, (_request, response, next) => {
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      return sendError(response, 503, 'Frontend build is missing. Run npm run build first.');
    }
    return response.sendFile(path.join(distPath, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  if (response.headersSent) return;
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Wakwito API listening on http://localhost:${port}`);
});
