import { Client, ok, eq, section, done, day } from "../lib/harness.mjs";

// ---------- Records linked across the app: stock history, khata, activity, purchases, search, reports ----------
const admin = new Client("admin"), owner = new Client("owner");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Linked Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Asad", username: "asad", password: "secret1" } });
await owner.login("asad", "secret1");
const imei = (n) => {
  const body = String(35_000_000_000_000 + n).padStart(14, "0");
  let sum = 0;
  for (let i = 0; i < 14; i++) { let d = Number(body[i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return body + ((10 - (sum % 10)) % 10);
};
const wide = "from=2000-01-01&to=2100-01-01";
await owner.call("/api/shifts", { body: { openingCash: 10000 } });
const cover = await owner.call("/api/products", { body: { name: "Back Cover", unit: "pcs", costPrice: 100, salePrice: 300, lowStockAlert: 0 } });
const phone = await owner.call("/api/products", { body: { name: "Vivo Y28", unit: "pcs", costPrice: 38000, salePrice: 45000, lowStockAlert: 0, trackSerial: true } });
const sup = await owner.call("/api/parties", { body: { type: "supplier", name: "Hall Road Traders" } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Hassan Ali", phone: "03211234567" } });

section("Stock history: every change opens its record");
const pur = await owner.call("/api/purchases", { body: { supplierId: sup._id, items: [{ productId: cover._id, qty: 20, cost: 100 }], amountPaid: 500 } });
const sale = await owner.call("/api/sales", { body: { items: [{ productId: cover._id, qty: 3 }], paymentMethod: "credit", customerId: cust._id } });
const ret = await owner.call(`/api/sales/${sale._id}/return`, { body: { items: [{ index: 0, qty: 1 }] } });
await owner.call(`/api/products/${cover._id}/stock`, { body: { mode: "wastage", qty: 2, note: "Cracked" } });
const mv = (await owner.call(`/api/products/${cover._id}`)).movements;
const find = (type) => mv.find((m) => m.type === type);
ok(find("purchase")?.refType === "purchase" && find("purchase").refId === pur._id, "purchase row → its purchase");
ok(find("sale")?.refType === "sale" && find("sale").refId === sale._id, "sale row → its bill");
ok(find("return")?.refType === "return" && find("return").refId === ret.return._id, "return row → its return slip");
ok(find("wastage") && !find("wastage").refId && find("wastage").userName === "Asad", "wastage row shows who did it (no record to open)");

section("Purchases: by supplier, by id, and paid at purchase vs. khata");
const bySup = await owner.call(`/api/purchases?${wide}&supplier=${sup._id}&branch=all`);
ok(bySup.length === 1 && bySup[0]._id === pur._id, "supplier page lists the supplier's purchases");
const pret = await owner.call(`/api/purchases/${pur._id}/return`, { body: { items: [{ index: 0, qty: 2 }], settlement: "khata" } });
const one = await owner.call(`/api/purchase-returns?id=${pret._id}`);
ok(one.length === 1 && one[0].purchase === pur._id, "a return to the supplier opens its purchase");
const khataS = (await owner.call(`/api/parties/${sup._id}`)).ledger;
ok(khataS.some((e) => e.refType === "purchase" && e.refId === pur._id) && khataS.some((e) => e.refType === "purchase_return" && e.refId === pret._id), "supplier khata rows carry their purchase / return");

section("Customer khata rows carry their records and branch");
const khataC = (await owner.call(`/api/parties/${cust._id}`)).ledger;
const saleRow = khataC.find((e) => e.refType === "sale");
ok(saleRow?.refId === sale._id && saleRow.branch, "bill row → bill, with the branch");
ok(khataC.some((e) => e.refType === "return" && e.refId === ret.return._id && e.branch), "return row → return slip, with the branch");
const pay = await owner.call(`/api/parties/${cust._id}/payment`, { body: { type: "payment", amount: 200, method: "cash" } });

section("Activity log rows point at their records");
const act = (await owner.call("/api/activity")).rows;
ok(act.some((r) => r.action === "payment.receive" && r.refType === "ledger" && r.refId === pay._id), "payment received → its receipt");
ok(act.some((r) => r.refType === "purchase" && r.refId === pur._id), "purchase → the purchase");

section("Search finds purchases, receipts and drawer sessions by number");
const s1 = await owner.call(`/api/search?q=${pur.purchaseNo}`);
ok(s1.some((g) => g.type === "purchase" && g.hits[0].href === `/purchases?id=${pur._id}`), "purchase number → the purchase");
const s2 = await owner.call(`/api/search?q=${pay.refNo}`);
ok(s2.some((g) => g.type === "receipt" && g.hits[0].href === `/receipt/payment/${pay._id}`), "receipt number → the receipt");
const cur = await owner.call("/api/shifts/current");
const s3 = await owner.call(`/api/search?q=${cur.shift.shiftNo}`);
ok(s3.some((g) => g.type === "shift"), "drawer number → its X / Z report");

section("Cancelling a trade-in on khata is not a cash payment");
const devs = await owner.call("/api/devices", { body: { productId: phone._id, cost: 38000, units: [{ imei: imei(7) }] } });
const before = (await owner.call("/api/shifts/current")).summary;
const used = await owner.call("/api/used-phones", {
  body: { seller: { name: "Hassan Ali", cnic: "35202-7654321-9", phone: "03211234567", partyId: cust._id }, productId: phone._id, imei: imei(21), color: "Grey", storage: "8/128GB", pta: "approved", checks: { screen: true }, batteryHealth: 90, accessories: [], price: 30000, askingPrice: 36000, method: "khata", declaration: true },
});
await owner.call(`/api/used-phones/${used._id}/cancel`, { body: { reason: "Entered by mistake" } });
const after = (await owner.call("/api/shifts/current")).summary;
eq(after.expectedCash, before.expectedCash, "drawer's expected cash unchanged (no money moved)");
eq(JSON.stringify(after.udhaarCollectedByMethod), JSON.stringify(before.udhaarCollectedByMethod), "udhaar collected unchanged");
eq((await owner.call(`/api/parties/${cust._id}`)).party.balance, 900 - 300 - 200, "Hassan's khata back where it was");
ok(devs.length === 1, "phone in stock");

section("Profit report: wastage and installments");
const rep = await owner.call(`/api/reports?from=${day(-1)}&to=${day(1)}`);
eq(rep.summary.wastage, 200, "2 cracked covers written off at cost (2 × 100)");
ok(rep.summary.netProfit === Math.round((rep.summary.grossProfit + rep.summary.repairProfit + rep.summary.walletProfit + rep.summary.installmentProfit - rep.summary.wastage - rep.summary.expenses) * 100) / 100, "net profit includes installments and wastage");

await done();
