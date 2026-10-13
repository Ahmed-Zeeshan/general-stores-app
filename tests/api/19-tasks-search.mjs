import { Client, ok, eq, section, db, oid, done } from "../lib/harness.mjs";

// ---------- Today's tasks (bell) and the search box ----------
const imei = (n) => {
  const body = String(35_900_000_000_000 + n).padStart(14, "0");
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
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Bismillah Store", shopType: "general", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret3" } });
await owner.login("ali", "secret1");
await other.login("bilal", "secret3");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const tasks = async (c = owner) => (await c.call("/api/tasks")).tasks;
const find = (list, id) => list.find((t) => t.id.startsWith(id));

section("Cash drawer");
ok(find(await tasks(), "drawer-open"), "no drawer open: 'Open the cash drawer'");
const shift = await owner.call("/api/shifts", { body: { openingCash: 5000 } });
ok(!find(await tasks(), "drawer"), "drawer open today: nothing to do");
await (await db()).collection("shifts").updateOne({ _id: oid(shift._id) }, { $set: { openedAt: new Date(Date.now() - 2 * 864e5) } });
ok(find(await tasks(), "drawer-close")?.tone === "red", "drawer left open since an earlier day: 'Close the old day' (red)");
await (await db()).collection("shifts").updateOne({ _id: oid(shift._id) }, { $set: { openedAt: new Date() } });

section("Installments, repairs, balances, stock, udhaar");
const phone = await owner.call("/api/products", { body: { name: "Vivo Y28", unit: "pcs", costPrice: 38000, salePrice: 45000, lowStockAlert: 0, trackSerial: true } });
const devs = await owner.call("/api/devices", { body: { productId: phone._id, cost: 38000, units: [{ imei: imei(1) }, { imei: imei(2) }] } });
const shahid = await owner.call("/api/parties", { body: { type: "customer", name: "Shahid Mehmood", phone: "0321-1234567" } });
const r = await cashier.call("/api/installments", { body: { sale: { items: [{ productId: phone._id, qty: 1, serials: [devs[0]._id] }], paymentMethod: "cash", amountPaid: 15000, customerId: shahid._id }, plan: { months: 6, markupType: "percent", markupValue: 10, firstDue: day(30), customerCnic: "3410112345673" } } });
await (await db()).collection("installmentplans").updateOne({ _id: oid(r.plan._id) }, { $set: { schedule: r.plan.schedule.map((x, i) => ({ ...x, dueDate: new Date(Date.now() + i * 30 * 864e5 - 864e5) })) } });
let t = find(await tasks(), `qst-${r.plan._id}`);
ok(t && t.tone === "red" && t.title.includes("Rs 5,500 late") && t.wa?.kind === "installment" && t.wa.overdue === 5500, "late installment: red, Rs 5,500 late, WhatsApp reminder ready");
await cashier.call(t.wa.remindUrl, { method: "POST" });
ok(find(await tasks(), `qst-${r.plan._id}`).detail.includes("reminded today"), "after the reminder: 'reminded today'");

const job = await cashier.call("/api/repairs", { body: { customerName: "Nadeem", customerPhone: "0333-7654321", deviceName: "Redmi Note 12", problem: "Screen", promisedAt: day(-1) } });
ok(find(await tasks(), `job-late-${job._id}`)?.tone === "red", "repair past its promised date: late (red)");
await cashier.call(`/api/repairs/${job._id}/status`, { body: { status: "ready" } });
t = find(await tasks(), `job-ready-${job._id}`);
ok(t && !find(await tasks(), `job-late-${job._id}`) && t.wa?.kind === "repair" && t.wa.phone === "0333-7654321", "ready repair: 'ready' WhatsApp to the customer, no longer late");

await owner.call("/api/wallets", { body: { name: "Jazz SIM", kind: "load", provider: "jazz", lowAlert: 5000, commissionPct: 2.8, openingBalance: 3000 } });
ok(find(await tasks(), "wallet-")?.title === "Top up Jazz SIM", "SIM below its alert: 'Top up Jazz SIM'");

await owner.call("/api/products", { body: { name: "Tempered Glass A54", brand: "Remax", fits: "Samsung A54, A55", unit: "pcs", costPrice: 80, salePrice: 300, lowStockAlert: 5, openingStock: 2 } });
ok(find(await tasks(), "stock-low")?.detail.includes("Tempered Glass A54"), "low stock listed");

const usman = await owner.call("/api/parties", { body: { type: "customer", name: "Usman Ghani", phone: "0300-1112223", openingBalance: 8000 } });
ok(!find(await tasks(), `udhaar-${usman._id}`), "new udhaar is not nagged about");
await (await db()).collection("ledgerentries").updateMany({ party: oid(usman._id) }, { $set: { createdAt: new Date(Date.now() - 45 * 864e5) } });
t = find(await tasks(), `udhaar-${usman._id}`);
ok(t && t.wa.kind === "udhaar" && t.wa.amount === 8000 && t.detail.includes("never reminded"), "udhaar unpaid 45 days and never reminded: remind Usman Rs 8,000");
await cashier.call("/api/reminders", { body: { partyId: usman._id, kind: "reminder" } });
ok(!find(await tasks(), `udhaar-${usman._id}`), "reminded: off the list for 7 days");

const c = await owner.call("/api/tasks");
ok(c.counts.installments === 1 && c.counts.repairs === 1 && c.counts.wallets === 1, "counts per group for the bell");
ok((await tasks(cashier)).some((x) => x.group === "repairs"), "cashier sees the tasks too");
const g = await other.call("/api/tasks");
ok(!g.tasks.some((x) => ["installments", "repairs", "wallets"].includes(x.group)) && find(g.tasks, "drawer-open"), "general store: only its own tasks (drawer), nothing from the mobile shop");

section("Search");
const s = async (q, c = owner) => (await c.call(`/api/search?q=${encodeURIComponent(q)}`)).reduce((a, g) => ({ ...a, [g.type]: g.hits }), {});
let h = await s("03211234567");
ok(h.customer?.[0]?.title === "Shahid Mehmood" && h.installment?.length === 1, "mobile number without dashes finds the customer and the plan");
h = await s("3410112345673");
ok(h.installment?.[0]?.title.startsWith("QST-000001"), "CNIC without dashes finds the installment plan");
h = await s(imei(2).slice(-6));
ok(h.device?.length === 1 && h.device[0].title.includes(imei(2)) && h.device[0].href === `/phones?q=${imei(2)}`, "last digits of an IMEI find the phone");
h = await s("glass a55");
ok(h.product?.[0]?.title === "Tempered Glass A54", "product by words and the phone model it fits");
h = await s(r.sale.invoiceNo);
ok(h.sale?.[0]?.title === r.sale.invoiceNo && h.sale[0].href.includes(`q=${r.sale.invoiceNo}`), "bill number opens Sales History filtered to it");
h = await s("JOB-000001");
ok(h.repair?.[0]?.href === `/repairs/${job._id}`, "job number finds the repair");
h = await s("Redmi");
ok(h.repair?.length === 1, "phone model finds the repair");
const supplier = await owner.call("/api/parties", { body: { type: "supplier", name: "Shahid Traders", phone: "0301-5556667" } });
ok((await s("Shahid")).supplier?.[0]?.id === supplier._id, "owner finds suppliers");
ok(!(await s("Shahid", cashier)).supplier, "cashier does not see suppliers");
ok(Object.keys(await s("Shahid", other)).length === 0, "another shop finds nothing of this shop");
eq((await owner.call("/api/search?q=a")).length, 0, "one letter: no search");
await done();
