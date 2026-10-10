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
  const paymentOptions = await request('/payments/options');
  assert.equal(paymentOptions.response.status, 200);
  assert.equal(typeof paymentOptions.body.mpesaAvailable, 'boolean');
  assert.equal(typeof paymentOptions.body.approvalNotifications.sms, 'boolean');
  assert.equal(typeof paymentOptions.body.approvalNotifications.email, 'boolean');

  const invalidMpesaCallback = await request('/payments/mpesa/callback', {
    method: 'POST',
    body: {},
  });
  assert.equal(invalidMpesaCallback.response.status, 400);

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
    paymentMethod: 'Cash',
    paymentTiming: 'DELIVERY',
    acceptedTerms: true,
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

  const unacceptedTerms = await request('/orders', {
    method: 'POST',
    cookie: signup.cookie,
    body: { ...orderBody, acceptedTerms: false },
  });
  assert.equal(unacceptedTerms.response.status, 400);

  const mismatchedPaymentTiming = await request('/orders', {
    method: 'POST',
    cookie: signup.cookie,
    body: { ...orderBody, paymentMethod: 'M-Pesa', paymentTiming: 'DELIVERY' },
  });
  assert.equal(mismatchedPaymentTiming.response.status, 400);

  if (!paymentOptions.body.mpesaAvailable) {
    const unavailableMpesa = await request('/orders', {
      method: 'POST',
      cookie: signup.cookie,
      body: { ...orderBody, paymentMethod: 'M-Pesa', paymentTiming: 'ORDER' },
    });
    assert.equal(unavailableMpesa.response.status, 503);
  }

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
  assert.equal(create.body.order.paymentTiming, 'DELIVERY');
  assert.equal(create.body.order.paymentStatus, 'UNPAID');

  const customerOrders = await request('/orders', { cookie: signup.cookie });
  assert.ok(customerOrders.body.orders.some((order) => order.id === orderCode));
  const persistedOrder = customerOrders.body.orders.find((order) => order.id === orderCode);
  assert.equal(persistedOrder.scheduledDate, scheduledDate);
  assert.equal(persistedOrder.timeSlot, orderBody.timeSlot);
  assert.equal(persistedOrder.mapUrl, orderBody.mapUrl);
  assert.equal(persistedOrder.paymentMethod, 'Cash');
  const acceptedTerms = new Database(databasePath);
  const termsRecord = acceptedTerms.prepare(`
    SELECT terms_accepted_at, terms_version FROM orders WHERE order_code = ?
  `).get(orderCode);
  assert.ok(termsRecord.terms_accepted_at);
  assert.equal(termsRecord.terms_version, '2026-10-10');
  acceptedTerms.close();

  const paymentFixture = new Database(databasePath);
  paymentFixture.prepare(`
    UPDATE orders
    SET payment_method = 'M-Pesa', payment_timing = 'ORDER', payment_status = 'PENDING',
        mpesa_phone = '254712345678', mpesa_checkout_request_id = 'ws_CO_API_TEST'
    WHERE order_code = ?
  `).run(orderCode);
  paymentFixture.close();
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@wakwito.co.ke', password: 'admin123' },
  });
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.body.user.role, 'ADMIN');

  const approveUnpaidOrder = await request(`/orders/${orderCode}/status`, {
    method: 'PATCH',
    cookie: adminLogin.cookie,
    body: { status: 'In Progress' },
  });
  assert.equal(approveUnpaidOrder.response.status, 409);

  const mpesaCallback = await request('/payments/mpesa/callback', {
    method: 'POST',
    body: {
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_API_TEST',
          ResultCode: 0,
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 321 },
              { Name: 'MpesaReceiptNumber', Value: 'QET123ABC' },
              { Name: 'PhoneNumber', Value: 254712345678 },
            ],
          },
        },
      },
    },
  });
  assert.equal(mpesaCallback.response.status, 200);
  const duplicateMpesaCallback = await request('/payments/mpesa/callback', {
    method: 'POST',
    body: {
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_API_TEST',
          ResultCode: 0,
          CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1 }, { Name: 'MpesaReceiptNumber', Value: 'FAKE' }] },
        },
      },
    },
  });
  assert.equal(duplicateMpesaCallback.response.status, 200);
  const paidOrder = await request('/orders', { cookie: signup.cookie });
  const confirmedPayment = paidOrder.body.orders.find((order) => order.id === orderCode);
  assert.equal(confirmedPayment.paymentStatus, 'PAID');
  assert.equal(confirmedPayment.mpesaReceipt, 'QET123ABC');

  const approveOrder = await request(`/orders/${orderCode}/status`, {
    method: 'PATCH',
    cookie: adminLogin.cookie,
    body: { status: 'In Progress' },
  });
  assert.equal(approveOrder.response.status, 200);
  assert.equal(approveOrder.body.order.status, 'In Progress');
  assert.deepEqual(
    approveOrder.body.order.approvalNotifications.map(({ channel, status }) => ({ channel, status }))
      .sort((left, right) => left.channel.localeCompare(right.channel)),
    [
      { channel: 'EMAIL', status: paymentOptions.body.approvalNotifications.email ? 'FAILED' : 'NOT_CONFIGURED' },
      { channel: 'SMS', status: paymentOptions.body.approvalNotifications.sms ? 'FAILED' : 'NOT_CONFIGURED' },
    ],
  );

  const customerRetryNotification = await request(`/orders/${orderCode}/approval-notifications/retry`, {
    method: 'POST',
    cookie: signup.cookie,
    body: {},
  });
  assert.equal(customerRetryNotification.response.status, 403);
  const adminRetryNotification = await request(`/orders/${orderCode}/approval-notifications/retry`, {
    method: 'POST',
    cookie: adminLogin.cookie,
    body: {},
  });
  assert.equal(adminRetryNotification.response.status, 200);
  const notificationFixture = new Database(databasePath);
  assert.equal(
    notificationFixture.prepare('SELECT COUNT(*) AS count FROM approval_notifications WHERE order_id = (SELECT id FROM orders WHERE order_code = ?)').get(orderCode).count,
    2,
  );
  notificationFixture.close();

  const approvedOrder = await request('/orders', { cookie: signup.cookie });
  assert.equal(approvedOrder.body.orders.find((order) => order.id === orderCode).status, 'In Progress');

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

  console.log('API smoke test passed: profiles, pickup scheduling, legal consent persistence, payment choices, approval status, customer scope, and admin updates.');
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
