import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Reorder list: what to buy, from whom, from how fast things sell ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Madina Karyana", shopType: "karyana", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret1" } });
await owner.login("bilal", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");

const supA = await owner.call("/api/parties", { body: { type: "supplier", name: "Al-Madina Traders", phone: "0300-1112223" } });
const supB = await owner.call("/api/parties", { body: { type: "supplier", name: "Lahore Cash & Carry", phone: "0301-4445556" } });
const prod = (name, unit, lowStockAlert, cost) => owner.call("/api/products", { body: { name, unit, costPrice: cost, salePrice: cost + 20, lowStockAlert } });
const sugar = await prod("Sugar", "kg", 5, 140);
const tea = await prod("Tea Pack 475g", "pcs", 2, 1080);
const salt = await prod("Salt 800g", "pcs", 5, 60);
const matches = await prod("Matchbox", "pcs", 0, 8);
await owner.call("/api/purchases", { body: { supplierId: supA._id, amountPaid: 0, items: [{ productId: sugar._id, qty: 35, cost: 138 }, { productId: tea._id, qty: 40, cost: 1080 }] } });
await owner.call("/api/purchases", { body: { supplierId: supB._id, amountPaid: 0, items: [{ productId: salt._id, qty: 2, cost: 60 }] } });
await owner.call(`/api/products/${matches._id}/stock`, { body: { mode: "add", qty: 100, note: "count" } });
// Sugar sells 30 kg in the period (1 kg a day); tea 3 packs.
for (let i = 0; i < 3; i++) await cashier.call("/api/sales", { body: { items: [{ productId: sugar._id, qty: 10 }, { productId: tea._id, qty: 1 }], paymentMethod: "cash" } });

section("Two weeks");
await cashier.call("/api/reorder", { expect: 403 }).then(() => ok(true, "cashier cannot open the reorder list"));
let r = await owner.call("/api/reorder");
eq(r.days, 14, "default: enough for 2 weeks");
const find = (name) => r.groups.flatMap((g) => g.rows.map((x) => ({ ...x, supplier: g.supplier?.name }))).find((x) => x.name === name);
let s = find("Sugar");
ok(s && s.stock === 5 && s.perDay === 1 && s.daysLeft === 5 && s.suggest === 9 && s.supplier === "Al-Madina Traders", "Sugar: 5 kg left, sells 1 kg a day → lasts 5 days, order 9 kg from Al-Madina Traders");
ok(s.lastCost === 138 && s.value === 1242, "cost from the last purchase price (Rs 138 × 9)");
ok(!find("Tea Pack 475g"), "Tea: 37 left at 0.1 a day — enough, not listed");
const sl = find("Salt 800g");
ok(sl && sl.reason === "low" && sl.suggest === 8 && sl.supplier === "Lahore Cash & Carry", "Salt: not selling but at its alert level (2 ≤ 5) → order 8 from Lahore Cash & Carry");
ok(!find("Matchbox"), "items without sales or alert level are not listed");
ok(r.groups.every((g) => g.supplier) && r.groups.length === 2, "grouped by supplier");

section("One month");
r = await owner.call("/api/reorder?days=30");
s = find("Sugar");
ok(s.suggest === 25, "Sugar for a month: 30 − 5 = 25 kg");
eq((await owner.call("/api/reorder?days=1000")).days, 14, "odd values fall back to 2 weeks");
await done();
