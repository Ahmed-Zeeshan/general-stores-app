import { Client, ok, eq, section, db, oid, done } from "../lib/harness.mjs";

// ---------- Installments (qist) ----------
const imei = (n) => {
  const body = String(35_500_000_000_000 + n).padStart(14, "0");
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
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1" } });
await owner.login("ali", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const phone = await owner.call("/api/products", { body: { name: "Vivo Y28", unit: "pcs", costPrice: 38000, salePrice: 45000, lowStockAlert: 0, trackSerial: true, warrantyMonths: 12 } });
const I = [imei(3), imei(17)];
const devs = await owner.call("/api/devices", { body: { productId: phone._id, cost: 38000, units: [{ imei: I[0] }, { imei: I[1] }] } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Shahid Mehmood", phone: "03211234567", creditLimit: 1000 } });
await owner.call("/api/shifts", { body: { openingCash: 5000 } });
const saleBody = (dev) => ({ items: [{ productId: phone._id, qty: 1, serials: [dev] }], paymentMethod: "cash", amountPaid: 15000, customerId: cust._id });
const planBody = { months: 6, markupType: "percent", markupValue: 10, firstDue: day(30), customerCnic: "3410112345673", customerAddress: "Gujranwala", guarantor: { name: "Tariq Mehmood", cnic: "34101-7654321-1", phone: "03001112223", relation: "Brother" } };

section("Rules");
await cashier.call("/api/installments", { body: { sale: saleBody(devs[0]._id), plan: { ...planBody, customerCnic: "123" } }, expect: 400 }).then((e) => ok(/13 digits/.test(e.error), "customer CNIC required (13 digits)"));
await cashier.call("/api/installments", { body: { sale: saleBody(devs[0]._id), plan: { ...planBody, guarantor: { ...planBody.guarantor, cnic: "1" } } }, expect: 400 }).then((e) => ok(/Guarantor CNIC/.test(e.error), "guarantor CNIC checked"));
await cashier.call("/api/installments", { body: { sale: { ...saleBody(devs[0]._id), customerId: undefined }, plan: planBody }, expect: 400 }).then((e) => ok(/customer/.test(e.error), "customer required"));
await cashier.call("/api/installments", { body: { sale: saleBody(devs[0]._id), plan: { ...planBody, firstDue: day(-5) } }, expect: 400 }).then((e) => ok(/past/.test(e.error), "first due date cannot be in the past"));
await cashier.call("/api/installments", { body: { sale: saleBody(devs[0]._id), plan: { ...planBody, months: 0 } }, expect: 400 }).then(() => ok(true, "at least 1 month"));
eq((await owner.call(`/api/devices/${devs[0]._id}`)).status, "in_stock", "nothing saved by the refused attempts (phone still in stock)");

section("Selling on installments");
const r = await cashier.call("/api/installments", { body: { sale: saleBody(devs[0]._id), plan: planBody } });
const plan = r.plan;
ok(plan.planNo === "QST-000001" && r.sale.installment === true && r.sale.invoiceNo === plan.invoiceNo, "QST-000001 with bill " + plan.invoiceNo);
ok(plan.cashPrice === 45000 && plan.advance === 15000 && plan.markup === 3000 && plan.financed === 33000, "Rs 45,000 phone, Rs 15,000 advance, 10% markup on 30,000 = Rs 3,000 → Rs 33,000 in installments");
ok(plan.schedule.length === 6 && plan.schedule.every((x) => x.amount === 5500) && plan.schedule[0].dueDate.slice(0, 10) <= day(31), "6 monthly installments of Rs 5,500");
ok(plan.itemsText.includes(I[0]) && plan.guarantor.cnic === "34101-7654321-1" && plan.customerCnic === "34101-1234567-3", "plan keeps the IMEI, customer and guarantor CNIC");
ok(plan.balance === 33000 && plan.overdue === 0 && plan.next.amount === 5500, "balance Rs 33,000; next Rs 5,500");
eq((await owner.call(`/api/devices/${devs[0]._id}`)).status, "sold", "phone sold");
eq((await owner.call(`/api/parties/${cust._id}`)).party.balance, 0, "installments do not go into the khata (and the credit limit does not apply)");
await owner.call(`/api/sales/${plan.sale}/return`, { body: {}, expect: 400 }).then((e) => ok(/on installments/.test(e.error), "an installment bill cannot be returned like a normal bill"));

section("Collecting installments");
let p = await cashier.call(`/api/installments/${plan._id}/pay`, { body: { amount: 5500, method: "cash" } });
ok(p.receiptNo === "QST-000001-1" && p.paid === 5500 && p.rows[0].state === "paid" && p.balance === 27500, "1st installment received (receipt QST-000001-1), Rs 27,500 left");
await cashier.call(`/api/installments/${plan._id}/pay`, { body: { amount: 40000 }, expect: 400 }).then((e) => ok(/Only Rs 27500/.test(e.error), "cannot pay more than the balance"));
p = await cashier.call(`/api/installments/${plan._id}/pay`, { body: { amount: 3000, method: "jazzcash", ref: "JC55" } });
ok(p.rows[1].state === "part" && p.rows[1].paid === 3000, "part payment goes to the 2nd month");
const wrong = p.payments.find((x) => x.receiptNo === "QST-000001-2");
await cashier.call(`/api/installments/${plan._id}/payments/${wrong._id}/reverse`, { body: { reason: "Entered twice" }, expect: 403 }).then(() => ok(true, "cashier cannot cancel a payment"));
p = await owner.call(`/api/installments/${plan._id}/payments/${wrong._id}/reverse`, { body: { reason: "Entered twice" } });
ok(p.paid === 5500 && p.rows[1].state === "due" && p.payments.find((x) => x._id === wrong._id).reversed, "payment cancelled: back to Rs 5,500 paid");
await owner.call(`/api/installments/${plan._id}/payments/${wrong._id}/reverse`, { body: { reason: "again" }, expect: 400 }).then(() => ok(true, "cannot cancel twice"));
const live = await owner.call("/api/shifts/current");
ok(live.summary.installmentsByMethod.find((m) => m.method === "cash")?.total === 5500 && live.summary.cashFlow.find((x) => x.label.startsWith("Installments"))?.amount === 5500, "drawer: Rs 5,500 installment cash (advance is in cash sales)");
eq(live.summary.salesByMethod.find((m) => m.method === "cash").total, 15000, "advance Rs 15,000 counted as a cash sale");

section("Late installments and reminders");
// Move the plan back in time: the 2nd and 3rd installments are now late.
await (await db()).collection("installmentplans").updateOne({ _id: oid(plan._id) }, { $set: { schedule: plan.schedule.map((x, i) => ({ ...x, dueDate: new Date(Date.now() + (i - 2) * 30 * 864e5 - 864e5) })) } });
let list = await owner.call("/api/installments?due=late");
ok(list.rows.length === 1 && list.rows[0].overdue === 11000 && list.rows[0].lateCount === 2 && list.rows[0].daysLate >= 30, "late list: Rs 11,000 overdue (2 months)");
ok(list.summary.latePlans === 1 && list.summary.outstanding === 27500, "summary: 1 late plan, Rs 27,500 outstanding");
await cashier.call(`/api/installments/${plan._id}/remind`, { method: "POST" });
ok((await owner.call(`/api/installments/${plan._id}`)).lastReminderAt, "reminder date saved");
eq((await owner.call("/api/installments?q=34101-1234567")).rows.length, 1, "search by CNIC");

section("Paying it off");
p = await cashier.call(`/api/installments/${plan._id}/pay`, { body: { amount: 27500, method: "bank" } });
ok(p.status === "completed" && p.balance === 0 && p.rows.every((x) => x.state === "paid"), "fully paid: plan completed");
await cashier.call(`/api/installments/${plan._id}/pay`, { body: { amount: 1 }, expect: 400 }).then((e) => ok(/fully paid/.test(e.error), "no more payments on a completed plan"));

section("Taking the goods back");
const r2 = await cashier.call("/api/installments", { body: { sale: { ...saleBody(devs[1]._id), amountPaid: 5000 }, plan: { ...planBody, markupType: "amount", markupValue: 2000, months: 4 } } });
ok(r2.plan.financed === 42000 && r2.plan.schedule.map((x) => x.amount).join(",") === "10500,10500,10500,10500", "Rs 5,000 advance + Rs 2,000 fixed markup: 4 × Rs 10,500");
await cashier.call(`/api/installments/${r2.plan._id}/pay`, { body: { amount: 10500 } });
await cashier.call(`/api/installments/${r2.plan._id}/cancel`, { body: { reason: "Stopped paying" }, expect: 403 }).then(() => ok(true, "cashier cannot close a plan"));
await owner.call(`/api/installments/${r2.plan._id}/cancel`, { body: { reason: "x", refund: 99999 }, expect: 400 }).then(() => ok(true, "reason needed; refund not more than paid"));
const c = await owner.call(`/api/installments/${r2.plan._id}/cancel`, { body: { reason: "Customer stopped paying, phone returned", takeBack: true } });
ok(c.status === "cancelled" && c.writtenOff === 31500 && c.cancelReason.includes("RTN-"), "plan closed: phone taken back, Rs 31,500 written off");
eq((await owner.call(`/api/devices/${devs[1]._id}`)).status, "in_stock", "phone back in stock");
const s2 = await owner.call(`/api/sales/${r2.plan.sale}`);
ok(s2.status === "returned", "its bill is marked returned");
eq((await owner.call(`/api/parties/${cust._id}`)).party.balance, 0, "khata untouched");
const z2 = await owner.call("/api/shifts/current");
eq(z2.summary.refundsByMethod.length, 0, "no money refunded from the drawer by taking goods back");

section("Backup and activity");
const backup = await owner.call("/api/backup");
eq(backup.data.installments.length, 2, "backup has both plans");
const acts = (await owner.call("/api/activity")).rows.map((a) => a.action);
ok(["installment.create", "installment.reverse", "installment.cancel"].every((a) => acts.includes(a)), "activity log: sold, payment cancelled, closed");
await done();
