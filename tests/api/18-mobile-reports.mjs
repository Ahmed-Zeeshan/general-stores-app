import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Mobile shop figures on the dashboard and in reports ----------
const imei = (n) => {
  const body = String(35_700_000_000_000 + n).padStart(14, "0");
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
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + n * 864e5));
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), grocer = new Client("grocer");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Bismillah Store", shopType: "general", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret3" } });
await owner.login("ali", "secret1");
await grocer.login("bilal", "secret3");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");

const phone = await owner.call("/api/products", { body: { name: "Vivo Y28", unit: "pcs", costPrice: 38000, salePrice: 45000, lowStockAlert: 0, trackSerial: true } });
const devs = await owner.call("/api/devices", { body: { productId: phone._id, cost: 38000, units: [{ imei: imei(1) }] } });
const screen = await owner.call("/api/products", { body: { name: "Screen Y28", unit: "pcs", costPrice: 3000, salePrice: 4500, lowStockAlert: 0, openingStock: 3 } });
const cover = await owner.call("/api/products", { body: { name: "Cover Y28", unit: "pcs", costPrice: 200, salePrice: 500, lowStockAlert: 0, openingStock: 10 } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Shahid", phone: "03211234567" } });

section("A day in a mobile shop");
// Bill: a cover (profit Rs 300).
await cashier.call("/api/sales", { body: { items: [{ productId: cover._id, qty: 1 }], paymentMethod: "cash" } });
// Repair: screen (cost 3,000, charged 4,500) + Rs 1,500 labour, delivered → profit Rs 3,000. A second job stays open, promised yesterday (late).
const job = await cashier.call("/api/repairs", { body: { customerId: cust._id, customerName: "Shahid", customerPhone: "0321-1234567", deviceName: "Vivo Y28", problem: "Broken screen", advance: 1000, advanceMethod: "cash" } });
await owner.call(`/api/repairs/${job._id}/parts`, { body: { productId: screen._id, qty: 1 } });
await owner.call(`/api/repairs/${job._id}`, { method: "PATCH", body: { labour: 1500 } });
await cashier.call(`/api/repairs/${job._id}/deliver`, { body: { amount: 5000, method: "cash" } });
await cashier.call("/api/repairs", { body: { customerName: "Waqas", customerPhone: "0300-7654321", deviceName: "Oppo A17", problem: "Not charging", promisedAt: day(-1) } });
// Easyload: Rs 1,000 at 2.8% = Rs 28; a Rs 2,000 JazzCash cash-in with Rs 20 fee, then cancelled.
const jazz = await owner.call("/api/wallets", { body: { name: "Jazz SIM", kind: "load", provider: "jazz", lowAlert: 5000, commissionPct: 2.8, openingBalance: 5500 } });
const jc = await owner.call("/api/wallets", { body: { name: "JazzCash", kind: "wallet", provider: "jazzcash", feePct: 1, openingBalance: 20000 } });
await cashier.call("/api/wallet-txns", { body: { walletId: jazz._id, type: "load", amount: 1000, customerNumber: "03012345678" } });
const ci = await cashier.call("/api/wallet-txns", { body: { walletId: jc._id, type: "cash_in", amount: 2000, customerNumber: "03451234567" } });
await owner.call(`/api/wallet-txns/${ci._id}/reverse`, { body: { reason: "Wrong number" } });
// Used phone bought for Rs 20,000.
const usedModel = await owner.call("/api/products", { body: { name: "Samsung A12 (used)", unit: "pcs", costPrice: 0, salePrice: 25000, lowStockAlert: 0, trackSerial: true } });
await owner.call("/api/used-phones", { body: { seller: { name: "Imran", cnic: "3520212345671", phone: "0300-1112223" }, productId: usedModel._id, imei: imei(2), pta: "approved", price: 20000, method: "cash", declaration: true } });
// Installments: Rs 45,000 phone, Rs 15,000 advance, 10% markup → Rs 33,000; first Rs 5,500 collected.
const r = await cashier.call("/api/installments", { body: { sale: { items: [{ productId: phone._id, qty: 1, serials: [devs[0]._id] }], paymentMethod: "cash", amountPaid: 15000, customerId: cust._id }, plan: { months: 6, markupType: "percent", markupValue: 10, firstDue: day(30), customerCnic: "3410112345673" } } });
await cashier.call(`/api/installments/${r.plan._id}/pay`, { body: { amount: 5500 } });

section("Dashboard");
const dash = await owner.call("/api/dashboard");
const m = dash.mobile;
ok(m.repairs.delivered === 1 && m.repairs.income === 6000 && m.repairs.partsCost === 3000 && m.repairs.profit === 3000, "repairs: 1 delivered, Rs 6,000 bill − Rs 3,000 parts = Rs 3,000 profit");
ok(m.repairs.inShop === 1 && m.repairs.late === 1 && m.repairs.collected === 6000, "repairs: 1 still in the shop (late), Rs 6,000 received");
eq(m.wallets.profit, 28, "wallets: Rs 28 earned (cancelled cash-in earns nothing)");
ok(m.wallets.byType.find((t) => t.type === "load")?.count === 1 && (m.wallets.byType.find((t) => t.type === "cash_in")?.count ?? 0) === 0, "cancelled cash-in nets to zero entries");
ok(m.wallets.low.length === 1 && m.wallets.low[0].name === "Jazz SIM", "low balance: Jazz SIM (Rs 4,500 < Rs 5,000)");
ok(m.usedPhones.count === 1 && m.usedPhones.spent === 20000, "used phones: 1 bought for Rs 20,000");
ok(m.installments.sold === 1 && m.installments.markup === 3000 && m.installments.collected === 5500 && m.installments.outstanding === 27500 && m.installments.latePlans === 0, "installments: 1 sold, Rs 5,500 collected, Rs 27,500 to collect");
const cDash = await cashier.call("/api/dashboard");
ok(cDash.mobile.repairs.profit === undefined && cDash.mobile.wallets.profit === undefined && cDash.mobile.repairs.inShop === 1, "cashier sees the work, not the profit");
eq((await grocer.call("/api/dashboard")).mobile, null, "a general store gets no mobile section");

section("Reports");
const rep = await owner.call(`/api/reports?from=${day(0)}&to=${day(0)}`);
const s = rep.summary;
ok(s.repairProfit === 3000 && s.walletProfit === 28, "report: repairs Rs 3,000 and Easyload Rs 28 profit");
// Sales profit: cover Rs 300 + phone (45,000 − 38,000) Rs 7,000 = Rs 7,300.
eq(s.grossProfit, 7300, "gross profit from bills Rs 7,300");
eq(s.installmentProfit, 3000, "installment markup Rs 3,000 (10% of the Rs 30,000 left after the advance)");
eq(s.netProfit, 7300 + 3000 + 28 + 3000, "net profit includes repairs, Easyload and installment markup (Rs 13,328)");
ok(rep.mobile.installments.sold === 1 && rep.mobile.usedPhones.count === 1, "report has the installments and used phones sections");
const old = await owner.call(`/api/reports?from=${day(-10)}&to=${day(-5)}`);
ok(old.summary.repairProfit === 0 && old.mobile.repairs.delivered === 0 && old.mobile.installments.outstanding === 27500, "an earlier period has no repair profit (outstanding is always today's)");
eq((await grocer.call(`/api/reports?from=${day(0)}&to=${day(0)}`)).mobile, null, "a general store's report has no mobile section");
await done();
