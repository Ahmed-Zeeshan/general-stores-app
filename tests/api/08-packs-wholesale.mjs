import { Client, ok, eq, section, r2, done } from "../lib/harness.mjs";

// ---------- Packs / cartons and wholesale prices ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Pack Mart", shopType: "general", maxUsers: 4, ownerName: "Hamza", username: "hamza", password: "secret1" } });
await owner.login("hamza", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");

section("Products with packs");
const soap = await owner.call("/api/products", {
  body: {
    name: "Lux Soap", unit: "pcs", barcode: "8961000000017", costPrice: 80, salePrice: 100, wholesalePrice: 90, lowStockAlert: 5, openingStock: 500,
    packs: [{ name: "Carton", size: 24, price: 2300, wholesalePrice: 2100, barcode: "CARTON-LUX" }, { name: "Dozen", size: 12 }],
  },
});
eq(soap.packs.length, 2, "2 pack sizes saved");
eq(soap.wholesalePrice, 90, "wholesale price saved");
ok(soap.packs[1].price === undefined, "dozen without own price");
await owner.call("/api/products", { body: { name: "Clash", unit: "pcs", barcode: "CARTON-LUX", costPrice: 1, salePrice: 2, lowStockAlert: 1 }, expect: 409 }).then((e) => ok(/Lux Soap/.test(e.error), "barcode used by a carton is refused: " + e.error));
await owner.call("/api/products", { body: { name: "Clash2", unit: "pcs", costPrice: 1, salePrice: 2, lowStockAlert: 1, packs: [{ name: "Box", size: 6, barcode: "8961000000017" }] }, expect: 409 }).then(() => ok(true, "pack barcode used by a product is refused"));
await owner.call("/api/products", { body: { name: "Clash3", unit: "pcs", costPrice: 1, salePrice: 2, lowStockAlert: 1, packs: [{ name: "Box", size: 6 }, { name: "box", size: 12 }] }, expect: 400 }).then((e) => ok(/twice/.test(e.error), "same pack name twice refused"));
await owner.call("/api/products", { body: { name: "Clash4", unit: "pcs", costPrice: 1, salePrice: 2, lowStockAlert: 1, packs: [{ name: "Box", size: 0 }] }, expect: 400 }).then(() => ok(true, "pack size 0 refused"));
const found = await owner.call("/api/products?q=CARTON-LUX");
ok(found.length === 1 && found[0]._id === soap._id, "search finds product by carton barcode");

section("Selling packs");
const retail = await owner.call("/api/parties", { body: { type: "customer", name: "Bilal" } });
const whole = await owner.call("/api/parties", { body: { type: "customer", name: "Shah Traders", priceLevel: "wholesale" } });
eq(whole.priceLevel, "wholesale", "wholesale customer saved");
let s = await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 2, pack: "Carton" }], paymentMethod: "cash", customerId: retail._id } });
eq(s.total, 4600, "2 cartons at 2300");
eq(s.items[0].qty, 48, "stored as 48 pcs");
ok(s.items[0].pack.name === "Carton" && s.items[0].pack.count === 2 && s.items[0].pack.size === 24, "pack details on the bill");
eq(s.costTotal, 48 * 80, "cost in units");
const cartonBill = s;
let st = (await owner.call(`/api/products/${soap._id}`)).product.stock;
eq(st, 452, "stock 500 - 48");
s = await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1, pack: "dozen" }], paymentMethod: "cash" } });
eq(s.total, 1200, "dozen without own price = 12 x 100");
await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1, pack: "Crate" }], paymentMethod: "cash" }, expect: 400 }).then((e) => ok(/not sold in "Crate"/.test(e.error), "unknown pack refused"));

section("Wholesale customer");
s = await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1, pack: "Carton", price: 1 }, { productId: soap._id, qty: 3, price: 1 }], paymentMethod: "cash", customerId: whole._id } });
eq(s.total, 2100 + 270, "carton 2100 + 3 x 90 (cashier price ignored)");
ok(s.items.every((i) => i.wholesale), "lines marked wholesale");
s = await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1, pack: "Dozen" }], paymentMethod: "cash", customerId: whole._id } });
eq(s.total, 12 * 90, "dozen for wholesale = 12 x wholesale unit price");
s = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1, pack: "Carton", price: 2000 }], paymentMethod: "cash" } });
eq(s.total, 2000, "owner can set a carton price at the counter");
eq(r2(s.items[0].price * 24), 2000, "unit price stored");

section("Returns of pack lines");
let r = await owner.call(`/api/sales/${cartonBill._id}/return`, { body: { items: [{ index: 0, qty: 24 }] } });
eq(r.return.total, 2300, "returning 24 pcs = 1 carton value");
r = await owner.call(`/api/sales/${cartonBill._id}/return`, { body: {} });
eq(r.status, "returned", "rest returned");
eq(r.returnedTotal, 4600, "returns add up");

section("Buying in cartons");
const before = (await owner.call(`/api/products/${soap._id}`)).product.stock;
const pur = await owner.call("/api/purchases", { body: { items: [{ productId: soap._id, qty: 5, pack: "Carton", cost: 1900, salePrice: 100 }] } });
eq(pur.total, 9500, "5 cartons at 1900");
eq(pur.items[0].qty, 120, "stock in pcs");
eq(r2(pur.items[0].cost), r2(1900 / 24), "cost per pc");
const after = await owner.call(`/api/products/${soap._id}`);
eq(after.product.stock, before + 120, "stock +120");
eq(after.product.costPrice, r2(1900 / 24), "cost price per pc updated (79.17)");
const pr = await owner.call(`/api/purchases/${pur._id}/return`, { body: { items: [{ index: 0, qty: 24 }] } });
eq(pr.total, 1900, "returning a carton to supplier = 1900");

section("Edit and offline");
const ed = await owner.call(`/api/products/${soap._id}`, { method: "PUT", body: { name: "Lux Soap", unit: "pcs", barcode: "8961000000017", costPrice: 80, salePrice: 100, wholesalePrice: "", lowStockAlert: 5, packs: [{ name: "Carton", size: 24, price: 2300, barcode: "CARTON-LUX" }] } });
ok(ed.wholesalePrice === undefined || ed.wholesalePrice === null, "wholesale price removed");
eq(ed.packs.length, 1, "pack removed");
s = await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 2 }], paymentMethod: "cash", customerId: whole._id } });
eq(s.total, 200, "no wholesale price → normal price");
const cid = "pack-offline-" + Date.now();
s = await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1, pack: "Carton" }], paymentMethod: "cash", clientId: cid, soldAt: new Date(Date.now() - 60000).toISOString() } });
ok(s.offline && s.total === 2300 && s.items[0].qty === 24, "offline carton bill");
eq((await owner.raw(`/receipt/${cartonBill._id}`)).status, 200, "receipt page");

await done();
