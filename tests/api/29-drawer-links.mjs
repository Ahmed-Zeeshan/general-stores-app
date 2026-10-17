import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Bills ↔ cash drawer: links, late offline bills, recount, float handover ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Link Mart", shopType: "general", maxUsers: 4, ownerName: "Rafiq", username: "rafiq", password: "secret1" } });
await owner.login("rafiq", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const soap = await owner.call("/api/products", { body: { name: "Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 0, openingStock: 500 } });
const bill = (who, extra = {}, expect = 200) => who.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1 }], paymentMethod: "cash", ...extra }, expect });
const wide = "from=2000-01-01&to=2100-01-01";

section("A bill made with no drawer open");
const loose = await bill(cashier);
ok(!loose.shift && !loose.shiftNo, "no drawer: the bill has no drawer link");
let cur = await cashier.call("/api/shifts/current");
eq(cur.unlinked.bills, 1, "the drawer page says 1 bill today was made with the drawer closed");
eq(cur.unlinked.cash, 100, "…with Rs 100 cash");

section("Bills and refunds carry their drawer");
const s1 = await cashier.call("/api/shifts", { body: { openingCash: 1000 } });
const b1 = await bill(cashier);
eq(b1.shiftNo, s1.shiftNo, "bill linked to the open drawer " + s1.shiftNo);
const b2 = await bill(owner, { items: [{ productId: soap._id, qty: 3 }] });
const ret = await owner.call(`/api/sales/${b2._id}/return`, { body: { items: [{ index: 0, qty: 1 }], refundMethod: "cash" } });
eq(ret.return.shiftNo, s1.shiftNo, "cash refund linked to the drawer it was paid from");
const inDrawer = await owner.call(`/api/sales?${wide}&branch=all&shift=${s1._id}`);
ok(inDrawer.length === 2 && inDrawer.every((s) => s.shiftNo === s1.shiftNo), "Sales History filtered to this drawer: its 2 bills only");
eq((await owner.call(`/api/returns?${wide}&branch=all&shift=${s1._id}`)).length, 1, "…and its 1 return");
cur = await owner.call("/api/shifts/current");
eq(cur.summary.bills, 2, "X report: 2 bills (the bill made before opening is not in this drawer)");
eq(cur.summary.firstBill, b1.invoiceNo, "first bill number");
eq(cur.summary.lastBill, b2.invoiceNo, "last bill number");
eq(cur.summary.avgBill, 200, "average bill (100 + 300) / 2");
ok(cur.summary.byCashier.length === 2 && cur.summary.byCashier.some((c) => c.name === "Kashif" && c.bills === 1), "sales by cashier");
eq(cur.summary.expectedCash, 1000 + 100 + 300 - 100, "expected cash: opening + bills − refund");

section("Close: recount prompt, reason, float for tomorrow");
let e = await cashier.call(`/api/shifts/${s1._id}/close`, { body: { countedCash: 1000 }, expect: 400 });
ok(/does not match/.test(e.error) && !/Rs/.test(e.error), "cashier counting Rs 300 short: asked to count again, amount not shown (blind count)");
e = await owner.call(`/api/shifts/${s1._id}/close`, { body: { countedCash: 1000 }, expect: 400 });
ok(/Rs 300 SHORT/.test(e.error), "owner is told the amount: " + e.error);
await cashier.call(`/api/shifts/${s1._id}/close`, { body: { countedCash: 1300, floatLeft: 1500 }, expect: 400 }).then((x) => ok(/cannot be more/.test(x.error), "cannot keep more than was counted"));
const c1 = await cashier.call(`/api/shifts/${s1._id}/close`, { body: { countedCash: 1250, floatLeft: 1000, note: "Rs 50 given as change twice" } });
eq(c1.difference, -50, "Rs 50 short is under the Rs 100 limit… but the note is kept anyway");
eq(c1.floatLeft, 1000, "Rs 1,000 kept in the drawer for tomorrow");
eq(c1.removedAtClose, 250, "Rs 250 taken out at close");

section("Late offline bill: made while the drawer was open, arrived after it closed");
const madeAt = new Date((new Date(s1.openedAt).getTime() + new Date(c1.closedAt).getTime()) / 2).toISOString(); // while s1 was open
const late = await bill(cashier, { clientId: "late-offline-0001", soldAt: madeAt, items: [{ productId: soap._id, qty: 2 }] });
eq(late.shiftNo, s1.shiftNo, "the late bill belongs to the drawer that was open when it was made");
const s1after = await owner.call(`/api/shifts/${s1._id}`);
ok(s1after.late?.length === 1 && s1after.late[0].no === late.invoiceNo && s1after.late[0].cash === 200, "its Z report lists it: Rs 200 cash that arrived after the close");
eq(s1after.difference, -50, "the saved count is not changed");

section("Opening is checked against what the last close left");
cur = await cashier.call("/api/shifts/current");
eq(cur.lastClose.floatLeft, 1000, "the opening screen knows Rs 1,000 was left");
const s2 = await cashier.call("/api/shifts", { body: { openingCash: 900 } });
eq(s2.openingDifference, -100, "opened with Rs 900: Rs 100 missing is recorded");
const log = (await owner.call("/api/activity")).rows;
ok(log.some((r) => r.action === "drawer.open" && /Rs 100 is MISSING/.test(r.summary)), "…and shown in the activity log");

section("Cash refunds follow the open-drawer rule");
const base = { shopName: "Link Mart", shopType: "general", taxEnabled: false, taxRate: 0, pricesIncludeTax: true };
await owner.call(`/api/shifts/${s2._id}/close`, { body: { countedCash: 900 } });
await owner.call("/api/settings", { method: "PUT", body: { ...base, requireOpenDrawer: true } });
const b3 = await bill(owner, { clientId: "offline-cash-0002", soldAt: new Date(Date.now() - 30_000).toISOString() });
e = await owner.call(`/api/sales/${b3._id}/return`, { body: { refundMethod: "cash" }, expect: 409 });
ok(/cash drawer is not open/.test(e.error), "cash refund refused while the drawer is closed");
const cardRet = await owner.call(`/api/sales/${b3._id}/return`, { body: { refundMethod: "bank" } });
ok(cardRet.return.refundMethod === "bank" && !cardRet.return.shiftNo, "a bank refund is allowed (no cash leaves the drawer)");

await done();
