import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Products list: movement data (sold in 30 days / last sold) and inline quick-edit ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Arslan Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Arslan", username: "arslan", password: "secret1" } });
await owner.login("arslan", "secret1");
await owner.call("/api/users", { body: { name: "Bilal", username: "bilal", password: "secret2", role: "cashier" } });
await cashier.login("bilal", "secret2");

const cover = await owner.call("/api/products", { body: { name: "Type-C Cable", unit: "pcs", costPrice: 300, salePrice: 750, lowStockAlert: 5, openingStock: 20 } });
const glass = await owner.call("/api/products", { body: { name: "Glass Protector", unit: "pcs", costPrice: 40, salePrice: 150, lowStockAlert: 5, openingStock: 30 } });
const cat = await owner.call("/api/categories", { body: { name: "Accessories" } });

section("Movement data on the list");
await cashier.call("/api/sales", { body: { items: [{ productId: cover._id, qty: 3 }], paymentMethod: "cash", amountPaid: 2250 } });
let list = await owner.call("/api/products");
const row = (id) => list.find((p) => p._id === id);
ok(row(cover._id).sold30 === 3, "Type-C Cable: 3 sold in the last 30 days");
ok(!!row(cover._id).lastSoldAt, "Type-C Cable: has a last-sold date");
ok(row(glass._id).sold30 === 0 && row(glass._id).lastSoldAt === null, "Glass Protector: never sold → 0 sold, no last-sold date (dead stock)");

section("Inline quick-edit (owner/manager only)");
const edited = await owner.call(`/api/products/${glass._id}`, { method: "PATCH", body: { salePrice: 199 } });
eq(edited.salePrice, 199, "sale price updated inline");
const priced = await owner.call(`/api/products/${glass._id}`, { method: "PATCH", body: { costPrice: 55 } });
eq(priced.costPrice, 55, "cost price updated inline");
const categorised = await owner.call(`/api/products/${glass._id}`, { method: "PATCH", body: { category: cat._id } });
eq(String(categorised.category?._id ?? categorised.category), String(cat._id), "category changed inline");
const cleared = await owner.call(`/api/products/${glass._id}`, { method: "PATCH", body: { category: null } });
ok(!cleared.category, "category can be cleared");
await owner.call(`/api/products/${glass._id}`, { method: "PATCH", body: {}, expect: 400 }).then(() => ok(true, "empty quick-edit is rejected"));
await cashier.call(`/api/products/${glass._id}`, { method: "PATCH", body: { salePrice: 9 }, expect: 403 }).then(() => ok(true, "cashier cannot quick-edit prices"));

section("The price change is recorded");
const hist = await owner.call(`/api/products/${glass._id}/price-history`);
ok(JSON.stringify(hist).includes("199") || JSON.stringify(hist).includes("55"), "inline price edit shows in price history");

await done();
