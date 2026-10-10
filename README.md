# Dukaan Manager

Multi-shop management system for **karyana stores, general stores and bakeries** in Pakistan.
Built with **Next.js 15 (App Router) + MongoDB (Mongoose) + Tailwind CSS**.

Designed for non-technical shopkeepers: big buttons, plain language, English with Urdu labels, works on PC, tablet and phone (installable as an app).

---

## How accounts work (multi-tenant)

```
Super Admin (platform)
 ├── Shop A  (limit: 3 users)          ← each shop = one tenant, data fully separated
 │    ├── Owner      – everything in the shop, manages staff
 │    ├── Manager    – products, purchases, production, expenses, reports, returns
 │    └── Cashier    – billing and receiving udhaar only
 └── Shop B  (limit: 5 users)
      └── ...
```

| Who | Can do |
|---|---|
| **Super Admin** | Create shops with their owner login · set **maximum users per shop** · set plan name and **access-until date** · suspend / re-activate a shop · add users to any shop, reset passwords, enable/disable users · download any shop's backup · see sales, users and activity of all shops |
| **Shop Owner** | Everything inside their shop · add/disable staff **up to the limit set by the Super Admin** · shop settings, tax, FBR · import/export/backup |
| **Manager** | Daily operations except settings and staff |
| **Cashier** | New bills, customers and receiving udhaar; cannot change prices |

Data isolation is enforced in the database layer: every shop record carries a `tenant` id, and a Mongoose guard **refuses any query or aggregation that does not filter by tenant**, so one shop can never read or change another shop's data. Suspending a shop, an expired access date, or disabling a user takes effect within 15 seconds, even for people already logged in.

## Features

| Area | What you can do |
|---|---|
| **New Bill (POS)** | Barcode scan or search, category tabs, loose items **by kg or by rupees** ("Rs 100 ki cheeni"), discounts, change calculation, Cash / JazzCash / Easypaisa / Card / Bank / Udhaar, 80 mm thermal receipts. `F2` search, `F9` pay. |
| **Products & Stock** | Units (piece, kg, gram, litre, dozen…), cost & sale price, low-stock and expiry alerts, stock add / remove / wastage / exact count, full stock history. |
| **Production (bakery)** | Recipes (ingredients per batch → finished items), production runs that deduct ingredients and add finished stock, automatic cost per item, shortage warnings, production history. |
| **Customers Khata** | Udhaar with running balance, credit limits, partial payments, opening balances, **WhatsApp reminder**. |
| **Suppliers & Purchases** | Incoming stock updates stock, cost and sale prices; supplier payable khata. |
| **Expenses, Sales history, Returns** | Full bill returns put stock back and reverse udhaar. |
| **Reports & Dashboard** | Sales, profit & loss, best sellers, payment methods, expenses, returns; 7-day chart. |
| **FBR POS integration** | Bills are sent to FBR; FBR invoice number + QR code printed on the receipt; returns sent as credit notes; if internet/FBR is down bills are saved as *pending* and re-sent with one click. |
| **Data** | Export products / customers / suppliers / sales / expenses to Excel (CSV), **import products from CSV**, full JSON backup. |
| **Installable app (PWA)** | "Install" / "Add to Home Screen" on Chrome, Edge and Android; shows a friendly offline page when the server can't be reached. |
| **Security** | bcrypt passwords, signed httpOnly session cookies, role checks on every API, login lockout after 10 wrong attempts, security headers, CSV formula-injection protection, FBR token never sent to the browser. |

## Getting started (local MongoDB)

Requirements: **Node.js 20+** and **MongoDB 6+** running on your computer.

### 1. Local MongoDB

Pick one:

- **Windows / Mac (simplest):** install *MongoDB Community Server* from <https://www.mongodb.com/try/download/community> and keep "Install MongoD as a Service" ticked. It then starts automatically with your computer on `127.0.0.1:27017`. *MongoDB Compass* (installed with it) lets you look at the data.
- **Docker:** `docker compose up -d` (uses the included `docker-compose.yml`; data is kept in a Docker volume).

### 2. App

```bash
npm install
cp .env.example .env.local       # Windows: copy .env.example .env.local
# edit .env.local and set AUTH_SECRET to a long random string
npm run dev                      # http://localhost:3000
```

### 3. First run

1. Open <http://localhost:3000>. You'll be asked to **create the Super Admin** account.
2. In **Shops → New shop**, create a shop, choose its **maximum users**, and set the owner's username and password.
3. Log out, log in as the shop owner. The owner adds products, staff (up to the limit) and starts billing.

### Production

```bash
npm run build
npm start
```

Run it on one shop computer (or a server) and open `http://<that-computer-ip>:3000` from other PCs and phones on the same Wi-Fi. For access over the internet, put it behind HTTPS (e.g. a reverse proxy such as Caddy or Nginx).

### Backups

- Shop owners: **Settings → Data → Download backup** (one JSON file per shop).
- Super Admin: **Shops → (shop) → Backup**.
- Whole database: `mongodump --uri "mongodb://127.0.0.1:27017/dukaan" --out backup-folder` (MongoDB Database Tools).

### FBR setup

In **Settings → FBR POS integration** (owner): turn it on, choose *Sandbox* first, enter the **POS ID** and **access token** you receive when registering your POS with FBR, and a default **PCT code** (each product can override it). Test a few bills in Sandbox, then switch to *Live*. Endpoints can be overridden with `FBR_SANDBOX_URL` / `FBR_LIVE_URL`; confirm the current URLs and fields with FBR before going live.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Project structure

```
src/
  app/
    (auth)/login, setup          Login, first-run Super Admin setup
    (app)/                       Main app (sidebar layout)
      admin/                     Super Admin: shops, limits, users
      page.tsx                   Shop dashboard
      pos/ products/ customers/ suppliers/ purchases/ sales/
      production/ expenses/ reports/ settings/
    receipt/[id]                 Printable 80 mm receipt (with FBR QR)
    offline/                     Offline page (PWA)
    api/                         REST API route handlers
  components/                    UI kit, charts, shared pages
  lib/                           DB, auth, tenants, FBR, CSV, backup, business services
  models/                        Mongoose schemas + tenant guard plugin
  middleware.ts                  Login and role-based routing
public/sw.js, icons/             Service worker and app icons
```

## Not included yet

- **Offline billing** (making bills with no connection to the server and syncing later). The app needs the shop server to be reachable; with a local MongoDB and the app on the shop PC, internet is only needed for FBR, and pending FBR bills are re-sent later.
- SMS reminders (WhatsApp reminders are included), restoring from a backup file through the UI, and multiple branches sharing one stock.
