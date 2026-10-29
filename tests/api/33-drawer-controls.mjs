import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Cash drawer controls: handover, variance setting, cash-out limit ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Arslan Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Arslan", username: "arslan", password: "secret1" } });
await owner.login("arslan", "secret1");
const bilal = await owner.call("/api/users", { body: { name: "Bilal", username: "bilal", password: "secret2", role: "cashier" } });
await cashier.login("bilal", "secret2");
const cover = await owner.call("/api/products", { body: { name: "Cover", unit: "pcs", costPrice: 100, salePrice: 300, lowStockAlert: 2, openingStock: 20 } });

section("Owner sets the allowed drawer difference to Rs 10");
const s0 = await owner.call("/api/settings");
await owner.call("/api/settings", { method: "PUT", body: { ...s0, drawerVariance: 10, fbrToken: "" } });

await owner.call("/api/shifts", { body: { openingCash: 1000 } });
await owner.call("/api/sales", { body: { items: [{ productId: cover._id, qty: 1 }], paymentMethod: "cash", amountPaid: 300 } });
const cur = await owner.call("/api/shifts/current");
const sid = cur.shift._id;
eq(cur.summary.expectedCash, 1300, "expected so far = 1000 + 300");

section("Mid-day handover is logged against what should be there");
const r = await owner.call(`/api/shifts/${sid}/handover`, { body: { counted: 1290, toName: "Bilal" } });
const h = r.handovers[r.handovers.length - 1];
eq(h.expected, 1300, "handover: should be Rs 1300");
eq(h.counted, 1290, "handover: counted Rs 1290");
eq(h.difference, -10, "handover: Rs 10 short at this point");

section("Cash-out limit per staff member");
await cashier.call(`/api/shifts/${sid}/movement`, { body: { kind: "out", amount: 100, reason: "Bank deposit" } });
ok(true, "cashier can take cash out by default");
await owner.call(`/api/users/${bilal._id}`, { method: "PUT", body: { allowCashOut: false } });
await cashier.call(`/api/shifts/${sid}/movement`, { body: { kind: "out", amount: 50, reason: "test" }, expect: 403 }).then(() => ok(true, "cashier blocked from cash out once the owner turns it off"));
await cashier.call(`/api/shifts/${sid}/movement`, { body: { kind: "in", amount: 50, reason: "Change from bank" } });
ok(true, "cashier can still put cash IN");

section("Day-close variance uses the owner's setting (Rs 10)");
const cur2 = await owner.call("/api/shifts/current");
eq(cur2.summary.expectedCash, 1250, "expected = 1000 + 300 − 100 cash out + 50 cash in");
await owner.call(`/api/shifts/${sid}/close`, { body: { countedCash: 1230 }, expect: 400 }).then(() => ok(true, "a Rs 20 difference (> Rs 10) needs a reason"));
await owner.call(`/api/shifts/${sid}/close`, { body: { countedCash: 1230, note: "short — investigated" } });
ok(true, "closes with a reason");

await done();
