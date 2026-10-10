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
const smsProviderKeys = ['AT_USERNAME', 'AT_API_KEY'];
const emailProviderKeys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
const isProviderConfigured = (keys) => keys.every((key) => Boolean(process.env[key]));
const isProviderPartiallyConfigured = (keys) => keys.some((key) => Boolean(process.env[key])) && !isProviderConfigured(keys);
if (isProviderPartiallyConfigured(smsProviderKeys)) {
  throw new Error(`Configure all Africa's Talking settings together: ${smsProviderKeys.filter((key) => !process.env[key]).join(', ')}.`);
}
if (isProviderPartiallyConfigured(emailProviderKeys)) {
  throw new Error(`Configure all SMTP settings together: ${emailProviderKeys.filter((key) => !process.env[key]).join(', ')}.`);
}
const smsConfig = isProviderConfigured(smsProviderKeys)
  ? {
      username: process.env.AT_USERNAME,
      apiKey: process.env.AT_API_KEY,
      senderId: process.env.AT_SENDER_ID,
      baseUrl: process.env.AT_ENV === 'production'
        ? 'https://api.africastalking.com'
        : 'https://api.sandbox.africastalking.com',
    }
  : null;
const emailConfig = isProviderConfigured(emailProviderKeys)
  ? {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM,
    }
  : null;
if (emailConfig && (!Number.isInteger(emailConfig.port) || emailConfig.port < 1 || emailConfig.port > 65535)) {
  throw new Error('SMTP_PORT must be a valid TCP port number.');
}
const mpesaEnvironment = process.env.MPESA_ENV || 'sandbox';
const mpesaConfigKeys = [
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORTCODE',
  'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL',
];
const configuredMpesaKeys = mpesaConfigKeys.filter((key) => process.env[key]);
if (configuredMpesaKeys.length > 0 && configuredMpesaKeys.length !== mpesaConfigKeys.length) {
  throw new Error(`Configure all M-Pesa settings together: ${mpesaConfigKeys.filter((key) => !process.env[key]).join(', ')}.`);
}
if (!['sandbox', 'production'].includes(mpesaEnvironment)) {
  throw new Error('MPESA_ENV must be either "sandbox" or "production".');
}
const mpesaTransactionType = process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline';
if (!['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'].includes(mpesaTransactionType)) {
  throw new Error('MPESA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline.');
}
const mpesaConfig = configuredMpesaKeys.length === mpesaConfigKeys.length
  ? {
      consumerKey: process.env.MPESA_CONSUMER_KEY,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET,
      shortcode: process.env.MPESA_SHORTCODE,
      passkey: process.env.MPESA_PASSKEY,
      callbackUrl: process.env.MPESA_CALLBACK_URL,
      transactionType: mpesaTransactionType,
      baseUrl: mpesaEnvironment === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke',
    }
  : null;

if (mpesaConfig) {
  const callbackUrl = new URL(mpesaConfig.callbackUrl);
  if (callbackUrl.protocol !== 'https:' || !callbackUrl.pathname.endsWith('/api/payments/mpesa/callback')) {
    throw new Error('MPESA_CALLBACK_URL must be an HTTPS URL ending in /api/payments/mpesa/callback.');
  }
}

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
    map_url TEXT,
    scheduled_date TEXT,
    time_slot TEXT,
    payment_timing TEXT NOT NULL DEFAULT 'DELIVERY',
    payment_status TEXT NOT NULL DEFAULT 'UNPAID',
    mpesa_checkout_request_id TEXT,
    mpesa_merchant_request_id TEXT,
    mpesa_receipt TEXT,
    mpesa_phone TEXT,
    terms_accepted_at TEXT,
    terms_version TEXT,
    items_json TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    service_fee INTEGER NOT NULL,
    total INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS orders_customer_user_id_idx ON orders(customer_user_id);
`);

const orderColumns = new Set(database.pragma('table_info(orders)').map((column) => column.name));
if (!orderColumns.has('map_url')) database.exec('ALTER TABLE orders ADD COLUMN map_url TEXT');
if (!orderColumns.has('scheduled_date')) database.exec('ALTER TABLE orders ADD COLUMN scheduled_date TEXT');
if (!orderColumns.has('time_slot')) database.exec('ALTER TABLE orders ADD COLUMN time_slot TEXT');
if (!orderColumns.has('payment_timing')) database.exec("ALTER TABLE orders ADD COLUMN payment_timing TEXT NOT NULL DEFAULT 'DELIVERY'");
if (!orderColumns.has('payment_status')) database.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID'");
if (!orderColumns.has('mpesa_checkout_request_id')) database.exec('ALTER TABLE orders ADD COLUMN mpesa_checkout_request_id TEXT');
if (!orderColumns.has('mpesa_merchant_request_id')) database.exec('ALTER TABLE orders ADD COLUMN mpesa_merchant_request_id TEXT');
if (!orderColumns.has('mpesa_receipt')) database.exec('ALTER TABLE orders ADD COLUMN mpesa_receipt TEXT');
if (!orderColumns.has('mpesa_phone')) database.exec('ALTER TABLE orders ADD COLUMN mpesa_phone TEXT');
if (!orderColumns.has('terms_accepted_at')) database.exec('ALTER TABLE orders ADD COLUMN terms_accepted_at TEXT');
if (!orderColumns.has('terms_version')) database.exec('ALTER TABLE orders ADD COLUMN terms_version TEXT');
database.exec('CREATE UNIQUE INDEX IF NOT EXISTS orders_mpesa_checkout_request_unique_idx ON orders(mpesa_checkout_request_id) WHERE mpesa_checkout_request_id IS NOT NULL');
database.prepare(`
  UPDATE orders SET payment_timing = 'ORDER'
  WHERE payment_method = 'M-Pesa' AND payment_timing = 'DELIVERY' AND payment_status = 'UNPAID'
`).run();
database.exec(`
  CREATE TABLE IF NOT EXISTS approval_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('SMS', 'EMAIL')),
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED')),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (order_id, channel)
  )
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
const validPaymentTimings = new Set(['ORDER', 'DELIVERY']);
const policyVersion = '2026-10-10';
const termsUrl = process.env.PUBLIC_SITE_URL || 'https://wakwito-laundry.onrender.com';
const validTimeSlots = new Set(['Morning (8am–12pm)', 'Afternoon (12pm–4pm)', 'Evening (4pm–7pm)']);
const validOrderStatuses = new Set(['Pending', 'In Progress', 'Picked Up', 'Completed']);

function todayInNairobi() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidFutureDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === date
    && date > todayInNairobi();
}

function isGoogleMapsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const allowedHost = ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(url.hostname);
    const validMapsPath = url.hostname === 'maps.app.goo.gl'
      || url.pathname === '/'
      || url.pathname.startsWith('/maps');
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && allowedHost
      && validMapsPath;
  } catch {
    return false;
  }
}

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
  const approvalNotifications = database.prepare(`
    SELECT channel, status FROM approval_notifications WHERE order_id = ?
  `).all(row.id);
  return {
    id: row.order_code,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    phone: row.phone,
    address: row.address,
    mapUrl: row.map_url,
    fulfillment: row.fulfillment,
    paymentMethod: row.payment_method,
    paymentTiming: row.payment_timing,
    paymentStatus: row.payment_status,
    mpesaReceipt: row.mpesa_receipt,
    approvalNotifications,
    scheduledDate: row.scheduled_date,
    timeSlot: row.time_slot,
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

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function sendApprovalSms(order) {
  if (!smsConfig) throw new Error('Africa’s Talking SMS is not configured.');
  const phone = normalizeKenyanPhone(order.phone);
  if (!phone) throw new Error('Customer phone number is not a valid Kenyan mobile number.');
  const message = `Wakwito: Order ${order.order_code} is approved. Our team is now working on your laundry. Track it at ${termsUrl}/#/order-tracking.`;
  const form = new URLSearchParams({
    username: smsConfig.username,
    to: `+${phone}`,
    message,
  });
  if (smsConfig.senderId) form.set('from', smsConfig.senderId);
  const response = await fetch(`${smsConfig.baseUrl}/version1/messaging`, {
    method: 'POST',
    headers: {
      apiKey: smsConfig.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  const recipient = payload.SMSMessageData?.Recipients?.[0];
  if (!response.ok || recipient?.statusCode !== 101) {
    throw new Error('Africa’s Talking did not confirm SMS delivery.');
  }
}

async function sendApprovalEmail(order) {
  if (!emailConfig) throw new Error('SMTP email is not configured.');
  const { default: nodemailer } = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: { user: emailConfig.user, pass: emailConfig.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  const safeName = escapeHtml(order.customer_name);
  const safeCode = escapeHtml(order.order_code);
  try {
    await transporter.sendMail({
      from: emailConfig.from,
      to: order.customer_email,
      subject: `Your Wakwito order ${order.order_code} is approved`,
      text: `Hello ${order.customer_name}, your order ${order.order_code} has been approved. Our team is now working on your laundry. Track your order at ${termsUrl}/#/order-tracking.`,
      html: `<p>Hello ${safeName},</p><p>Your order <strong>${safeCode}</strong> has been approved. Our team is now working on your laundry.</p><p><a href="${termsUrl}/#/order-tracking">Track your order</a></p>`,
    });
  } finally {
    transporter.close();
  }
}

async function notifyOrderApproved(order) {
  const channels = [
    { name: 'SMS', configured: Boolean(smsConfig), send: sendApprovalSms },
    { name: 'EMAIL', configured: Boolean(emailConfig), send: sendApprovalEmail },
  ];

  await Promise.all(channels.map(async ({ name, configured, send }) => {
    const existing = database.prepare(`
      SELECT id, status FROM approval_notifications WHERE order_id = ? AND channel = ?
    `).get(order.id, name);
    if (existing?.status === 'SENT' || existing?.status === 'PENDING') return;
    if (existing) {
      database.prepare(`
        UPDATE approval_notifications SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(existing.id);
    } else {
      database.prepare(`
        INSERT INTO approval_notifications (order_id, channel, status) VALUES (?, ?, 'PENDING')
      `).run(order.id, name);
    }

    try {
      if (!configured) throw new Error(`${name} provider is not configured.`);
      await send(order);
      database.prepare(`
        UPDATE approval_notifications SET status = 'SENT', updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND channel = ?
      `).run(order.id, name);
    } catch (error) {
      const status = configured ? 'FAILED' : 'NOT_CONFIGURED';
      database.prepare(`
        UPDATE approval_notifications SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND channel = ?
      `).run(status, order.id, name);
      console.error(`Order approval ${name} notification ${status.toLowerCase()} for ${order.order_code}: ${error.message}`);
    }
  }));
}

function normalizeKenyanPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}

function getMpesaTimestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

async function initiateMpesaPayment(order, phone) {
  if (!mpesaConfig) throw new Error('M-Pesa payments are not configured yet. Choose cash on delivery or contact support.');
  const timestamp = getMpesaTimestamp();
  const password = Buffer.from(`${mpesaConfig.shortcode}${mpesaConfig.passkey}${timestamp}`).toString('base64');
  const credentials = Buffer.from(`${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`).toString('base64');
  const tokenResponse = await fetch(
    `${mpesaConfig.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || typeof tokenPayload.access_token !== 'string') {
    throw new Error('Safaricom could not authorize the M-Pesa payment request. Try again or choose cash on delivery.');
  }

  const pushResponse = await fetch(`${mpesaConfig.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      BusinessShortCode: mpesaConfig.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: mpesaConfig.transactionType,
      Amount: order.total,
      PartyA: phone,
      PartyB: mpesaConfig.shortcode,
      PhoneNumber: phone,
      CallBackURL: mpesaConfig.callbackUrl,
      AccountReference: order.id,
      TransactionDesc: `Wakwito laundry order ${order.id}`,
    }),
  });
  const pushPayload = await pushResponse.json();
  if (!pushResponse.ok || pushPayload.ResponseCode !== '0'
      || typeof pushPayload.CheckoutRequestID !== 'string'
      || typeof pushPayload.MerchantRequestID !== 'string') {
    throw new Error(pushPayload.errorMessage || pushPayload.ResponseDescription || 'Safaricom could not start the M-Pesa prompt. Try again or choose cash on delivery.');
  }
  return {
    checkoutRequestId: pushPayload.CheckoutRequestID,
    merchantRequestId: pushPayload.MerchantRequestID,
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
      fulfillment, payment_method, payment_timing, payment_status, status, eta,
      items_json, subtotal, service_fee, total, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      order.payment === 'M-Pesa' ? 'ORDER' : 'DELIVERY',
      order.payment === 'M-Pesa' ? 'PAID' : 'UNPAID',
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

app.get('/api/payments/options', (_request, response) => {
  response.json({
    mpesaAvailable: Boolean(mpesaConfig),
    approvalNotifications: { sms: Boolean(smsConfig), email: Boolean(emailConfig) },
  });
});

app.post('/api/payments/mpesa/callback', (request, response) => {
  const callback = request.body?.Body?.stkCallback;
  const checkoutRequestId = callback?.CheckoutRequestID;
  if (typeof checkoutRequestId !== 'string') {
    return sendError(response, 400, 'Invalid M-Pesa callback.');
  }

  const order = database.prepare(`
    SELECT id, total, mpesa_phone, payment_status, payment_method, payment_timing FROM orders
    WHERE mpesa_checkout_request_id = ?
  `).get(checkoutRequestId);
  if (!order || order.payment_method !== 'M-Pesa' || order.payment_timing !== 'ORDER') {
    return sendError(response, 404, 'M-Pesa payment request not found.');
  }
  if (order.payment_status === 'PAID') return response.json({ status: 'accepted' });

  if (callback.ResultCode !== 0) {
    database.prepare("UPDATE orders SET payment_status = 'FAILED' WHERE id = ? AND payment_status = 'PENDING'")
      .run(order.id);
    return response.json({ status: 'accepted' });
  }

  const items = callback.CallbackMetadata?.Item;
  const amount = items?.find((item) => item.Name === 'Amount')?.Value;
  const receipt = items?.find((item) => item.Name === 'MpesaReceiptNumber')?.Value;
  const phone = items?.find((item) => item.Name === 'PhoneNumber')?.Value;
  if (Number(amount) !== order.total || String(phone) !== order.mpesa_phone || typeof receipt !== 'string') {
    return sendError(response, 400, 'M-Pesa payment details did not match the order.');
  }
  database.prepare(`
    UPDATE orders SET payment_status = 'PAID', mpesa_receipt = ?
    WHERE id = ? AND payment_status = 'PENDING'
  `).run(receipt, order.id);
  return response.json({ status: 'accepted' });
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

app.post('/api/orders', authenticate, authorize('CUSTOMER'), async (request, response) => {
  const {
    address,
    mapUrl = '',
    fulfillment,
    paymentMethod,
    paymentTiming,
    scheduledDate,
    timeSlot,
    notes = '',
    acceptedTerms,
    items,
  } = request.body || {};
  if (typeof address !== 'string' || address.trim().length < 4 || address.length > 240) {
    return sendError(response, 400, 'Enter a valid pickup or delivery address.');
  }
  if (!isValidFutureDate(scheduledDate)) {
    return sendError(response, 400, 'Choose a valid service date from tomorrow onward.');
  }
  if (!validTimeSlots.has(timeSlot)) return sendError(response, 400, 'Choose a valid pickup time window.');
  if (typeof mapUrl !== 'string' || (mapUrl.trim() !== '' && !isGoogleMapsUrl(mapUrl.trim()))) {
    return sendError(response, 400, 'Enter a valid HTTPS Google Maps link.');
  }
  if (!validFulfillment.has(fulfillment)) return sendError(response, 400, 'Choose a valid fulfillment option.');
  if (!validPaymentMethods.has(paymentMethod)) return sendError(response, 400, 'Choose a valid payment method.');
  if (!validPaymentTimings.has(paymentTiming)
      || (paymentMethod === 'M-Pesa' && paymentTiming !== 'ORDER')
      || (paymentMethod === 'Cash' && paymentTiming !== 'DELIVERY')) {
    return sendError(response, 400, 'Choose M-Pesa payment on order or cash payment on delivery.');
  }
  if (acceptedTerms !== true) return sendError(response, 400, 'Accept the Terms and Conditions and Privacy Policy to place an order.');
  if (paymentMethod === 'M-Pesa' && !mpesaConfig) {
    return sendError(response, 503, 'M-Pesa payments are not configured yet. Choose cash on delivery or contact support.');
  }
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
  const normalizedMapUrl = mapUrl.trim() || null;
  if (!customerName || customerName.length > 100) return sendError(response, 400, 'Enter a valid customer name.');
  if (!/^[+]?[\d\s()-]{7,20}$/.test(phone)) return sendError(response, 400, 'Enter a valid phone number.');
  const mpesaPhone = paymentMethod === 'M-Pesa' ? normalizeKenyanPhone(phone) : null;
  if (paymentMethod === 'M-Pesa' && !mpesaPhone) {
    return sendError(response, 400, 'Enter a valid Kenyan mobile number for the M-Pesa prompt.');
  }
  const insert = database.prepare(`
    INSERT INTO orders (
      order_code, customer_user_id, customer_name, customer_email, phone, address, map_url,
      fulfillment, payment_method, payment_timing, payment_status, mpesa_phone, scheduled_date,
      time_slot, terms_accepted_at, terms_version, notes, items_json, subtotal, service_fee, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = insert.run(
    orderCode,
    request.user.id,
    customerName,
    request.user.email,
    phone,
    address.trim(),
    normalizedMapUrl,
    fulfillment,
    paymentMethod,
    paymentTiming,
    paymentMethod === 'M-Pesa' ? 'PENDING' : 'UNPAID',
    mpesaPhone,
    scheduledDate,
    timeSlot,
    new Date().toISOString(),
    policyVersion,
    notes.trim(),
    JSON.stringify(normalizedItems),
    subtotal,
    serviceFee,
    total,
  );
  const orderId = Number(result.lastInsertRowid);
  if (paymentMethod === 'M-Pesa') {
    const order = database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    try {
      const payment = await initiateMpesaPayment(normalizeOrder(order), mpesaPhone);
      database.prepare(`
        UPDATE orders SET mpesa_checkout_request_id = ?, mpesa_merchant_request_id = ?
        WHERE id = ?
      `).run(payment.checkoutRequestId, payment.merchantRequestId, orderId);
    } catch (error) {
      database.prepare("UPDATE orders SET payment_status = 'FAILED' WHERE id = ?").run(orderId);
      const failedOrder = database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      return response.status(201).json({
        order: normalizeOrder(failedOrder),
        paymentError: error.name === 'TimeoutError'
          ? 'Safaricom did not respond in time. Retry the M-Pesa prompt from order tracking.'
          : error.message,
      });
    }
  }

  const order = database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  return response.status(201).json({ order: normalizeOrder(order) });
});

app.post('/api/orders/:orderCode/payment', authenticate, authorize('CUSTOMER'), async (request, response) => {
  if (!mpesaConfig) return sendError(response, 503, 'M-Pesa payments are not configured yet.');
  const order = database.prepare(`
    SELECT * FROM orders WHERE order_code = ? AND customer_user_id = ?
  `).get(request.params.orderCode, request.user.id);
  if (!order) return sendError(response, 404, 'Order not found.');
  if (order.payment_method !== 'M-Pesa' || order.payment_timing !== 'ORDER') {
    return sendError(response, 400, 'This order is not set up for M-Pesa payment on order.');
  }
  if (order.payment_status === 'PAID') return sendError(response, 409, 'This order has already been paid.');
  if (order.payment_status === 'PENDING') return sendError(response, 409, 'An M-Pesa prompt is already pending. Check your phone or wait for it to expire.');

  const mpesaPhone = normalizeKenyanPhone(order.phone);
  if (!mpesaPhone) return sendError(response, 400, 'Update your account with a valid Kenyan mobile number before retrying payment.');
  database.prepare("UPDATE orders SET payment_status = 'PENDING', mpesa_phone = ? WHERE id = ?")
    .run(mpesaPhone, order.id);
  try {
    const payment = await initiateMpesaPayment(normalizeOrder(order), mpesaPhone);
    database.prepare(`
      UPDATE orders SET mpesa_checkout_request_id = ?, mpesa_merchant_request_id = ?
      WHERE id = ?
    `).run(payment.checkoutRequestId, payment.merchantRequestId, order.id);
    const updatedOrder = database.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    return response.json({ order: normalizeOrder(updatedOrder) });
  } catch (error) {
    database.prepare("UPDATE orders SET payment_status = 'FAILED' WHERE id = ?").run(order.id);
    return sendError(response, 502, error.name === 'TimeoutError'
      ? 'Safaricom did not respond in time. Retry the M-Pesa prompt.'
      : error.message);
  }
});

app.post('/api/orders/:orderCode/approval-notifications/retry', authenticate, authorize('ADMIN'), async (request, response) => {
  const order = database.prepare('SELECT * FROM orders WHERE order_code = ?')
    .get(request.params.orderCode);
  if (!order) return sendError(response, 404, 'Order not found.');
  if (order.status !== 'In Progress') {
    return sendError(response, 409, 'Approval notifications are available only for approved orders.');
  }
  await notifyOrderApproved(order);
  const updatedOrder = database.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  return response.json({ order: normalizeOrder(updatedOrder) });
});

app.patch('/api/orders/:orderCode/status', authenticate, authorize('ADMIN'), async (request, response) => {
  const status = request.body?.status;
  if (!validOrderStatuses.has(status)) return sendError(response, 400, 'Choose a valid order status.');

  const eta = status === 'Completed'
    ? 'Delivered'
    : status === 'Picked Up'
      ? 'On route'
      : status === 'In Progress'
        ? 'Pickup in 2h'
        : 'Awaiting confirmation';
  const previousOrder = database.prepare('SELECT * FROM orders WHERE order_code = ?')
    .get(request.params.orderCode);
  if (!previousOrder) return sendError(response, 404, 'Order not found.');
  if (status === 'In Progress' && previousOrder.payment_method === 'M-Pesa'
      && previousOrder.payment_status !== 'PAID') {
    return sendError(response, 409, 'Confirm the M-Pesa payment before approving this order.');
  }
  const result = database.prepare('UPDATE orders SET status = ?, eta = ? WHERE order_code = ?')
    .run(status, eta, request.params.orderCode);
  if (result.changes === 0) return sendError(response, 404, 'Order not found.');

  if (status === 'In Progress' && previousOrder.status !== 'In Progress') {
    await notifyOrderApproved(previousOrder);
  }
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
