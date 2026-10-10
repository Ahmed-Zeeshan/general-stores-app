import { Client, ok, eq, section, r2, done } from "../lib/harness.mjs";

// ---------- Udhaar payments: receipts, full / part / advance, cancel, reports ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Khata Mart", shopType: "karyana", maxUsers: 4, ownerName: "Hamza", username: "hamza", password: "secret1", phone: "0300-1112223" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 2, ownerName: "Zara", username: "zara", password: "secret1" } });
await owner.login("hamza", "secret1");
await other.login("zara", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const bilal = await owner.call("/api/parties", { body: { type: "customer", name: "Bilal", phone: "0300-1234567", openingBalance: 1000 } });
const sup = await owner.call("/api/parties", { body: { type: "supplier", name: "Nestle Distributor", openingBalance: 5000 } });
const pay = (who, party, amount, method = "cash", note, expect = 200) => who.call(`/api/parties/${party._id}/payment`, { body: { type: "payment", amount, method, note }, expect });
const balance = async (p) => (await owner.call(`/api/parties/${p._id}`)).party.balance;

section("Part, full and extra payments get receipts");
const p1 = await pay(owner, bilal, 400, "cash", "First instalment");
eq(p1.refNo, "RCP-000001", "receipt number");
eq(p1.balanceAfter, 600, "part payment leaves 600");
ok(!!p1.branch, "payment tagged with branch");
const r1 = await owner.call(`/api/ledger/${p1._id}`);
eq(r1.balanceBefore, 1000, "receipt shows previous udhaar");
eq(r1.party.name, "Bilal", "receipt shows customer");
eq(r1.userName, "Hamza", "receipt shows who received");
eq(r1.branchName, "Main Branch", "receipt shows branch");
eq(r1.note, "First instalment", "note kept");
const p2 = await pay(cashier, bilal, 600, "jazzcash");
eq(p2.refNo, "RCP-000002", "cashier can receive udhaar");
eq(p2.balanceAfter, 0, "full payment clears khata");
const p3 = await pay(owner, bilal, 150);
eq(p3.balanceAfter, -150, "extra payment kept as advance");
await pay(owner, bilal, 0, "cash", undefined, 400).then(() => ok(true, "zero amount rejected"));
await pay(owner, bilal, -5, "cash", undefined, 400).then(() => ok(true, "negative amount rejected"));
await pay(other, bilal, 100, "cash", undefined, 404).then(() => ok(true, "other shop cannot post to this khata"));
await other.call(`/api/ledger/${p1._id}`, { expect: 404 }).then(() => ok(true, "other shop cannot read the receipt"));
const v1 = await pay(owner, sup, 2000, "bank");
eq(v1.refNo, "PAY-000001", "supplier payment gets a voucher number");
await pay(cashier, sup, 100, "cash", undefined, 403).then(() => ok(true, "cashier cannot pay suppliers"));
const charge = await owner.call(`/api/parties/${bilal._id}/payment`, { body: { type: "charge", amount: 50, note: "Items without bill" } });
eq(charge.kind, "adjustment", "manual udhaar still works");
ok(!charge.refNo, "manual udhaar has no receipt number");
eq(await balance(bilal), -100, "balance after manual udhaar (-100)");

section("Cancelling a mistaken payment");
await cashier.call(`/api/ledger/${p2._id}/reverse`, { body: {}, expect: 403 }).then(() => ok(true, "cashier cannot cancel payments"));
await other.call(`/api/ledger/${p2._id}/reverse`, { body: {}, expect: 404 }).then(() => ok(true, "other shop cannot cancel"));
await owner.call(`/api/ledger/${charge._id}/reverse`, { body: {}, expect: 400 }).then(() => ok(true, "only payments can be cancelled"));
const parallel = await Promise.all([1, 2, 3].map(() => owner.raw(`/api/ledger/${p2._id}/reverse`, { body: { reason: "Entered twice" } }).then((x) => x.status)));
eq(parallel.filter((s) => s === 200).length, 1, `cancelled exactly once (${parallel.join(",")})`);
eq(await balance(bilal), 500, "udhaar back after cancel (500)");
const r2now = await owner.call(`/api/ledger/${p2._id}`);
ok(r2now.reversed === true && r2now.reverseReason === "Entered twice" && r2now.reversedByName === "Hamza", "receipt marked cancelled with reason and who");
const led = (await owner.call(`/api/parties/${bilal._id}`)).ledger;
const rev = led.find((e) => e.kind === "reversal");
ok(rev && rev.amount === 600 && rev.refNo === "RCP-000002", "reversal entry in khata");
await owner.call(`/api/ledger/${p2._id}/reverse`, { body: {}, expect: 400 }).then((e) => ok(/already/.test(e.error), "cannot cancel twice"));

section("Reports, dashboard and udhaar ageing");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const rep = await owner.call(`/api/reports?from=${today}&to=${today}`);
eq(rep.summary.udhaarCollected, 400 + 150, "report: udhaar collected net of cancelled");
eq(rep.collectedByMethod.find((m) => m._id === "cash")?.total, 550, "report: cash collections");
ok(!rep.collectedByMethod.some((m) => m._id === "jazzcash"), "report: cancelled JazzCash payment not counted");
eq(rep.summary.paidToSuppliers, 2000, "report: paid to suppliers");
const dash = await owner.call("/api/dashboard");
eq(dash.today.collected, 550, "dashboard: collected today");
eq(dash.today.collectedCash, 550, "dashboard: cash collected today");
const ur = await owner.call("/api/reminders/report");
const row = ur.rows.find((r) => r.name === "Bilal");
eq(row.balance, 500, "ageing: balance");
eq(r2(row.buckets.d0_30), 500, "ageing: all within 30 days");

section("Pages");
for (const p of [`/receipt/payment/${p1._id}`, `/receipt/payment/${v1._id}`, `/statement/${bilal._id}`, `/customers/${bilal._id}`, "/udhaar", "/pos", "/reports", "/"]) {
  eq((await owner.raw(p)).status, 200, `page ${p}`);
}

section("Receipt numbers continue after restore");
const backup = await owner.call("/api/backup");
await owner.call("/api/restore", { body: { backup, confirm: "Khata Mart" } });
const p4 = await pay(owner, bilal, 100);
eq(p4.refNo, "RCP-000004", "next receipt after restore");
const v2 = await pay(owner, sup, 100);
eq(v2.refNo, "PAY-000002", "next voucher after restore");
eq(await balance(bilal), 400, "khata intact after restore");

await done();
