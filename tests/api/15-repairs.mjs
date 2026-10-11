import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Repair job cards ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 4, ownerName: "Ali", username: "ali", password: "secret1" } });
await owner.login("ali", "secret1");
const tech = await owner.call("/api/users", { body: { name: "Kashif (technician)", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const screen = await owner.call("/api/products", { body: { name: "Screen Redmi Note 12", unit: "pcs", costPrice: 3200, salePrice: 4500, lowStockAlert: 1, openingStock: 2 } });
const battery = await owner.call("/api/products", { body: { name: "Battery BN5A", unit: "pcs", costPrice: 900, salePrice: 1800, lowStockAlert: 1, openingStock: 0 } });
const phone = await owner.call("/api/products", { body: { name: "Redmi 13", unit: "pcs", costPrice: 30000, salePrice: 34000, lowStockAlert: 0, trackSerial: true } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Nadeem", phone: "03331234567" } });
const shift = await owner.call("/api/shifts", { body: { openingCash: 10000 } });
const stock = async (p) => (await owner.call(`/api/products/${p._id}`)).product.stock;
const base = { customerId: cust._id, customerName: "Nadeem", customerPhone: "0333-1234567", deviceName: "Redmi Note 12", imei: "35 123456 789012 3", color: "Blue", lockCode: "1234", accessories: ["SIM", "Back cover"], conditionNotes: "Screen cracked, back scratched", problem: "Screen broken, touch not working", estimate: 6000, promisedAt: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), technicianId: tech._id, warrantyDays: 30, advance: 500, advanceMethod: "cash" };

section("Booking a phone in");
await cashier.call("/api/repairs", { body: { ...base, problem: "" }, expect: 400 }).then(() => ok(true, "problem is required"));
await cashier.call("/api/repairs", { body: { ...base, customerPhone: "12" }, expect: 400 }).then(() => ok(true, "customer mobile number is required"));
const job = await cashier.call("/api/repairs", { body: base });
ok(job.jobNo === "JOB-000001" && job.status === "received" && job.paid === 500 && job.payments[0].receiptNo === "JOB-000001-1", "JOB-000001 booked with Rs 500 advance (receipt JOB-000001-1)");
ok(job.imei === "351234567890123" && job.technicianName === "Kashif (technician)" && job.accessories.length === 2, "IMEI cleaned, technician and accessories saved");
let list = await owner.call("/api/repairs");
ok(list.rows.length === 1 && list.counts.received === 1, "open jobs list with counts by status");
eq((await owner.call("/api/repairs?q=1234567")).rows.length, 1, "search by mobile number");
eq((await owner.call("/api/repairs?q=351234567890123")).rows.length, 1, "search by IMEI");

section("Working on it");
for (const s of ["checking", "waiting_parts", "repairing"]) await cashier.call(`/api/repairs/${job._id}/status`, { body: { status: s } });
let j = await owner.call(`/api/repairs/${job._id}`);
ok(j.status === "repairing" && j.history.map((h) => h.status).join(",") === "received,checking,waiting_parts,repairing", "status steps recorded in the history");
await cashier.call(`/api/repairs/${job._id}/parts`, { body: { productId: battery._id, qty: 1 }, expect: 400 }).then((e) => ok(/Only 0/.test(e.error), "part not in stock refused"));
await cashier.call(`/api/repairs/${job._id}/parts`, { body: { productId: phone._id, qty: 1 }, expect: 400 }).then((e) => ok(/not a spare part/.test(e.error), "a phone (IMEI) cannot be used as a part"));
await cashier.call(`/api/repairs/${job._id}/parts`, { body: { productId: screen._id, qty: 1, price: 3000 }, expect: 403 }).then(() => ok(true, "cashier cannot change a part's price"));
j = await cashier.call(`/api/repairs/${job._id}/parts`, { body: { productId: screen._id, qty: 1 } });
ok(j.parts.length === 1 && j.parts[0].price === 4500 && j.parts[0].cost === 3200, "screen used: charged Rs 4,500 (cost 3,200)");
eq(await stock(screen), 1, "screen stock 2 → 1");
j = await owner.call(`/api/repairs/${job._id}/parts`, { body: { productId: screen._id, qty: 1, price: 4200 } });
eq(await stock(screen), 0, "second screen used (stock 0)");
j = await owner.call(`/api/repairs/${job._id}/parts/${j.parts[1]._id}`, { method: "DELETE" });
ok(j.parts.length === 1, "part removed from the job");
eq(await stock(screen), 1, "…and back in stock");
j = await cashier.call(`/api/repairs/${job._id}`, { method: "PATCH", body: { labour: 1500, diagnosis: "LCD and digitizer replaced" } });
ok(j.total === 6000 && j.balance === 5500, "bill: screen 4,500 + labour 1,500 = Rs 6,000; Rs 5,500 left");
await cashier.call(`/api/repairs/${job._id}`, { method: "PATCH", body: { discount: 500 }, expect: 403 }).then(() => ok(true, "cashier cannot give a discount"));
j = await owner.call(`/api/repairs/${job._id}`, { method: "PATCH", body: { discount: 200 } });
ok(j.total === 5800 && j.balance === 5300, "owner discount Rs 200 → bill Rs 5,800");
j = await cashier.call(`/api/repairs/${job._id}/payment`, { body: { amount: 1000, method: "jazzcash", ref: "JC1" } });
ok(j.paid === 1500 && j.receiptNo === "JOB-000001-2", "Rs 1,000 more received by JazzCash");
await cashier.call(`/api/repairs/${job._id}/payment`, { body: { kind: "refund", amount: 100 }, expect: 403 }).then(() => ok(true, "cashier cannot give money back"));
j = await cashier.call(`/api/repairs/${job._id}/status`, { body: { status: "ready" } });
ok(j.status === "ready" && j.readyAt, "ready to collect");

section("Two people changing the same job at once");
const race = await Promise.all([
  owner.raw(`/api/repairs/${job._id}`, { method: "PATCH", body: { diagnosis: "A" } }),
  cashier.raw(`/api/repairs/${job._id}`, { method: "PATCH", body: { diagnosis: "B" } }),
]);
ok(race.every((r) => r.status === 200 || r.status === 409) && race.some((r) => r.status === 200), `both saved one after the other, or the second is told to refresh (${race.map((r) => r.status).join(", ")})`);

section("Delivery");
let live = await owner.call("/api/shifts/current");
ok(live.summary.repairsByMethod.find((m) => m.method === "cash")?.total === 500 && live.summary.cashFlow.some((x) => x.label.startsWith("Repairs") && x.amount === 500), "drawer: Rs 500 repair cash (JazzCash not in drawer)");
await cashier.call(`/api/repairs/${job._id}/deliver`, { body: { amount: 2000 }, expect: 400 }).then((e) => ok(/still to collect/.test(e.error), "cannot deliver with money left unless it goes to khata"));
j = await cashier.call(`/api/repairs/${job._id}/deliver`, { body: { amount: 3000, method: "cash", toKhata: true } });
ok(j.status === "delivered" && j.creditAmount === 1300 && j.balance === 0, "delivered: Rs 3,000 collected, Rs 1,300 on khata");
eq((await owner.call(`/api/parties/${cust._id}`)).party.balance, 1300, "Nadeem's khata Rs 1,300");
ok(new Date(j.warrantyUntil) > new Date(Date.now() + 29 * 864e5), "30-day repair warranty started");
live = await owner.call("/api/shifts/current");
eq(live.summary.expectedCash, 10000 + 500 + 3000, "drawer expects Rs 13,500");
await owner.call(`/api/repairs/${job._id}`, { method: "PATCH", body: { labour: 1 }, expect: 400 }).then((e) => ok(/already delivered/.test(e.error), "a delivered job cannot be changed"));
await owner.call(`/api/repairs/${job._id}/parts`, { body: { productId: screen._id }, expect: 400 }).then(() => ok(true, "no parts after delivery"));

section("Warranty claim, cancel, overpaid advance");
const claim = await cashier.call("/api/repairs", { body: { ...base, advance: 0, warrantyOf: "job-000001", problem: "Touch not working again" } });
ok(claim.warrantyOf === "JOB-000001" && claim.history[0].note.includes("Warranty claim"), "warranty claim linked to JOB-000001");
await cashier.call("/api/repairs", { body: { ...base, warrantyOf: "JOB-000999" }, expect: 400 }).then(() => ok(true, "unknown job for warranty refused"));
const c = await cashier.call("/api/repairs", { body: { ...base, advance: 800, problem: "Not charging" } });
await owner.call(`/api/repairs/${c._id}/parts`, { body: { productId: screen._id } });
eq(await stock(screen), 0, "part taken for the job");
await cashier.call(`/api/repairs/${c._id}/cancel`, { body: { reason: "Customer did not want it" }, expect: 403 }).then(() => ok(true, "only owner/manager can cancel"));
await owner.call(`/api/repairs/${c._id}/cancel`, { body: { reason: "Too costly", charge: 900 }, expect: 400 }).then((e) => ok(/Only Rs 800/.test(e.error), "checking charge cannot be more than paid"));
const cc = await owner.call(`/api/repairs/${c._id}/cancel`, { body: { reason: "Customer did not want it", charge: 200 } });
ok(cc.status === "cancelled" && cc.paid === 200 && cc.total === 200 && cc.payments.at(-1).amount === -600, "returned unrepaired: Rs 200 checking charge kept, Rs 600 given back");
eq(await stock(screen), 1, "its part went back into stock");
const over = await cashier.call("/api/repairs", { body: { ...base, customerId: undefined, advance: 3000, problem: "Speaker" } });
await cashier.call(`/api/repairs/${over._id}`, { method: "PATCH", body: { labour: 1200 } });
const od = await cashier.call(`/api/repairs/${over._id}/deliver`, { body: {} });
ok(od.status === "delivered" && od.paid === 1200 && od.payments.at(-1).amount === -1800, "advance Rs 3,000 on a Rs 1,200 bill: Rs 1,800 given back at delivery");
live = await owner.call("/api/shifts/current");
eq(live.summary.repairsByMethod.find((m) => m.method === "cash").total, 500 + 3000 + 800 - 600 + 3000 - 1800, "drawer counts repair advances, payments and refunds");

section("Backup and activity");
const backup = await owner.call("/api/backup");
eq(backup.data.repairs.length, 4, "backup has the 4 jobs");
const acts = (await owner.call("/api/activity")).rows.map((r) => r.action);
ok(["repair.create", "repair.deliver", "repair.cancel", "repair.discount"].every((a) => acts.includes(a)), "activity log: booked, delivered, cancelled, discount");
await owner.call(`/api/shifts/${shift._id}/close`, { body: { countedCash: 10000 + 500 + 3000 + 800 - 600 + 3000 - 1800 } });
ok(true, "day closes with the repair cash counted");
await done();
