import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Easyload, internet / call packages, JazzCash / Easypaisa / bank accounts ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, maxBranches: 2, ownerName: "Ali", username: "ali", password: "secret1" } });
await owner.login("ali", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const bal = async (w) => (await owner.call("/api/wallets")).find((x) => x._id === w._id).balance;
const txn = (who, body, expect) => who.call("/api/wallet-txns", { body, ...(expect ? { expect } : {}) });

section("Accounts");
await cashier.call("/api/wallets", { body: { name: "Jazz SIM", kind: "load", provider: "jazz" }, expect: 403 }).then(() => ok(true, "cashier cannot add accounts"));
const jazz = await owner.call("/api/wallets", { body: { name: "Jazz Easyload SIM", kind: "load", provider: "jazz", number: "0300-1112223", lowAlert: 2000, commissionPct: 2.8, openingBalance: 10000 } });
const jc = await owner.call("/api/wallets", { body: { name: "JazzCash Retailer", kind: "wallet", provider: "jazzcash", number: "0300-1112223", feePct: 1, openingBalance: 50000 } });
const bank = await owner.call("/api/wallets", { body: { name: "Meezan Bank", kind: "bank", provider: "bank", openingBalance: 20000 } });
ok(jazz.balance === 10000 && jc.balance === 50000 && bank.balance === 20000, "3 accounts with opening balances (10,000 / 50,000 / 20,000)");
let day = await owner.call("/api/wallet-txns");
ok(day.rows.filter((r) => r.type === "adjust" && r.note === "Opening balance").length === 3 && day.rows.every((r) => r.cashEffect === 0), "opening balances recorded without touching the drawer");
await owner.call("/api/shifts", { body: { openingCash: 20000 } });

section("Easyload");
await txn(cashier, { walletId: jazz._id, type: "load", amount: 500, customerNumber: "12345" }, 400).then((e) => ok(/mobile number/.test(e.error), "customer number must be a mobile number"));
let t = await txn(cashier, { walletId: jazz._id, type: "load", amount: 500, customerNumber: "0301-2345678" });
ok(t.txnNo === "WTX-000004" && t.walletEffect === -500 && t.cashEffect === 500 && t.commission === 14 && t.balanceAfter === 9500, "Rs 500 load: SIM 10,000 → 9,500, drawer +500, commission Rs 14 (2.8%)");
await txn(cashier, { walletId: jazz._id, type: "load", amount: 100, customerNumber: "03012345678", commission: 50 }, 403).then(() => ok(true, "cashier cannot change the commission"));
await txn(cashier, { walletId: jazz._id, type: "load", amount: 20000, customerNumber: "03012345678" }, 400).then((e) => ok(/Not enough balance in Jazz Easyload SIM: it has Rs 9500/.test(e.error), "cannot load more than the SIM has"));
const race = await Promise.all([1, 2].map(() => cashier.raw("/api/wallet-txns", { body: { walletId: jazz._id, type: "load", amount: 6000, customerNumber: "03012345678" } })));
ok(race.map((r) => r.status).sort().join(",") === "200,400", "two counters cannot overspend the same SIM at once");
eq(await bal(jazz), 3500, "SIM balance 3,500");

section("Internet / call packages");
await cashier.call("/api/packages", { body: { operator: "jazz", name: "Weekly Super", price: 300 }, expect: 403 }).then(() => ok(true, "cashier cannot change the package list"));
const weekly = await owner.call("/api/packages", { body: { operator: "jazz", name: "Weekly Super Plus", kind: "hybrid", data: "30 GB", minutes: "1500 Jazz mins", validityDays: 7, price: 300, code: "*453#" } });
const monthly = await owner.call("/api/packages", { body: { operator: "jazz", name: "Monthly Mega", kind: "internet", data: "60 GB", validityDays: 30, price: 1200, commission: 40 } });
await owner.call("/api/packages", { body: { operator: "zong", name: "Zong Weekly", price: 260 } });
eq((await cashier.call("/api/packages?operator=jazz")).length, 2, "package list by network");
t = await txn(cashier, { walletId: jazz._id, type: "package", packageId: weekly._id, customerNumber: "03012345678" });
ok(t.amount === 300 && t.packageName === "Weekly Super Plus" && t.operator === "jazz" && t.commission === 8.4, "package sold at Rs 300, commission 2.8% = Rs 8.40");
t = await txn(cashier, { walletId: jazz._id, type: "package", packageId: monthly._id, customerNumber: "03012345678" });
ok(t.commission === 40, "package with its own commission (Rs 40)");
await owner.call(`/api/packages/${weekly._id}`, { method: "PATCH", body: { active: false } });
await txn(cashier, { walletId: jazz._id, type: "package", packageId: weekly._id, customerNumber: "03012345678" }, 404).then(() => ok(true, "switched-off package cannot be sold"));
eq(await bal(jazz), 2000, "SIM 3,500 − 300 − 1,200 = 2,000");

section("JazzCash: cash in, cash out, bills");
t = await txn(cashier, { walletId: jc._id, type: "cash_in", amount: 5000, fee: 50, customerNumber: "03451234567", customerName: "Rashid", ref: "TID778" });
ok(t.walletEffect === -5000 && t.cashEffect === 5050 && t.fee === 50, "cash in Rs 5,000 + Rs 50 fee: account −5,000, drawer +5,050");
t = await txn(cashier, { walletId: jc._id, type: "cash_out", amount: 3000, fee: 30 });
ok(t.walletEffect === 3000 && t.cashEffect === -2970, "cash out Rs 3,000 (Rs 30 fee): account +3,000, customer gets Rs 2,970");
await txn(cashier, { walletId: jc._id, type: "cash_out", amount: 100, fee: 200 }, 400).then(() => ok(true, "fee cannot be more than the amount"));
t = await txn(cashier, { walletId: jc._id, type: "bill", amount: 2500, fee: 20, customerName: "LESCO bill", ref: "REF-1" });
ok(t.walletEffect === -2500 && t.cashEffect === 2520, "electricity bill Rs 2,500 + Rs 20");
t = await txn(cashier, { walletId: jc._id, type: "cash_in", amount: 1000, fee: 0, method: "bank" });
ok(t.cashEffect === 0, "paid by bank transfer: drawer not touched");

section("Top-up, withdraw, commission (owner / manager)");
await txn(cashier, { walletId: jazz._id, type: "float_in", amount: 10250, paid: 10000 }, 403).then(() => ok(true, "cashier cannot top up"));
await txn(owner, { walletId: jazz._id, type: "float_in", amount: 10000, paid: 10250 }, 400).then(() => ok(true, "paid cannot be more than received"));
t = await txn(owner, { walletId: jazz._id, type: "float_in", amount: 10250, paid: 10000 });
ok(t.walletEffect === 10250 && t.cashEffect === -10000 && t.commission === 250, "top-up: paid Rs 10,000, SIM +10,250 (Rs 250 bonus = commission)");
t = await txn(owner, { walletId: bank._id, type: "float_out", amount: 1000 });
ok(t.walletEffect === -1000 && t.cashEffect === 1000, "Rs 1,000 withdrawn from bank into the drawer");
t = await txn(owner, { walletId: jc._id, type: "commission", amount: 500 });
ok(t.walletEffect === 500 && t.commission === 500 && t.cashEffect === 0, "monthly JazzCash commission Rs 500 credited");

section("Day totals and the drawer");
day = await owner.call("/api/wallet-txns");
const profit = 14 + 168 + 8.4 + 40 + 50 + 30 + 20 + 250 + 500; // incl. the Rs 6,000 load that won the race
eq(day.summary.profit, profit, "profit today = fees + commission");
ok(day.summary.byType.load.count === 2 && day.summary.byType.package.count === 2 && day.summary.byType.cash_in.count === 2, "counts by type");
let live = await owner.call("/api/shifts/current");
const cashNet = 500 + 6000 + 300 + 1200 + 5050 - 2970 + 2520 - 10000 + 1000;
eq(round(live.summary.walletCash.cashIn + live.summary.walletCash.cashOut), cashNet, "drawer: wallet cash in and out");
eq(live.summary.expectedCash, 20000 + cashNet, "expected cash includes Easyload & wallets");

section("Cancelling a wrong entry");
const wrong = day.rows.find((r) => r.type === "cash_in" && r.method === "cash");
await cashier.call(`/api/wallet-txns/${wrong._id}/reverse`, { body: { reason: "Wrong number" }, expect: 403 }).then(() => ok(true, "cashier cannot cancel entries"));
const jcBefore = await bal(jc);
const rev = await owner.call(`/api/wallet-txns/${wrong._id}/reverse`, { body: { reason: "Sent to wrong number, money returned" } });
ok(rev.type === "reversal" && rev.walletEffect === 5000 && rev.cashEffect === -5050, "cancellation puts Rs 5,000 back on the account and Rs 5,050 out of the drawer");
eq(await bal(jc), jcBefore + 5000, "account balance restored");
await owner.call(`/api/wallet-txns/${wrong._id}/reverse`, { body: { reason: "again" }, expect: 400 }).then(() => ok(true, "cannot cancel twice"));
await owner.call(`/api/wallet-txns/${rev._id}/reverse`, { body: { reason: "again" }, expect: 400 }).then(() => ok(true, "a cancellation cannot be cancelled"));
day = await owner.call("/api/wallet-txns");
eq(day.summary.profit, profit - 50, "the cancelled entry's fee is not counted");
live = await owner.call("/api/shifts/current");
eq(live.summary.expectedCash, 20000 + cashNet - 5050, "drawer expects the money given back");

section("Balance check");
const r = await owner.call(`/api/wallets/${jazz._id}/reconcile`, { body: { actual: 12200, note: "Checked *444#" } });
ok(r.difference === -50 && r.wallet.balance === 12200, "app shows Rs 12,200 (records 12,250): corrected by −50");
eq((await owner.call(`/api/wallets/${jazz._id}/reconcile`, { body: { actual: 12200 } })).difference, 0, "no difference → no entry");

section("Branches, backup, activity");
const b2 = await owner.call("/api/branches", { body: { name: "Mall Branch" } });
await owner.call("/api/branches/switch", { body: { branchId: b2._id } });
await txn(owner, { walletId: jazz._id, type: "load", amount: 100, customerNumber: "03012345678" }, 404).then(() => ok(true, "a SIM of another branch cannot be used here"));
eq((await owner.call("/api/wallets")).length, 0, "Mall Branch has its own accounts");
const backup = await owner.call("/api/backup");
ok(backup.data.wallets.length === 3 && backup.data.mobilePackages.length === 3 && backup.data.walletTxns.length === day.rows.length + 1, "backup has accounts, packages and every entry");
const acts = (await owner.call("/api/activity")).rows.map((a) => a.action);
ok(["wallet.create", "wallet.float_in", "wallet.reverse", "wallet.reconcile", "wallet.commission"].every((a) => acts.includes(a)), "activity log: accounts, top-ups, commission, cancellations, corrections");
function round(n) {
  return Math.round(n * 100) / 100;
}
await done();
