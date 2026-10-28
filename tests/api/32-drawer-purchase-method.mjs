import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Cash drawer: only CASH purchases come out of the drawer (bug fix) ----------
const admin = new Client("admin"), owner = new Client("owner");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Arslan Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Arslan", username: "arslan", password: "secret1" } });
await owner.login("arslan", "secret1");

const cover = await owner.call("/api/products", { body: { name: "Cover A54", unit: "pcs", costPrice: 100, salePrice: 300, lowStockAlert: 2, openingStock: 20 } });
const sup = await owner.call("/api/parties", { body: { type: "supplier", name: "Accessory Wholesaler", phone: "0300-0000000" } });

section("Open the drawer and take a cash sale");
await owner.call("/api/shifts", { body: { openingCash: 1000 } });
await owner.call("/api/sales", { body: { items: [{ productId: cover._id, qty: 1 }], paymentMethod: "cash", amountPaid: 300 } });

section("A cash purchase and a bank purchase");
await owner.call("/api/purchases", { body: { supplierId: sup._id, amountPaid: 500, payMethod: "cash", items: [{ productId: cover._id, qty: 5, cost: 100 }] } });
await owner.call("/api/purchases", { body: { supplierId: sup._id, amountPaid: 700, payMethod: "bank", items: [{ productId: cover._id, qty: 7, cost: 100 }] } });

const cur = await owner.call("/api/shifts/current");
const flow = Object.fromEntries((cur.summary.cashFlow ?? []).map((x) => [x.label, x.amount]));
eq(flow["Opening cash"], 1000, "opening cash 1000");
eq(flow["Cash sales"], 300, "cash sales 300");
eq(flow["Purchases paid"], -500, "only the CASH purchase (500) is taken from the drawer — the bank purchase is not");
eq(cur.summary.expectedCash, 800, "expected = 1000 + 300 − 500 (bank purchase excluded)");

await done();
