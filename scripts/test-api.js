import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import 'dotenv/config';

const apiRoot = process.env.API_ROOT || 'http://127.0.0.1:3000/api';
const testEmail = `api-test-${Date.now()}@example.com`;
const testPhone = `079${String(Date.now()).slice(-7)}`;
const secondTestEmail = `api-test-second-${Date.now()}@example.com`;
const secondTestPhone = `078${String(Date.now()).slice(-7)}`;
const databasePath = process.env.DATABASE_PATH || '.data/wakwito.sqlite';

function cookieFrom(response) {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'Expected the API to set an authentication cookie');
  return cookie.split(';', 1)[0];
}

function getDateOffset(offset) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const day = Number(parts.find((part) => part.type === 'day').value);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

async function request(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);

  const response = await fetch(`${apiRoot}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json();
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
}

let orderCode;
let profileUsername;
try {
  const health = await request('/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.service, 'wakwito-api');

  const unauthorizedProfile = await request('/auth/profile', {
    method: 'PUT',
    body: { name: 'Unauthenticated', username: 'not_allowed', phone: testPhone },
  });
  assert.equal(unauthorizedProfile.response.status, 401);

  const signup = await request('/auth/signup', {
    method: 'POST',
    body: {
      name: 'API Integration Test',
      email: testEmail,
      phone: testPhone,
      password: 'IntegrationPassword123',
    },
  });
  assert.equal(signup.response.status, 201);
  assert.equal(signup.body.user.role, 'CUSTOMER');
  assert.match(signup.body.user.username, /^[a-z0-9_]{3,24}$/);

  const profilePhoto = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`;
  const profileUpdate = await request('/auth/profile', {
    method: 'PUT',
    cookie: signup.cookie,
    body: {
      name: 'Updated Integration Name',
      username: `api_user_${Date.now()}`,
      phone: `+254${String(Date.now()).slice(-9)}`,
      location: 'Kilimani, Nairobi',
      profilePhoto,
    },
  });
  assert.equal(profileUpdate.response.status, 200);
  assert.equal(profileUpdate.body.user.name, 'Updated Integration Name');
  assert.equal(profileUpdate.body.user.location, 'Kilimani, Nairobi');
  assert.equal(profileUpdate.body.user.profilePhoto, profilePhoto);
  profileUsername = profileUpdate.body.user.username;

  const restoredProfile = await request('/auth/me', { cookie: signup.cookie });
  assert.equal(restoredProfile.body.user.username, profileUsername);

  const usernameLogin = await request('/auth/login', {
    method: 'POST',
    body: { identifier: profileUsername, password: 'IntegrationPassword123' },
  });
  assert.equal(usernameLogin.response.status, 200);
  assert.equal(usernameLogin.body.user.id, signup.body.user.id);

  const secondSignup = await request('/auth/signup', {
    method: 'POST',
    body: {
      name: 'Second API Integration Test',
      email: secondTestEmail,
      phone: secondTestPhone,
      password: 'IntegrationPassword123',
    },
  });
  assert.equal(secondSignup.response.status, 201);
  const duplicateUsername = await request('/auth/profile', {
    method: 'PUT',
    cookie: secondSignup.cookie,
    body: {
      name: 'Second API Integration Test',
      username: profileUsername,
      phone: secondTestPhone,
      location: '',
    },
  });
  assert.equal(duplicateUsername.response.status, 409);

  const invalidPhoto = await request('/auth/profile', {
    method: 'PUT',
    cookie: signup.cookie,
    body: { ...profileUpdate.body.user, profilePhoto: 'data:image/png;base64,AAAA' },
  });
  assert.equal(invalidPhoto.response.status, 400);

  const scheduledDate = getDateOffset(3);
  const orderBody = {
    customerName: 'API Integration Test',
    phone: testPhone,
    address: 'Nairobi West, Nairobi',
    mapUrl: 'https://maps.app.goo.gl/examplePin',
    fulfillment: 'Pickup + Delivery',
    paymentMethod: 'M-Pesa',
    scheduledDate,
    timeSlot: 'Morning (8am–12pm)',
    notes: 'API test order',
    items: [{ id: 'washing', kg: 1.5, quantity: 2 }],
  };
  const invalidSchedule = await request('/orders', {
    method: 'POST',
    cookie: signup.cookie,
    body: { ...orderBody, scheduledDate: '2000-01-01' },
  });
  assert.equal(invalidSchedule.response.status, 400);

  const invalidTimeSlot = await request('/orders', {
    method: 'POST',
    cookie: signup.cookie,
    body: { ...orderBody, timeSlot: 'Midnight' },
  });
  assert.equal(invalidTimeSlot.response.status, 400);

  const invalidMapUrl = await request('/orders', {
    method: 'POST',
    cookie: signup.cookie,
    body: { ...orderBody, mapUrl: 'https://example.com/fake-map' },
  });
  assert.equal(invalidMapUrl.response.status, 400);

  const create = await request('/orders', {
    method: 'POST',
    cookie: signup.cookie,
    body: orderBody,
  });
  assert.equal(create.response.status, 201);
  orderCode = create.body.order.id;
  assert.equal(create.body.order.subtotal, 297);
  assert.equal(create.body.order.serviceFee, 24);
  assert.equal(create.body.order.total, 321);
  assert.equal(create.body.order.scheduledDate, scheduledDate);
  assert.equal(create.body.order.timeSlot, orderBody.timeSlot);
  assert.equal(create.body.order.mapUrl, orderBody.mapUrl);

  const customerOrders = await request('/orders', { cookie: signup.cookie });
  assert.ok(customerOrders.body.orders.some((order) => order.id === orderCode));
  const persistedOrder = customerOrders.body.orders.find((order) => order.id === orderCode);
  assert.equal(persistedOrder.scheduledDate, scheduledDate);
  assert.equal(persistedOrder.timeSlot, orderBody.timeSlot);
  assert.equal(persistedOrder.mapUrl, orderBody.mapUrl);

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@wakwito.co.ke', password: 'admin123' },
  });
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.body.user.role, 'ADMIN');

  const statusUpdate = await request(`/orders/${orderCode}/status`, {
    method: 'PATCH',
    cookie: adminLogin.cookie,
    body: { status: 'Completed' },
  });
  assert.equal(statusUpdate.response.status, 200);
  assert.equal(statusUpdate.body.order.status, 'Completed');

  const afterUpdate = await request('/orders', { cookie: signup.cookie });
  assert.equal(afterUpdate.body.orders.find((order) => order.id === orderCode).status, 'Completed');

  const deniedUpdate = await request(`/orders/${orderCode}/status`, {
    method: 'PATCH',
    cookie: signup.cookie,
    body: { status: 'Pending' },
  });
  assert.equal(deniedUpdate.response.status, 403);

  console.log('API smoke test passed: profile updates, username sign-in, pickup scheduling, map-link persistence, order calculation, customer scope, and admin updates.');
} finally {
  const database = new Database(databasePath);
  const deleteTestData = database.transaction(() => {
    if (orderCode) database.prepare('DELETE FROM orders WHERE order_code = ?').run(orderCode);
    database.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
    database.prepare('DELETE FROM users WHERE email = ?').run(secondTestEmail);
  });
  deleteTestData();
  database.close();
}
