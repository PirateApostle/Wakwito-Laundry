# Wakwito Laundry


React + Vite frontend backed by an Express API and SQLite database.


## Requirements


- Node.js 22 or later
- npm


## Local development


1. Copy `.env.example` to `.env`.
2. Install packages with `npm install`.
3. Start both the API and frontend:


   ```sh
   npm run dev
   ```


The frontend is at `http://localhost:5173`. Vite proxies `/api` requests to the Express server at `http://127.0.0.1:3000`. The SQLite database is created at `.data/wakwito.sqlite`.

Checkout lets customers search an address in Google Maps, optionally save a Google Maps share link, and choose a future service date and pickup time window. This no-key map-link flow does not require a Google Maps API key.

Order tracking refreshes automatically and shows a notice when an administrator approves an order by moving it to “In Progress.” Customers can choose M-Pesa STK Push payment on order or cash payment on delivery, and must accept the Terms and Conditions and acknowledge the Privacy Policy before ordering.

Approval messages are sent by Africa’s Talking SMS and SMTP email when those providers are configured. Set `AT_USERNAME` and `AT_API_KEY` to enable SMS; `AT_ENV` selects `sandbox` or `production`, with optional `AT_SENDER_ID`. Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` to enable email; `SMTP_PORT` and `SMTP_SECURE` control the TLS connection. Provider results are recorded per order and channel. Without provider credentials, the in-app order approval notice still works and the tracking page reports external channels as not configured.

M-Pesa STK Push requires a Safaricom Daraja app and a registered Paybill or Till shortcode. Set all `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, and `MPESA_CALLBACK_URL` values in the production service environment to enable it. Set `MPESA_ENV=production` for the live Daraja endpoint or `sandbox` for testing. Set `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline` for a Paybill or `CustomerBuyGoodsOnline` for a Till. Configure the public HTTPS callback URL ending in `/api/payments/mpesa/callback`. Until those values are configured, M-Pesa checkout is disabled; customers may use cash on delivery.


With the development servers running, use `npm run test:api` to exercise session authentication, customer order access, server-side pricing, payment option validation, admin approval updates, and persistence.


Development starts with these demo accounts:


| Role | Email | Password |
| --- | --- | --- |
| Customer | `mainoo@wakwito.co.ke` | `demo123` |
| Admin | `admin@wakwito.co.ke` | `admin123` |
| Driver | `driver@wakwito.co.ke` | `driver123` |


Demo users are seeded only outside production. Passwords are stored as bcrypt hashes. New sign-ups create customer accounts; only admins can change order statuses.


## Production


1. Set `NODE_ENV=production`.
2. Set `JWT_SECRET` to a unique, cryptographically random secret (at least 32 random bytes).
3. Set a unique `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_PHONE` for first-run administrator creation.
4. Set `DATABASE_PATH` to persistent storage writable by the Node process. Back up this SQLite file regularly.
5. Run `npm install`, `npm run build`, then `npm start`.
6. Serve over HTTPS. Production session cookies are HttpOnly, Secure, and SameSite=Lax.


The Express server serves the built frontend and the `/api` endpoints from the same origin in production. Use a persistent volume for the database when deploying to a container or hosting platform; ephemeral filesystems do not preserve SQLite data across redeployments.


## GitHub Pages preview


The GitHub Pages workflow builds and publishes the static frontend at https://pirateapostle.github.io/Wakwito-Laundry/. Sign-in, ordering, and tracking require the Express API and SQLite database and are unavailable on this static preview.


## API overview


- `GET /api/health` — health check
- `POST /api/auth/signup` — create a customer account
- `POST /api/auth/login` — authenticate by email, phone, or username
- `POST /api/auth/logout` — clear the session cookie
- `GET /api/auth/me` — restore the current session
- `PUT /api/auth/profile` — update the signed-in user’s name, unique username, phone, location, and profile photo
- `GET /api/orders` — list the signed-in customer’s orders; admins and drivers can view all orders
- `GET /api/payments/options` — check whether M-Pesa STK Push is configured
- `POST /api/orders` — create an order with scheduling, map pin, payment timing, and accepted policy version; item prices and totals are calculated by the server
- `POST /api/orders/:orderCode/payment` — customer-only retry for a failed M-Pesa STK Push
- `POST /api/orders/:orderCode/approval-notifications/retry` — admin-only retry for approval SMS/email
- `POST /api/payments/mpesa/callback` — receive Daraja payment result callbacks
- `PATCH /api/orders/:orderCode/status` — admin-only order status update

Terms and Conditions and the Privacy Policy are available from the site footer and checkout. Checkout records the accepted policy version and timestamp with each order.
