import { FBR, Client, ok, eq, section, r2, done } from "../lib/harness.mjs";

// ---------- Split payments ----------
const admin = new Client("admin"), owner = new Client("owner");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Split Mart", shopType: "general", maxUsers: 3, ownerName: "Hamza", username: "hamza", password: "secret1" } });
await owner.login("hamza", "secret1");
const item = await owner.call("/api/products", { body: { name: "Ghee 1kg", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 1, openingStock: 500 } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Bilal", phone: "0300-1234567" } });
const sale = (qty, extra, expect = 200) => owner.call("/api/sales", { body: { items: [{ productId: item._id, qty }], ...extra }, expect });
const bal = async () => (await owner.call(`/api/parties/${cust._id}`)).party.balance;

section("Split between methods");
let s = await sale(8, { payments: [{ method: "cash", amount: 500 }, { method: "jazzcash", amount: 300, ref: "TID123" }] });
eq(s.payments.length, 2, "two payments stored");
eq(s.paymentMethod, "cash", "main method = largest (cash)");
eq(s.amountPaid, 800, "paid 800");
eq(s.change, 0, "no change");
eq(s.creditAmount, 0, "no udhaar");
eq(s.payments.find((p) => p.method === "jazzcash").ref, "TID123", "JazzCash transaction ID kept");
const splitId = s._id;

s = await sale(8, { payments: [{ method: "jazzcash", amount: 300 }, { method: "cash", amount: 1000 }] });
eq(s.payments.find((p) => p.method === "cash").amount, 500, "cash applied = what was left (500)");
eq(s.change, 500, "change 500 from cash");
eq(s.amountPaid, 800, "amount paid = bill");

await sale(8, { payments: [{ method: "jazzcash", amount: 900 }] }, 400).then((e) => ok(/more than the bill/.test(e.error), "JazzCash more than bill rejected"));
await sale(8, { payments: [{ method: "card", amount: 500 }, { method: "bank", amount: 400 }] }, 400).then(() => ok(true, "card + bank more than bill rejected"));
await sale(8, { payments: [{ method: "credit", amount: 100 }] }, 400).then(() => ok(true, "udhaar is not a payment method in a split"));

s = await sale(8, { payments: [{ method: "cash", amount: 100 }, { method: "cash", amount: 200 }, { method: "easypaisa", amount: 0 }, { method: "card", amount: 500 }] });
eq(s.payments.length, 2, "same method merged, zero ignored");
eq(s.payments.find((p) => p.method === "cash").amount, 300, "cash 100 + 200 = 300");
eq(s.paymentMethod, "card", "main method card");

section("Split with udhaar");
await sale(8, { payments: [{ method: "jazzcash", amount: 300 }, { method: "cash", amount: 200 }] }, 400).then((e) => ok(/Select a customer/.test(e.error), "udhaar part needs a customer"));
s = await sale(8, { payments: [{ method: "jazzcash", amount: 300 }, { method: "cash", amount: 200 }], customerId: cust._id });
eq(s.creditAmount, 300, "rest 300 goes to udhaar");
eq(await bal(), 300, "khata +300");
const udhaarSplit = s;

section("Single method (unchanged behaviour)");
s = await sale(3, { paymentMethod: "cash", amountPaid: 500 });
eq(s.change, 200, "cash change");
ok(s.payments.length === 1 && s.payments[0].method === "cash" && s.payments[0].amount === 300, "payments list filled for single cash");
s = await sale(3, { paymentMethod: "easypaisa", paymentRef: "EP-9988" });
ok(s.payments[0].method === "easypaisa" && s.payments[0].amount === 300 && s.payments[0].ref === "EP-9988", "Easypaisa with transaction ID");
s = await sale(3, { paymentMethod: "credit", amountPaid: 100, customerId: cust._id });
eq(s.paymentMethod, "credit", "udhaar bill keeps method udhaar");
ok(s.payments.length === 1 && s.payments[0].method === "cash" && s.payments[0].amount === 100, "money paid now on udhaar bill counted as cash");
eq(s.creditAmount, 200, "udhaar 200");
s = await sale(3, { paymentMethod: "credit", customerId: cust._id });
eq(s.payments.length, 0, "full udhaar: no payments");
await sale(3, {}, 400).then((e) => ok(/how the customer/.test(e.error), "no method at all rejected"));

section("Reports, filters, returns");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const all = await owner.call(`/api/sales?from=${today}&to=${today}`);
const sum = (m) => r2(all.reduce((a, x) => a + (x.payments ?? []).filter((p) => p.method === m).reduce((b, p) => b + p.amount, 0), 0));
const rep = await owner.call(`/api/reports?from=${today}&to=${today}`);
for (const m of ["cash", "jazzcash", "card", "easypaisa"]) eq(rep.byMethod.find((x) => x._id === m)?.total ?? 0, sum(m), `report ${m} = sum of payments`);
eq(rep.byMethod.find((x) => x._id === "credit")?.total ?? 0, r2(all.reduce((a, x) => a + x.creditAmount, 0)), "report udhaar");
const dash = await owner.call("/api/dashboard");
eq(dash.today.cash, sum("cash"), "dashboard cash = cash payments");
const jz = await owner.call(`/api/sales?from=${today}&to=${today}&method=jazzcash`);
ok(jz.some((x) => x._id === splitId), "JazzCash filter finds split bills");
const cr = await owner.call(`/api/sales?from=${today}&to=${today}&method=credit`);
ok(cr.every((x) => x.creditAmount > 0) && cr.some((x) => x._id === udhaarSplit._id), "udhaar filter finds bills with udhaar");
let r = await owner.call(`/api/sales/${splitId}/return`, { body: { items: [{ index: 0, qty: 1 }] } });
eq(r.return.refundMethod, "cash", "split bill refunds in cash by default");
const csv = await (await owner.raw(`/api/export/sales?from=${today}&to=${today}`)).text();
ok(csv.includes("cash:500 + jazzcash:300") || csv.includes("jazzcash:300 + cash:500"), "CSV shows split");
eq((await owner.raw(`/receipt/${splitId}`)).status, 200, "receipt page");

section("Offline split bill");
const cid = "offline-split-" + Date.now();
const off = await sale(2, { payments: [{ method: "cash", amount: 150 }, { method: "jazzcash", amount: 50 }], clientId: cid, soldAt: new Date(Date.now() - 60000).toISOString() });
ok(off.offline && off.payments.length === 2, "offline split bill saved");
const again = await sale(2, { payments: [{ method: "cash", amount: 150 }, { method: "jazzcash", amount: 50 }], clientId: cid, soldAt: new Date().toISOString() });
eq(again._id, off._id, "re-sent offline bill not duplicated");

section("FBR payment mode");
await owner.call("/api/settings", { method: "PUT", body: { shopName: "Split Mart", shopType: "general", taxEnabled: false, taxRate: 0, pricesIncludeTax: true, fbrEnabled: true, fbrMode: "sandbox", fbrPosId: "555", fbrToken: "test-token" } });
await fetch(FBR + "/control/ok");
await sale(2, { payments: [{ method: "cash", amount: 100 }, { method: "card", amount: 100 }] });
let rec = await (await fetch(FBR + "/control/received")).json();
eq(rec.at(-1).PaymentMode, 5, "split bill sent as mixed (5)");
await sale(2, { paymentMethod: "card" });
rec = await (await fetch(FBR + "/control/received")).json();
eq(rec.at(-1).PaymentMode, 2, "card bill sent as card (2)");
await sale(2, { paymentMethod: "cash" });
rec = await (await fetch(FBR + "/control/received")).json();
eq(rec.at(-1).PaymentMode, 1, "cash bill sent as cash (1)");

await done();
