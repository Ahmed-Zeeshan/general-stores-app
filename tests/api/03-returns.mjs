import { FBR, Client, ok, eq, section, r2, db, oid, restartServer, done } from "../lib/harness.mjs";

const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Returns Mart", shopType: "general", maxUsers: 4, ownerName: "Hamza", username: "hamza", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 2, ownerName: "Zara", username: "zara", password: "secret1" } });
await owner.login("hamza", "secret1");
await other.login("zara", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");

const rice = await owner.call("/api/products", { body: { name: "Basmati Rice", unit: "kg", costPrice: 200, salePrice: 250, lowStockAlert: 1, openingStock: 100 } });
const soap = await owner.call("/api/products", { body: { name: "Lux Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 1, openingStock: 50 } });
const oil = await owner.call("/api/products", { body: { name: "Dalda 1L", unit: "pcs", costPrice: 500, salePrice: 600, lowStockAlert: 1, openingStock: 20 } });
const bilal = await owner.call("/api/parties", { body: { type: "customer", name: "Bilal", phone: "0300-1234567" } });
const stock = async (p) => (await owner.call(`/api/products/${p._id}`)).product.stock;
const balance = async (c) => (await owner.call(`/api/parties/${c._id}`)).party.balance;
const ret = (sale, body = {}, expect = 200, who = owner) => who.call(`/api/sales/${sale._id}/return`, { body, expect });

section("Partial returns on an udhaar bill (udhaar reduced first)");
// 3 kg rice 750 + 4 soap 400 + 1 oil 600 = 1750, discount 50 → 1700; paid 1000 → 700 udhaar
const s1 = await owner.call("/api/sales", { body: { items: [{ productId: rice._id, qty: 3 }, { productId: soap._id, qty: 4 }, { productId: oil._id, qty: 1 }], discount: 50, paymentMethod: "cash", amountPaid: 1000, customerId: bilal._id } });
eq(s1.total, 1700, "bill total");
eq(s1.creditAmount, 700, "udhaar on bill");
eq(await balance(bilal), 700, "khata after bill");

let r = await ret(s1, { items: [{ index: 1, qty: 2 }], reason: "Damaged" });
const rt1 = r.return;
ok(/^RTN-/.test(rt1.returnNo), "return number " + rt1.returnNo);
eq(rt1.total, r2(200 * 1700 / 1750), "2 soaps valued with the bill discount share");
eq(rt1.discount, r2(50 * 200 / 1750), "discount share recorded");
eq(rt1.creditReduced, rt1.total, "whole value taken off udhaar");
eq(rt1.refund, 0, "no cash given back");
eq(rt1.refundMethod, "none", "refund method none");
eq(r.status, "partially_returned", "bill marked part returned");
eq(r.items[1].returnedQty, 2, "returned qty tracked on item");
eq(await stock(soap), 50 - 4 + 2, "soap back in stock");
eq(await balance(bilal), r2(700 - rt1.total), "khata reduced");

await ret(s1, { items: [{ index: 1, qty: 3 }] }, 400).then((e) => ok(/Only 2/.test(e.error), "over-return blocked: " + e.error));
await ret(s1, { items: [{ index: 9, qty: 1 }] }, 400).then((e) => ok(/not found/i.test(e.error), "bad item rejected"));
await ret(s1, { items: [{ index: 0, qty: 0 }] }, 400).then(() => ok(true, "zero qty rejected"));
await ret(s1, { items: [{ index: 0, qty: 1 }, { index: 0, qty: 1 }] }, 400).then((e) => ok(/twice/.test(e.error), "duplicate line rejected"));
await ret(s1, { items: [{ index: 0, qty: 1 }] }, 403, cashier).then(() => ok(true, "cashier cannot take returns"));
await other.call(`/api/sales/${s1._id}/return`, { body: {}, expect: 404 }).then(() => ok(true, "other shop cannot return this bill"));
await owner.call(`/api/sales/not-an-id/return`, { body: {}, expect: 404 }).then(() => ok(true, "invalid bill id → 404")).catch(async () => { await owner.call(`/api/sales/not-an-id/return`, { body: {}, expect: 400 }); ok(true, "invalid bill id → 400"); });

r = await ret(s1, { items: [{ index: 0, qty: 1.5 }] });
const rt2 = r.return;
eq(rt2.total, r2(375 * 1700 / 1750), "1.5 kg rice valued");
eq(rt2.creditReduced, rt2.total, "still all from udhaar");
eq(await stock(rice), 100 - 3 + 1.5, "rice stock (decimal kg)");

r = await ret(s1, {}); // everything that is left
const rt3 = r.return;
eq(r.status, "returned", "bill now fully returned");
eq(r2(rt1.total + rt2.total + rt3.total), 1700, "returns add up exactly to the bill");
eq(r.returnedTotal, 1700, "returnedTotal on bill");
eq(r2(rt1.creditReduced + rt2.creditReduced + rt3.creditReduced), 700, "udhaar reduced in total = udhaar on bill");
eq(rt3.refund, 1000, "cash paid comes back last");
eq(rt3.refundMethod, "cash", "refunded in cash (original method)");
eq(await balance(bilal), 0, "khata back to zero");
eq(await stock(oil), 20, "oil back");
eq(await stock(soap), 50, "soap back");
eq(await stock(rice), 100, "rice back");
await ret(s1, {}, 400).then((e) => ok(/already/.test(e.error), "cannot return a fully returned bill"));
const list1 = await owner.call(`/api/sales/${s1._id}/return`);
eq(list1.length, 3, "bill lists its 3 returns");
const one = await owner.call(`/api/returns/${rt1._id}`);
eq(one.returnNo, rt1.returnNo, "single return fetched");
eq(one.reason, "Damaged", "reason saved");
await other.call(`/api/returns/${rt1._id}`, { expect: 404 }).then(() => ok(true, "other shop cannot read the return"));
const led = (await owner.call(`/api/parties/${bilal._id}`)).ledger;
eq(led.filter((l) => l.kind === "return").length, 3, "3 return entries in khata");

section("Refund to khata and refund methods");
const s2 = await owner.call("/api/sales", { body: { items: [{ productId: oil._id, qty: 2 }], paymentMethod: "cash", amountPaid: 1200, customerId: bilal._id } });
r = await ret(s2, { items: [{ index: 0, qty: 1 }], refundMethod: "khata" });
eq(r.return.refund, 600, "refund value");
eq(r.return.refundMethod, "khata", "kept in khata");
eq(await balance(bilal), -600, "customer now has advance of 600");
const walkin = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 2 }], paymentMethod: "cash", amountPaid: 200 } });
await ret(walkin, { refundMethod: "khata" }, 400).then((e) => ok(/customer/.test(e.error), "walk-in cannot be refunded to khata"));
const card = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 3 }], paymentMethod: "card", amountPaid: 300 } });
r = await ret(card, { items: [{ index: 0, qty: 1 }] });
eq(r.return.refundMethod, "card", "card bill refunded to card by default");
r = await ret(card, { items: [{ index: 0, qty: 1 }], refundMethod: "cash" });
eq(r.return.refundMethod, "cash", "can choose cash instead");

section("Exclusive tax");
const settings = await owner.call("/api/settings");
await owner.call("/api/settings", { method: "PUT", body: { shopName: settings.shopName, shopType: settings.shopType, taxEnabled: true, taxRate: 10, pricesIncludeTax: false } });
const tx = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 3 }], paymentMethod: "cash", amountPaid: 330 } });
eq(tx.total, 330, "bill with 10% tax on top");
r = await ret(tx, { items: [{ index: 0, qty: 1 }] });
eq(r.return.total, 110, "return includes tax");
eq(r.return.tax, 10, "tax share");
r = await ret(tx, {});
eq(r.return.total, 220, "rest of the bill");
await owner.call("/api/settings", { method: "PUT", body: { shopName: settings.shopName, shopType: settings.shopType, taxEnabled: false, taxRate: 0, pricesIncludeTax: true } });

section("Many returns at the same moment");
const cc = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 3 }], paymentMethod: "cash", amountPaid: 300 } });
const before = await stock(soap);
const results = await Promise.all(Array.from({ length: 6 }, () => owner.raw(`/api/sales/${cc._id}/return`, { body: { items: [{ index: 0, qty: 1 }] } }).then((x) => x.status)));
eq(results.filter((s) => s === 200).length, 3, `exactly 3 of 6 parallel returns accepted (${results.join(",")})`);
ok(results.every((s) => s === 200 || s === 400 || s === 409), "others refused cleanly");
eq(await stock(soap), before + 3, "stock moved back only 3 times");
const ccNow = await owner.call(`/api/sales/${cc._id}`);
eq(ccNow.returnedTotal, 300, "bill returned total is 300");
eq(ccNow.status, "returned", "bill fully returned");

section("Reports and dashboard are net of returns");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const sales = await owner.call(`/api/sales?from=${today}&to=${today}`);
const returns = await owner.call(`/api/returns?from=${today}&to=${today}`);
const billed = r2(sales.reduce((a, s) => a + s.total, 0));
const returned = r2(returns.reduce((a, x) => a + x.total, 0));
const rep = await owner.call(`/api/reports?from=${today}&to=${today}`);
eq(rep.summary.salesBeforeReturns, billed, "report: sales as billed");
eq(rep.summary.returns, returned, "report: returns");
eq(rep.summary.returnCount, returns.length, "report: return count");
eq(rep.summary.netSales, r2(billed - returned), "report: net sales");
const keptCost = r2(sales.reduce((a, s) => a + s.costTotal, 0) - returns.reduce((a, x) => a + x.costTotal, 0));
eq(rep.summary.grossProfit, r2(billed - returned - rep.summary.tax - keptCost), "report: gross profit uses kept cost");
eq(rep.summary.credit, r2(sales.reduce((a, s) => a + s.creditAmount, 0) - returns.reduce((a, x) => a + x.creditReduced, 0)), "report: udhaar net of returns");
const refundCash = r2(returns.filter((x) => x.refundMethod === "cash").reduce((a, x) => a + x.refund, 0));
eq(rep.refundsByMethod.find((m) => m._id === "cash")?.total ?? 0, refundCash, "report: cash refunds");
const soapTop = rep.topItems.find((t) => t._id === "Lux Soap");
const soapKept = sales.reduce((a, s) => a + s.items.filter((i) => i.name === "Lux Soap").reduce((b, i) => b + i.qty - (i.returnedQty ?? 0), 0), 0);
eq(soapTop?.qty ?? 0, soapKept, "report: top items net of returned qty");
const dash = await owner.call("/api/dashboard");
eq(dash.today.sales, r2(billed - returned), "dashboard: today net sales");
eq(dash.today.returns, returned, "dashboard: today returns");
const cashIn = sales.reduce((a, s) => a + (s.paymentMethod === "cash" ? Math.min(s.amountPaid, s.total - s.creditAmount) : 0), 0);
eq(dash.today.cash, r2(cashIn - refundCash), "dashboard: cash in drawer after refunds");
const search = await owner.call(`/api/returns?from=${today}&to=${today}&q=${encodeURIComponent(rt1.returnNo)}`);
eq(search.length, 1, "search returns by return number");
const csv = await (await owner.raw(`/api/export/sales?from=${today}&to=${today}`)).text();
ok(csv.split("\n")[0].includes("returned"), "sales CSV has a returned column");

section("FBR credit note for a partial return");
await owner.call("/api/settings", { method: "PUT", body: { shopName: settings.shopName, shopType: settings.shopType, taxEnabled: true, taxRate: 18, pricesIncludeTax: true, fbrEnabled: true, fbrMode: "sandbox", fbrPosId: "777", fbrToken: "test-token", fbrDefaultPct: "19059000" } });
await fetch(FBR + "/control/ok");
const fs1 = await owner.call("/api/sales", { body: { items: [{ productId: rice._id, qty: 2 }, { productId: soap._id, qty: 2 }], paymentMethod: "cash", amountPaid: 700 } });
eq(fs1.fbrStatus, "synced", "bill reported to FBR");
r = await ret(fs1, { items: [{ index: 1, qty: 1 }] });
eq(r.return.fbrStatus, "synced", "partial return reported at once");
ok(/^FBR777-/.test(r.return.fbrInvoiceNumber), "credit note number " + r.return.fbrInvoiceNumber);
let rec = await (await fetch(FBR + "/control/received")).json();
let cn = rec.at(-1);
eq(cn.InvoiceType, 3, "sent as credit note");
eq(cn.USIN, r.return.returnNo, "USIN is the return number");
eq(cn.RefUSIN, fs1.fbrInvoiceNumber, "refers to the bill's FBR number");
eq(cn.Items.length, 1, "only the returned item sent");
eq(cn.Items[0].Quantity, 1, "returned quantity");
eq(cn.TotalBillAmount, r.return.total, "credit note amount = return value");
await fetch(FBR + "/control/fail");
const fs2 = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 2 }], paymentMethod: "cash", amountPaid: 200 } });
eq(fs2.fbrStatus, "pending", "bill pending while FBR is down");
r = await ret(fs2, { items: [{ index: 0, qty: 1 }] });
eq(r.return.fbrStatus, "pending", "its return waits");
eq((await owner.call("/api/settings")).fbrPending, 2, "pending count includes the return");
await fetch(FBR + "/control/ok");
const sync = await owner.call("/api/fbr/sync", { method: "POST" });
eq(sync.remaining, 0, "bill and return sent once FBR is back");
const fr = await owner.call(`/api/returns/${r.return._id}`);
eq(fr.fbrStatus, "synced", "return synced after bill");
rec = await (await fetch(FBR + "/control/received")).json();
cn = rec.at(-1);
const fs2now = await owner.call(`/api/sales/${fs2._id}`);
ok(cn.InvoiceType === 3 && cn.RefUSIN === fs2now.fbrInvoiceNumber, "late credit note refers to the late bill's FBR number");
await owner.call("/api/settings", { method: "PUT", body: { shopName: settings.shopName, shopType: settings.shopType, taxEnabled: false, taxRate: 0, pricesIncludeTax: true, fbrEnabled: false } });

section("Pages");
for (const p of [`/receipt/return/${rt1._id}`, `/receipt/${s1._id}`, "/sales", "/reports", "/"]) {
  const res = await owner.raw(p);
  eq(res.status, 200, `page ${p}`);
}

section("Bill saved before returns were tracked can be partly returned");
const legacy = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 4 }], paymentMethod: "cash" } });
await (await db()).collection("sales").updateOne({ _id: oid(legacy._id) }, { $unset: { returnSeq: 1, returnedTotal: 1, creditReturned: 1, "items.0.returnedQty": 1 } });
r = await ret(legacy, { items: [{ index: 0, qty: 1 }] });
eq(r.status, "partially_returned", "old bill part returned");
eq(r.items[0].returnedQty, 1, "returned qty on old bill");
r = await ret(legacy, {});
eq(r.status, "returned", "rest of old bill returned");

section("Bills returned before item-level returns (migration)");
// Make an old-style fully returned bill: returned status, no return record, no returned totals.
const old = await owner.call("/api/sales", { body: { items: [{ productId: oil._id, qty: 1 }], paymentMethod: "cash", amountPaid: 600 } });
await (await db()).collection("sales").updateOne({ _id: oid(old._id) }, { $set: { status: "returned", returnedAt: new Date() }, $unset: { returnedTotal: 1, creditReturned: 1 } });
await restartServer();
await owner.login("hamza", "secret1");
const migrated = await owner.call(`/api/sales/${old._id}/return`);
eq(migrated.length, 1, "old return got a return record");
eq(migrated[0].total, 600, "with the full bill value");
eq((await owner.call(`/api/sales/${old._id}`)).returnedTotal, 600, "bill returnedTotal filled in");
await owner.call(`/api/sales/${old._id}/return`, { body: {}, expect: 400 });
await restartServer();
await owner.login("hamza", "secret1");
eq((await owner.call(`/api/sales/${old._id}/return`)).length, 1, "migration does not run twice");

await done();
