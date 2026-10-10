# Dukaan Manager

Multi-shop management system for **karyana stores, general stores and bakeries** in Pakistan.
Built with **Next.js 15 (App Router) + MongoDB (Mongoose) + Tailwind CSS**.

Designed for non-technical shopkeepers: big buttons, plain language, English with Urdu labels, works on PC, tablet and phone (installable as an app).

---

## How accounts work (multi-tenant)

```
Super Admin (platform)
 ├── Shop A  (limit: 3 users, 2 branches)   ← each shop = one tenant, data fully separated
 │    ├── Main Branch / Gulberg Branch       ← each branch has its own stock
 │    ├── Owner      – everything in the shop, manages staff and branches
 │    ├── Manager    – products, purchases, production, transfers, expenses, reports, returns
 │    └── Cashier    – billing and receiving udhaar only (can be locked to one branch)
 └── Shop B  (limit: 5 users, 1 branch)
      └── ...
```

| Who | Can do |
|---|---|
| **Super Admin** | Create shops with their owner login · set **maximum users and branches per shop** · set plan name and **access-until date** · suspend / re-activate a shop · add users to any shop, reset passwords, enable/disable users · download any shop's backup · see sales, users and activity of all shops |
| **Shop Owner** | Everything inside their shop · add/disable staff and branches **up to the limits set by the Super Admin** · shop settings, tax, FBR, WhatsApp · import/export/backup/restore |
| **Manager** | Daily operations except settings and staff |
| **Cashier** | New bills, customers and receiving udhaar; cannot change prices |

Data isolation is enforced in the database layer: every shop record carries a `tenant` id, and a Mongoose guard **refuses any query or aggregation that does not filter by tenant**, so one shop can never read or change another shop's data. Suspending a shop, an expired access date, or disabling a user takes effect within 15 seconds, even for people already logged in.

## Features

| Area | What you can do |
|---|---|
| **New Bill (POS)** | Barcode scan or search, category tabs, loose items **by kg or by rupees** ("Rs 100 ki cheeni"), discounts, change calculation, Cash / JazzCash / Easypaisa / Card / Bank / Udhaar, **split payment** (e.g. part cash + part JazzCash, rest on udhaar) with optional transaction IDs, 80 mm thermal receipts. **Hold** a bill to serve the next customer and open it again later (kept on the device, works offline). **Receive udhaar** right from the bill screen. `F2` search, `F9` pay, `F4` hold, `F6` held bills, `F8` receive udhaar. |
| **Products & Stock** | Units (piece, kg, gram, litre, dozen…), cost & sale price, low-stock and expiry alerts, stock add / remove / wastage / exact count, full stock history. |
| **Production (bakery)** | Recipes (ingredients per batch → finished items), production runs that deduct ingredients and add finished stock, automatic cost per item, shortage warnings, production history. |
| **Packs, cartons & wholesale** | A product can also be sold or bought as a carton, dozen or box (up to 5 sizes) with its own price, wholesale price and barcode — scanning the carton barcode adds a carton; stock is always counted in the loose unit. Customers marked **wholesale** automatically get wholesale prices at the counter. |
| **Expiry by batch (FEFO)** | Turn on *Track expiry by batch* for dairy, bakery, medicines or snacks. Every delivery keeps its own expiry date and batch number (or *shelf life* fills it, e.g. bread 3 days); bills automatically sell the lot that expires first, customer returns go back to their lot, supplier returns and transfers carry the right lots. The **Expiry** page lists expired lots and those expiring in 7 / 30 / 90 days with their value, and *Write off* removes an expired lot as wastage. |
| **Offers & loyalty points** | Offers apply automatically at the counter: % off or Rs off on chosen items / categories / everything, *buy X get Y free*, and bill offers (e.g. 5% off bills over Rs 2,000, up to Rs 150), with start and end dates. Each item gets its best offer; wholesale customers and hand-typed prices don't get offers. **Loyalty points**: customers earn points on what they pay (e.g. 1 point per Rs 100) and spend them as a discount on later bills; returns take earned points back; points history on the customer page. |
| **Urdu interface** | *English / اردو* switch on the login page and in the menu (remembered per computer). The menu, New Bill screen, payment, held bills, receive-udhaar and login appear in Urdu (Nastaliq); amounts and numbers stay in English digits so they match receipts. |
| **Customers Khata** | Udhaar with running balance, credit limits, opening balances, printable **khata statement** (save as PDF). **Full or part payments** with one-tap *Full* / *Half* amounts, any method (cash, JazzCash, Easypaisa, bank, card); extra money is kept as advance. Every payment gets a numbered **payment receipt** (RCP-…, printable 80 mm, Urdu heading) and a **WhatsApp confirmation** with the amount and the balance still due. A payment entered by mistake can be cancelled by the owner/manager (kept in the khata as cancelled, never deleted). Supplier payments get a numbered voucher (PAY-…). |
| **Udhaar Report & WhatsApp** | Who owes how much and for how long (0–30 / 31–60 / 61–90 / 90+ days, payments clear the oldest udhaar first), last payment, last reminder. One click opens **WhatsApp Desktop or WhatsApp Web** with the reminder already typed; "Remind all" walks through customers one by one. Message template is editable. Print or export to Excel. |
| **Barcodes** | **USB/Bluetooth scanners** work anywhere on the billing, products, purchase, transfer and label screens. **Camera scanning** on phones/laptops. **Create barcodes** for items without one (GS1 in-store EAN-13 starting with 20, never clashes with company barcodes). **Print labels** on label printers (38×25, 50×30 mm) or A4 sticker sheets (24 or 40 per sheet) with shop name, product, price and barcode. |
| **Branches** | Each branch has its own stock; bills, purchases, production and expenses belong to a branch; **stock transfers** between branches; reports per branch or all branches; staff can be locked to one branch. |
| **Offline billing** | If the internet or the shop server goes down, the New Bill screen keeps working from the products saved on the device. Bills are stored on the device and sent automatically when the connection returns (never twice). A provisional receipt can be printed. |
| **Cash Drawer & Day Close (Z report)** | Open the day with the cash in the drawer, record cash put in / taken out (bank deposit, change), and close by counting notes (5000…10 and coins) or entering the total. The app works out the cash that should be there — cash sales, udhaar collected in cash, refunds, cash expenses, purchases and supplier payments — and shows *Exact / Short / Over*. Cashiers count blind (they see the expected amount only after closing). Printable 80 mm **Z report**, live **X report** for the owner, history of every day close per branch. |
| **Suppliers & Purchases** | Incoming stock updates stock, cost and sale prices; supplier payable khata. **Return goods to the supplier** (damaged, expired, wrong items — any quantity, any number of times), settled by reducing the supplier's khata or as cash back; each return gets its own number (PRN-…). **Cancel a purchase** entered by mistake: stock, khata and payment are reversed and it stays in the list marked *Cancelled*. Stock already sold can't be sent back. |
| **Expenses, Sales history, Returns** | Return **some or all items** of a bill, as many times as needed (e.g. 2 of 5 soaps today, the rest next week). Each return keeps its fair share of the bill discount and tax, reduces the bill's udhaar first, and gives the rest back in cash / the original method or as credit in the customer's khata. Every return has its own number (RTN-…), receipt and FBR credit note; stock goes back to the branch that sold it. |
| **Reports & Dashboard** | Sales, profit & loss **net of returns**, best sellers, payment methods, refunds, **udhaar collected**, payments to suppliers, expenses; 7-day chart. |
| **Activity Log** (owner) | Who did what and when: price changes and discounts at the counter, returns, payments and cancelled payments, udhaar added by hand, stock adjustments, wastage and write-offs, product price changes, purchases, drawer open/close (short/over), logins and wrong passwords, staff and settings changes, backups/restores and administrator changes. Risky actions are highlighted; filter by type, person or bill number; export to Excel. Kept for about 13 months and never replaced by a restore. |
| **FBR POS integration** | Bills are sent to FBR; FBR invoice number + QR code printed on the receipt; returns sent as credit notes; if internet/FBR is down bills are saved as *pending* and re-sent with one click. |
| **Data** | Export products / customers / suppliers / sales / expenses to Excel (CSV), **import products from CSV**, full JSON backup and **restore** (same shop only, validated first, safety copy downloaded before replacing). |
| **Installable app (PWA)** | "Install" / "Add to Home Screen" on Chrome, Edge and Android. |
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

### Barcode scanner & camera

- **USB / Bluetooth scanners**: plug in and scan. No setup needed; the app recognises the fast typing + Enter that scanners send.
- **Camera**: browsers only allow the camera on `https://` or on `localhost`. On the shop PC (`http://localhost:3000`) it works directly. For phones on the shop Wi-Fi, serve the app over HTTPS (e.g. Caddy with a local certificate) or use a USB/Bluetooth scanner.
- **Labels**: Products → *Create barcodes* gives every item without a barcode its own in-store code; *Print labels* (or the barcode icon on a product) prints stickers. For label printers set the paper size to the label size, margins none, scale 100%.

### WhatsApp reminders

Install **WhatsApp Desktop** on the shop PC (or keep **web.whatsapp.com** logged in). In the Udhaar Report choose *WhatsApp Desktop* or *WhatsApp Web* (remembered per computer). Clicking *WhatsApp* opens the chat with the message typed; you only press Send. After a customer pays, the *WhatsApp* button on the payment screen (or the payment receipt) sends a thank-you with the receipt number and remaining balance. Edit both messages in **Settings → WhatsApp messages**. To send a full statement, open *Statement*, choose *Print → Save as PDF* and attach the PDF in WhatsApp.

### Receipt printer, silent printing & cash drawer

1. **Install the printer** (any 80 mm or 58 mm thermal printer: Black Copper, XPrinter, Epson TM, Sewoo …) with its Windows driver and make it the **default printer**. In the driver's *Printing Preferences* choose the paper size (80 × 297 mm / 58 mm, or "Roll paper") and set margins to the minimum.
2. **Cash drawer:** plug the drawer's RJ11 cable into the printer's *DK / Cash Drawer* port. In the printer's *Printing Preferences → Cash Drawer* (sometimes *Device Settings → Peripherals*) choose **"Open drawer before printing"** (Drawer #1, pulse 50–100 ms). The drawer now opens with every receipt — no extra software needed.
3. **Silent printing (no print window):** make a Chrome shortcut for the counter and add `--kiosk-printing` to it, e.g.

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=http://localhost:3000/pos
   ```

   (`--app` opens the POS in its own clean window; add `--kiosk` for full screen.) Close all Chrome windows before starting from this shortcut. Printing then goes straight to the default printer.
4. In the app: **Settings → Printing (this computer)** — turn on *Print the receipt automatically*, choose 80 mm or 58 mm, optionally a *shop copy* for udhaar bills, and press **Print a test receipt**. Cashiers can also switch automatic printing on or off from the *Bill saved* window. These settings are stored per computer, so set them on every counter.

### Backups & restore

- Shop owners: **Settings → Data → Download backup** (one JSON file per shop) and **Restore from backup**.
- Super Admin: **Shops → (shop) → Backup / Restore from backup**.
- Restore only accepts a backup of the same shop, checks the whole file before changing anything, keeps staff logins and the admin's limits, and asks you to download a safety copy first.
- Whole database: `mongodump --uri "mongodb://127.0.0.1:27017/dukaan" --out backup-folder` (MongoDB Database Tools).

### FBR setup

In **Settings → FBR POS integration** (owner): turn it on, choose *Sandbox* first, enter the **POS ID** and **access token** you receive when registering your POS with FBR, and a default **PCT code** (each product can override it). Test a few bills in Sandbox, then switch to *Live*. Endpoints can be overridden with `FBR_SANDBOX_URL` / `FBR_LIVE_URL`; confirm the current URLs and fields with FBR before going live.

## Super Admin login

There is no built-in account: the first person to open a new database creates the Super Admin.
To create it from the command line, or to reset a forgotten Super Admin password:

```bash
npm run reset-admin                                              # prints username and a new random password
npm run reset-admin -- --username admin --password "YourStrongPass1"   # choose your own
```

Shop owners and staff are created inside the app (Shops → New shop, Settings → Staff accounts).

## Troubleshooting

**Do not run `npm audit fix --force`.** It installs breaking major versions of packages and can stop the app from working. Versions are pinned and tested; production dependencies report 0 vulnerabilities (`npm audit --omit=dev`).

If the app shows a styling/build error after packages were changed, go back to the tested versions (Windows Command Prompt shown; on Mac/Linux use `rm -rf node_modules .next`):

```bash
git checkout -- package.json package-lock.json
rmdir /s /q node_modules
rmdir /s /q .next
npm ci
npm run dev
```

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
      admin/                     Super Admin: shops, limits, users, restore
      page.tsx                   Shop dashboard
      pos/ products/ customers/ suppliers/ purchases/ sales/ udhaar/ labels/
      transfers/ production/ expenses/ reports/ settings/
    receipt/[id]                 Printable 80 mm receipt (with FBR QR)
    statement/[id]               Printable A4 khata statement
    offline/                     Offline page (PWA)
    api/                         REST API route handlers
  components/                    UI kit, charts, shared pages
  lib/                           DB, auth, tenants, branches, FBR, CSV, backup/restore,
                                 udhaar ageing, WhatsApp, barcodes, offline outbox
  models/                        Mongoose schemas + tenant guard plugin
  middleware.ts                  Login and role-based routing
public/sw.js, icons/             Service worker and app icons
```

## Notes and limits

- **Offline billing** covers the New Bill screen on a device that has opened it before while online. Other screens (reports, products, khata) need the server. Offline bills get their final bill number and FBR number when they are sent.
- **WhatsApp** messages are opened ready to send; WhatsApp does not allow a website to press Send by itself, so the shopkeeper confirms each message.
