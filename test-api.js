import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import 'dotenv/config';

const apiRoot = process.env.API_ROOT || 'http://127.0.0.1:3000/api';
const testEmail = `api-test-${Date.now()}@example.com`;
const testPhone = `079${String(Date.now()).slice(-7)}`;
const databasePath = process.env.DATABASE_PATH || '.data/wakwito.sqlite';

function cookieFrom(response) {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'Expected the API to set an authentication cookie');
  return cookie.split(';', 1)[0];
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
try {
  const health = await request('/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.service, 'wakwito-api');

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

  const create = await request('/orders', {
    method: 'POST',
    cookie: signup.cookie,
    body: {
      customerName: 'API Integration Test',
      phone: testPhone,
      address: 'Nairobi West, Nairobi',
      fulfillment: 'Pickup + Delivery',
      paymentMethod: 'M-Pesa',
      notes: 'API test order',
      items: [{ id: 'washing', kg: 1.5, quantity: 2 }],
    },
  });
  assert.equal(create.response.status, 201);
  orderCode = create.body.order.id;
  assert.equal(create.body.order.subtotal, 297);
  assert.equal(create.body.order.serviceFee, 24);
  assert.equal(create.body.order.total, 321);

  const customerOrders = await request('/orders', { cookie: signup.cookie });
  assert.ok(customerOrders.body.orders.some((order) => order.id === orderCode));

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

  console.log('API smoke test passed: session auth, server-calculated order, customer scope, admin status update, and persistence.');
} finally {
  const database = new Database(databasePath);
  const deleteTestData = database.transaction(() => {
    if (orderCode) database.prepare('DELETE FROM orders WHERE order_code = ?').run(orderCode);
    database.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  });
  deleteTestData();
  database.close();
}
