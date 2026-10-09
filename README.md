# Dukaan Manager

A simple, modern shop management system for **karyana stores, general stores and bakeries** in Pakistan.
Built with **Next.js 15 (App Router) + MongoDB (Mongoose) + Tailwind CSS**.

Designed for non-technical shopkeepers: big buttons, plain language, English with Urdu labels.

## Features

| Area | What you can do |
|---|---|
| **New Bill (POS)** | Barcode scan or search, category tabs, sell loose items **by kg or by rupees** (e.g. "Rs 100 ki cheeni"), discounts, change calculation, Cash / JazzCash / Easypaisa / Card / Bank / Udhaar, 80 mm thermal receipt printing. Keyboard: `F2` search, `F9` pay. |
| **Products & Stock** | Units (piece, kg, gram, litre, dozen, pack…), cost & sale price, profit per item, low-stock alerts, expiry dates, stock add / remove / wastage / exact count, full stock movement history. |
| **Customers Khata** | Digital udhaar register with running balance, credit limits, partial payments, opening balance from the old register, **WhatsApp payment reminder**. |
| **Suppliers & Purchases** | Record incoming stock; stock, cost and sale prices update automatically; supplier payable khata. |
| **Expenses** | Rent, bijli, gas, salaries etc. |
| **Reports** | Sales, profit & loss, best sellers with profit, payment-method breakdown, expenses, returns — any date range, printable. |
| **Dashboard** | Today's sales/profit, udhaar to collect, supplier dues, 7-day chart, low stock, recent bills. |
| **Staff & roles** | Owner (everything), Manager (no settings/users), Cashier (billing and receiving udhaar only, cannot change prices). |
| **Tax** | Optional sales tax (e.g. 18% GST), inclusive or exclusive pricing, NTN/STRN on receipt. |

## Standards & good practices

- Passwords hashed with bcrypt; sessions are signed, `httpOnly` JWT cookies; role checks on every API route.
- Every input validated with Zod; friendly error messages.
- Money rounded to 2 decimals on the server (no floating-point drift); prices are always re-read from the database at billing.
- Stock and khata changes use atomic MongoDB `$inc` updates; every change is recorded (stock movements + ledger entries) for a full audit trail.
- Sequential, gap-free invoice numbers (`INV-000001`), ISO 4217 currency (PKR), dates stored in UTC and reported in `Asia/Karachi`.
- Products are soft-deleted so old bills stay correct; bills are returned (not deleted).

## Getting started

Requirements: **Node.js 20+** and **MongoDB 6+** (local, Docker, or free [MongoDB Atlas](https://www.mongodb.com/atlas)).

```bash
npm install
cp .env.example .env.local     # then edit the values
npm run dev                     # http://localhost:3000
```

`.env.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/dukaan
AUTH_SECRET=<long random string, e.g. from: openssl rand -base64 32>
TZ=Asia/Karachi
```

Run MongoDB quickly with Docker: `docker run -d -p 27017:27017 --name mongo mongo:7`

On first open you'll see a 3-step setup wizard (shop type → shop details → owner account).
Ready-made categories are created for your shop type.

### Production

```bash
npm run build
npm start
```

### Checks

```bash
npm run lint
npm run typecheck
```

## Project structure

```
src/
  app/
    (auth)/login, setup        Login and first-time setup wizard
    (app)/                     Main app (sidebar layout)
      page.tsx                 Dashboard
      pos/                     Billing screen
      products/ customers/ suppliers/ purchases/ sales/ expenses/ reports/ settings/
    receipt/[id]               Printable 80mm receipt
    api/                       REST API route handlers
  components/                  UI kit, charts, shared pages
  lib/                         DB connection, auth, API helpers, business services
  models/                      Mongoose schemas
  middleware.ts                Redirects logged-out users to /login
```

## Roadmap

- FBR POS integration (invoice number + QR on receipt)
- Bakery production / recipes (bill of materials)
- Multi-branch and stock transfers
- Offline mode (PWA) and Urdu-first interface toggle
- SMS reminders, CSV import/export, backups
