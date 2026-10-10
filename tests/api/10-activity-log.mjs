import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Activity / audit log ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), manager = new Client("manager"), other = new Client("other"), bad = new Client("bad");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
const shop = await admin.call("/api/admin/tenants", { body: { shopName: "Audit Mart", shopType: "general", maxUsers: 4, ownerName: "Hamza", username: "hamza", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 2, ownerName: "Zara", username: "zara", password: "secret1" } });
await owner.login("hamza", "secret1");
await other.login("zara", "secret1");
const kashif = await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await owner.call("/api/users", { body: { name: "Maryam", username: "maryam", password: "secret3", role: "manager" } });
await cashier.login("kashif", "secret2");
await manager.login("maryam", "secret3");
await bad.login("kashif", "wrong-pass", 401);
const item = await owner.call("/api/products", { body: { name: "Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 1, openingStock: 100 } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Bilal", openingBalance: 500 } });
const log = async (qs = "") => (await owner.call(`/api/activity?${qs}`)).rows;
const has = (rows, action, re) => rows.some((r) => r.action === action && (!re || re.test(r.summary)));

section("Logins and staff");
let rows = await log();
ok(has(rows, "login", /Kashif logged in/), "cashier login recorded");
ok(has(rows, "login.failed", /kashif/), "wrong password recorded");
ok(has(rows, "user.create", /Kashif \(kashif\) as cashier/), "staff added recorded");
ok(has(rows, "khata.opening", /Bilal.*500/), "old balance recorded");

await cashier.call("/api/activity", { expect: 403 }).then(() => ok(true, "cashier cannot read the log"));

section("Counter actions");
await cashier.call("/api/sales", { body: { items: [{ productId: item._id, qty: 2, price: 1 }], paymentMethod: "cash" } });
rows = await log("group=sales");
eq(rows.length, 0, "cashier bill at normal price: nothing to record");
const s = await owner.call("/api/sales", { body: { items: [{ productId: item._id, qty: 2, price: 90 }], discount: 10, paymentMethod: "cash" } });
rows = await log("group=sales");
ok(has(rows, "sale.price", /Soap 100 → 90.*bill discount Rs 10/), "owner price change + discount recorded");
await owner.call(`/api/sales/${s._id}/return`, { body: { items: [{ index: 0, qty: 1 }], reason: "Damaged" } });
rows = await log("group=sales");
ok(has(rows, "sale.return", /RTN-000001.*Soap ×1.*Damaged/), "return recorded");
const pay = await cashier.call(`/api/parties/${cust._id}/payment`, { body: { type: "payment", amount: 200, method: "cash" } });
await owner.call(`/api/ledger/${pay._id}/reverse`, { body: { reason: "Entered twice" } });
await owner.call(`/api/parties/${cust._id}/payment`, { body: { type: "charge", amount: 75, note: "Eggs" } });
rows = await log("group=money");
ok(has(rows, "payment.receive", /Received Rs 200.*Bilal.*RCP-000001/), "payment recorded");
ok(has(rows, "payment.cancel", /RCP-000001.*Entered twice/), "payment cancel recorded");
ok(has(rows, "khata.charge", /Rs 75.*Bilal.*Eggs/), "manual udhaar recorded");

section("Stock, prices, settings, drawer");
await manager.call(`/api/products/${item._id}/stock`, { body: { mode: "wastage", qty: 3, note: "Broken" } });
await owner.call(`/api/products/${item._id}`, { method: "PUT", body: { name: "Soap", unit: "pcs", costPrice: 80, salePrice: 110, lowStockAlert: 1 } });
const st = await owner.call("/api/settings");
await owner.call("/api/settings", { method: "PUT", body: { shopName: st.shopName, shopType: st.shopType, taxEnabled: true, taxRate: 5, pricesIncludeTax: true } });
const sh = await cashier.call("/api/shifts", { body: { openingCash: 1000 } });
await cashier.call(`/api/shifts/${sh._id}/movement`, { body: { kind: "out", amount: 50, reason: "Tea" } });
await cashier.call(`/api/shifts/${sh._id}/close`, { body: { countedCash: 1000 } });
await owner.call(`/api/users/${kashif._id}`, { method: "PUT", body: { active: false } });
rows = await log();
ok(has(rows, "stock.wastage", /Soap: -3 pcs wastage — Broken/), "wastage recorded (by manager)");
ok(rows.find((r) => r.action === "stock.wastage")?.userName === "Maryam", "who did it");
ok(has(rows, "product.price", /sale price 100 → 110/), "price change recorded");
ok(has(rows, "settings.update", /sales tax on\/off, tax rate/), "settings change recorded (plain words)");
ok(has(rows, "drawer.open", /Rs 1000/) && has(rows, "drawer.out", /Rs 50 — Tea/) && has(rows, "drawer.close", /over Rs/), "drawer open / cash out / close recorded");
ok(has(rows, "user.update", /Kashif: disabled/), "staff disabled recorded");
await admin.call(`/api/admin/tenants/${shop._id}`, { method: "PUT", body: { maxUsers: 6 } });
ok(has(await log(), "admin.update", /maxUsers 4 → 6/), "administrator change visible to the owner");

section("Who can see it");
await manager.call("/api/activity", { expect: 403 }).then(() => ok(true, "manager cannot read the log"));
await cashier.call("/api/activity", { expect: 401 }).then(() => ok(true, "disabled cashier is logged out at once"));
const theirs = (await other.call("/api/activity")).rows;
ok(!theirs.some((r) => /Audit|Kashif|Bilal|Soap/.test(r.summary)), "other shop sees none of it");
const byInv = await log(`q=${encodeURIComponent(s.invoiceNo)}`);
ok(byInv.length >= 1 && byInv.every((r) => r.summary.includes(s.invoiceNo) || r.refNo === s.invoiceNo), "search by bill number");
const byUser = await log(`user=${kashif._id}`);
ok(byUser.length > 0 && byUser.every((r) => r.userName === "Kashif"), "filter by person");
const backup = await owner.call("/api/backup");
await owner.call("/api/restore", { body: { backup, confirm: "Audit Mart" } });
rows = await log();
ok(has(rows, "backup.restore") && has(rows, "backup.download") && has(rows, "sale.return"), "log survives a restore and records it");
eq((await owner.raw("/activity")).status, 200, "activity page");

await done();
