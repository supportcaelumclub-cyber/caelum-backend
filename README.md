# CAELUM CLUB — Backend only

This folder is the Node.js backend for the existing CAELUM CLUB `index.html`. It does not replace or modify the storefront.

## Included

- Secure Razorpay order creation and signature verification.
- Razorpay webhook endpoint for a second payment confirmation channel.
- Server-side product-price and coupon validation (the browser's submitted total is never trusted).
- Supabase database connection using the service-role key on the server only.
- Admin API protected by a Supabase Auth access token and `app_metadata.role = admin`.
- Admin CRUD endpoints for products, categories, coupons and promotional banners, plus an order listing endpoint.
- SQL schema and Row Level Security policies.

## 1. Prepare Supabase

1. Open your Supabase project: `https://supabase.com/dashboard/project/wpbnmmchkwjoumoehomm`.
2. Open **SQL Editor**.
3. Open `supabase/schema.sql`, copy its full contents and run it once.
4. In **Project Settings → API**, copy the **Project URL** and **service_role** secret. The service-role secret is private; never paste it into `index.html`, GitHub, or a public chat.
5. Create the admin user under **Authentication → Users**. Then run the admin-role SQL at the bottom of `schema.sql`, replacing `YOUR_ADMIN_EMAIL` with that user's email.

The existing storefront already contains a Supabase publishable key. That is a browser key and is not the service-role secret. Keep RLS enabled.

## 2. Configure environment variables

1. Copy `.env.example` to a new file named `.env`.
2. Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`.
3. Set `FRONTEND_ORIGINS` to the exact website origin(s), comma-separated. Do not add a trailing slash.
4. Start with Razorpay **Test Mode** keys. Do not use live keys until test payments and webhook verification have passed.
5. Set `RAZORPAY_WEBHOOK_SECRET` to the secret you create for the webhook in the Razorpay dashboard.

Never upload `.env`. It is excluded by `.gitignore`.

## 3. Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Check `http://localhost:3000/api/health`. A successful response looks like:

```json
{"ok":true,"service":"CAELUM CLUB API"}
```

## 4. API endpoints

### Public

- `GET /api/health`
- `POST /api/create-razorpay-order`
- `POST /api/verify-razorpay-payment`
- `POST /api/razorpay-webhook`

The checkout endpoints expect the customer fields and cart item shape already sent by the current `index.html`. The server fetches product prices from Supabase and calculates the total itself.

### Admin (Bearer Supabase access token required)

- `GET /api/admin/products`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`, `DELETE /api/admin/products/:id`
- Same CRUD pattern for `/categories`, `/coupons`, and `/promotional_banners`.
- `GET /api/admin/orders`

For admin requests send `Authorization: Bearer <Supabase access_token>`. Only a user whose trusted `app_metadata.role` is `admin` is accepted. Do not use editable user metadata for admin authorization.

## 5. Razorpay webhook

In Razorpay Dashboard → Account & Settings → Webhooks, add:

`https://YOUR-BACKEND-HOST/api/razorpay-webhook`

Subscribe to `payment.captured`. Use the exact same webhook secret as `RAZORPAY_WEBHOOK_SECRET` in `.env`.

## Important deployment note

GitHub Pages is static hosting and cannot run this Node.js server. Deploy this folder to a Node.js host (for example Render, Railway, or another Node-capable host), set the environment variables in that host's secret/environment settings, and configure the webhook there. The current HTML uses relative `/api/...` checkout URLs; if the API is hosted on a different domain, the storefront's API base URL/CORS connection will need a small frontend connection update later. This package intentionally leaves `index.html` unchanged.

## Before accepting real orders

- Finish the SQL setup and add real products with correct prices, sizes and stock.
- Test with Razorpay Test Mode and verify successful, failed, cancelled and duplicate webhook cases.
- Check delivery, refund and customer-support processes.
- Set production CORS origins and use HTTPS.
- Add backups and monitor server logs.

This is a backend starter tailored to the current storefront code; do not treat it as live until configured, deployed and tested with your actual Supabase and Razorpay accounts.
