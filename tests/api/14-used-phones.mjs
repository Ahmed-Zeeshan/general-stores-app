import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Buying used phones from customers ----------
const imei = (n) => {
  const body = String(35_300_000_000_000 + n).padStart(14, "0");
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + ((10 - (sum % 10)) % 10);
};
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1" } });
await owner.login("ali", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const I = Array.from({ length: 6 }, (_, i) => imei(i * 13 + 5));
const model = await owner.call("/api/products", { body: { name: "Samsung Galaxy S21 128GB", unit: "pcs", costPrice: 60000, salePrice: 75000, lowStockAlert: 0, trackSerial: true, warrantyMonths: 0 } });
const seller = { name: "Imran Khan", cnic: "3520212345671", phone: "0300-1112223", address: "Model Town, Lahore" };
const base = { seller, productId: model._id, imei: I[0], color: "Phantom Grey", storage: "8/128GB", pta: "approved", checks: { screen: true, body: false }, batteryHealth: 86, accessories: ["Box", "Cable"], price: 52000, askingPrice: 61000, method: "cash", declaration: true };

section("Rules");
await cashier.call("/api/used-phones", { body: base, expect: 403 }).then(() => ok(true, "cashier cannot buy used phones"));
await owner.call("/api/used-phones", { body: { ...base, seller: { ...seller, cnic: "35202-123" } }, expect: 400 }).then((e) => ok(/13 digits/.test(e.error), "CNIC must have 13 digits"));
await owner.call("/api/used-phones", { body: { ...base, declaration: false }, expect: 400 }).then((e) => ok(/declaration/.test(e.error), "seller's declaration required"));
await owner.call("/api/used-phones", { body: { ...base, seller: { ...seller, name: "Al" } }, expect: 400 }).then(() => ok(true, "full name required"));
await owner.call("/api/used-phones", { body: { ...base, photos: ["data:image/jpeg;base64," + "A".repeat(500_000)] }, expect: 400 }).then((e) => ok(/too large/.test(e.error), "oversized photo refused"));
await owner.call("/api/used-phones", { body: { ...base, method: "khata" }, expect: 400 }).then((e) => ok(/Choose the customer/.test(e.error), "khata payment needs a customer"));

section("Buying a used phone");
const shift = await owner.call("/api/shifts", { body: { openingCash: 100000 } });
const buy = await owner.call("/api/used-phones", { body: { ...base, photos: ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD"] } });
ok(buy.buyNo === "BUY-000001" && buy.seller.cnic === "35202-1234567-1", "saved as BUY-000001; CNIC formatted 35202-1234567-1");
ok(buy.earlier.length === 0, "IMEI was never in the shop before");
let dev = (await owner.call(`/api/devices?q=${I[0]}`))[0];
ok(dev.status === "in_stock" && dev.condition === "used" && dev.cost === 52000 && dev.price === 61000, "phone in stock: used, cost Rs 52,000, sells at Rs 61,000");
ok(dev.source.type === "used_buy" && dev.source.name === "Imran Khan" && dev.source.refNo === "BUY-000001", "phone knows it was bought used from Imran Khan");
eq((await owner.call(`/api/products/${model._id}`)).product.stock, 1, "model stock 1");
await owner.call("/api/used-phones", { body: base, expect: 409 }).then((e) => ok(/already in stock/.test(e.error), "same IMEI cannot be bought while in stock"));
const full = await owner.call(`/api/used-phones/${buy._id}`);
ok(full.photos.length === 1 && full.deviceStatus === "in_stock" && full.checks.body === false && full.batteryHealth === 86, "record keeps photo, checks and battery health");
let z = await owner.call("/api/shifts/current");
const line = z.summary.cashFlow.find((x) => x.label === "Used phones bought (cash)");
ok(line?.amount === -52000 && z.summary.expectedCash === 48000, "drawer: Rs 52,000 out for the used phone (expected 48,000)");

section("New model on the spot, search");
const buy2 = await owner.call("/api/used-phones", { body: { ...base, productId: undefined, newModel: { name: "iPhone 11 64GB", salePrice: 85000 }, imei: I[1], price: 70000, askingPrice: 0, method: "jazzcash", paymentRef: "JC778899" } });
const newModel = (await owner.call("/api/products?limit=100")).find((p) => p.name === "iPhone 11 64GB");
ok(newModel?.trackSerial && newModel.category?.name === "Used Phones", "new model created, tracked by IMEI, in Used Phones");
eq((await owner.call(`/api/devices?q=${I[1]}`))[0].price ?? null, null, "no asking price → sells at the model's price");
z = await owner.call("/api/shifts/current");
ok(z.summary.expectedCash === 48000 && z.summary.usedPhonesByMethod.find((m) => m.method === "jazzcash")?.total === 70000, "JazzCash payment does not touch the drawer");
eq((await owner.call("/api/used-phones?q=1234567")).length, 2, "search by part of the CNIC");
eq((await owner.call(`/api/used-phones?q=${I[1]}`))[0].buyNo, buy2.buyNo, "search by IMEI");

section("Resale, buying it back, trade-in");
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Hassan", phone: "03211234567" } });
const sale = await cashier.call("/api/sales", { body: { items: [{ productId: model._id, qty: 1, serials: [dev._id] }], paymentMethod: "cash", customerId: cust._id } });
ok(sale.items[0].price === 61000 && sale.items[0].cost === 52000, "sold at Rs 61,000 (profit Rs 9,000 on cost 52,000)");
// Months later Hassan trades it in: the money goes to his khata.
const back = await owner.call("/api/used-phones", { body: { ...base, seller: { name: "Hassan Ali", cnic: "35202-7654321-9", phone: "03211234567", partyId: cust._id }, price: 45000, askingPrice: 55000, method: "khata" } });
ok(back.earlier.length === 1 && back.earlier[0].sale.invoiceNo === sale.invoiceNo, "buying it back shows we sold this phone before (bill " + sale.invoiceNo + ")");
eq((await owner.call(`/api/parties/${cust._id}`)).party.balance, -45000, "trade-in: Rs 45,000 in Hassan's khata as advance");
const look = await owner.call(`/api/devices/lookup?imei=${I[0]}`);
ok(look.records.length === 2 && look.records[0].status === "in_stock" && look.records[1].status === "sold", "IMEI history: bought used, sold, bought back");

section("Cancelling");
await owner.call(`/api/used-phones/${buy._id}/cancel`, { body: { reason: "Wrong entry" }, expect: 400 }).then((e) => ok(/not in stock/.test(e.error), "cannot cancel after the phone was sold"));
await owner.call(`/api/used-phones/${back._id}/cancel`, { body: { reason: "x" }, expect: 400 }).then(() => ok(true, "cancel needs a reason"));
const c = await owner.call(`/api/used-phones/${back._id}/cancel`, { body: { reason: "Customer took it back" } });
ok(c.status === "cancelled", "trade-in cancelled");
eq((await owner.call(`/api/parties/${cust._id}`)).party.balance, 0, "khata back to 0");
ok((await owner.call(`/api/devices?q=${I[0]}&status=all`)).some((d) => d.status === "removed"), "phone taken out of stock");
eq((await owner.call(`/api/products/${model._id}`)).product.stock, 0, "model stock back to 0");

section("Backup and activity");
const backup = await owner.call("/api/backup");
ok(backup.data.usedPurchases.length === 3 && backup.data.usedPurchases[0].photos?.length === 1, "backup keeps the 3 used purchases with photos");
const acts = (await owner.call("/api/activity")).rows;
ok(acts.filter((a) => a.action === "used.buy").length === 3 && acts.some((a) => a.action === "used.cancel"), "activity log: 3 bought, 1 cancelled");
await done();
