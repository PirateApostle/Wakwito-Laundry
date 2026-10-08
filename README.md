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

The frontend is at `http://localhost:5173`. Vite proxies `/api` requests to the Express server at `http://localhost:3000`. The SQLite database is created at `.data/wakwito.sqlite`.

With the development servers running, use `npm run test:api` to exercise session authentication, customer order access, server-side pricing, admin status updates, and persistence.

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

## API overview

- `GET /api/health` — health check
- `POST /api/auth/signup` — create a customer account
- `POST /api/auth/login` — authenticate by email or phone
- `POST /api/auth/logout` — clear the session cookie
- `GET /api/auth/me` — restore the current session
- `GET /api/orders` — list the signed-in customer’s orders; admins and drivers can view all orders
- `POST /api/orders` — create an order; item prices and totals are calculated by the server
- `PATCH /api/orders/:orderCode/status` — admin-only order status update
