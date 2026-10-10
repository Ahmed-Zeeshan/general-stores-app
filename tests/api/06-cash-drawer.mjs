import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Cash drawer shifts & Z report ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Drawer Mart", shopType: "general", maxUsers: 4, ownerName: "Hamza", username: "hamza", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 2, ownerName: "Zara", username: "zara", password: "secret1" } });
await owner.login("hamza", "secret1");
await other.login("zara", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const item = await owner.call("/api/products", { body: { name: "Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 1, openingStock: 500 } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Bilal", phone: "0300-1234567", openingBalance: 500 } });
const sup = await owner.call("/api/parties", { body: { type: "supplier", name: "Distributor", openingBalance: 1000 } });
const sale = (who, qty, extra) => who.call("/api/sales", { body: { items: [{ productId: item._id, qty }], ...extra } });

section("Open the drawer");
eq((await cashier.call("/api/shifts/current")).shift, null, "no drawer open yet");
const shift = await cashier.call("/api/shifts", { body: { openingCash: 5000, note: "Morning float" } });
eq(shift.shiftNo, "SFT-000001", "shift number");
eq(shift.openingCash, 5000, "opening cash");
await owner.call("/api/shifts", { body: { openingCash: 100 }, expect: 409 }).then((e) => ok(/already open/.test(e.error), "second open drawer at same branch refused"));
await cashier.call("/api/shifts", { body: { openingCash: -5 }, expect: 400 }).then(() => ok(true, "negative opening refused"));

section("A day of business");
await sale(cashier, 3, { paymentMethod: "cash" }); // cash 300
await sale(cashier, 3, { payments: [{ method: "cash", amount: 200 }, { method: "jazzcash", amount: 100 }] }); // cash 200
await sale(cashier, 1, { paymentMethod: "card" });
await sale(cashier, 2, { paymentMethod: "credit", customerId: cust._id });
const big = await sale(cashier, 5, { paymentMethod: "cash", amountPaid: 1000 }); // cash 500, change 500
eq(big.change, 500, "change given");
const first = (await owner.call("/api/sales")).find((s) => s.total === 300 && s.paymentMethod === "cash");
await owner.call(`/api/sales/${first._id}/return`, { body: { items: [{ index: 0, qty: 1 }] } }); // cash refund 100
await cashier.call(`/api/parties/${cust._id}/payment`, { body: { type: "payment", amount: 150, method: "cash" } });
await cashier.call(`/api/parties/${cust._id}/payment`, { body: { type: "payment", amount: 50, method: "jazzcash" } });
await owner.call(`/api/parties/${sup._id}/payment`, { body: { type: "payment", amount: 400, method: "cash" } });
await owner.call("/api/purchases", { body: { supplierId: sup._id, amountPaid: 300, items: [{ productId: item._id, qty: 10, cost: 80 }] } });
await owner.call("/api/purchases", { body: { items: [{ productId: item._id, qty: 2, cost: 80 }] } }); // paid 160, no supplier
await owner.call("/api/expenses", { body: { category: "Tea & Food", amount: 250 } });
await owner.call("/api/expenses", { body: { category: "Electricity", amount: 999, method: "bank" } });
await cashier.call(`/api/shifts/${shift._id}/movement`, { body: { kind: "in", amount: 1000, reason: "Change from bank" } });
await owner.call(`/api/shifts/${shift._id}/movement`, { body: { kind: "out", amount: 2000, reason: "Bank deposit" } });
await cashier.call(`/api/shifts/${shift._id}/movement`, { body: { kind: "out", amount: 10, reason: "x" }, expect: 400 }).then(() => ok(true, "reason required for cash out"));
await other.call(`/api/shifts/${shift._id}/movement`, { body: { kind: "in", amount: 10, reason: "hack" }, expect: 400 }).then(() => ok(true, "other shop cannot touch this drawer"));

section("Expected cash");
const expected = 5000 + (300 + 200 + 500) + 150 + 1000 - 100 - 400 - (300 + 160) - 250 - 2000;
const live = await owner.call("/api/shifts/current");
eq(live.summary.expectedCash, expected, `owner sees expected cash (${expected})`);
eq(live.summary.bills, 5, "5 bills");
eq(live.summary.sales, 300 + 300 + 100 + 200 + 500, "sales total");
eq(live.summary.returns, 100, "returns");
eq(live.summary.salesByMethod.find((m) => m.method === "jazzcash").total, 100, "JazzCash from split bill");
eq(live.summary.salesByMethod.find((m) => m.method === "credit").total, 200, "udhaar given");
eq(live.summary.udhaarCollectedByMethod.find((m) => m.method === "cash").total, 150, "udhaar collected cash");
eq(live.summary.expensesOther, 999, "bank expense listed but not from drawer");
const cv = await cashier.call("/api/shifts/current");
eq(cv.summary, null, "cashier does not see expected cash before closing");
ok((await cashier.call("/api/shifts")).every((s) => s.status !== "open" || s.expectedCash === undefined), "cashier list hides expected for open drawer");
eq((await cashier.call(`/api/shifts/${shift._id}`)).summary, null, "cashier cannot open the X report");

section("Close the day");
await cashier.call(`/api/shifts/${shift._id}/close`, { body: {}, expect: 400 }).then((e) => ok(/Count the cash/.test(e.error), "must enter counted cash"));
const closed = await cashier.call(`/api/shifts/${shift._id}/close`, {
  body: { denominations: [{ value: 1000, count: 3 }, { value: 500, count: 1 }, { value: 100, count: 4 }, { value: 0, count: 30 }], note: "Rs 10 short" },
});
eq(closed.countedCash, 3930, "counted from notes = 3930");
eq(closed.expectedCash, expected, "expected saved");
eq(closed.difference, 3930 - expected, "difference (short 10)");
eq(closed.status, "closed", "closed");
eq(closed.closedByName, "Kashif", "closed by cashier");
ok(closed.summary && closed.summary.cashFlow.length > 5, "Z report summary saved");
await cashier.call(`/api/shifts/${shift._id}/close`, { body: { countedCash: 1 }, expect: 400 }).then((e) => ok(/already closed/.test(e.error), "cannot close twice"));
await cashier.call(`/api/shifts/${shift._id}/movement`, { body: { kind: "in", amount: 5, reason: "late" }, expect: 400 }).then(() => ok(true, "no cash in/out after close"));
await sale(cashier, 1, { paymentMethod: "cash" });
const z = await owner.call(`/api/shifts/${shift._id}`);
eq(z.summary.bills, 5, "Z report frozen after close (later bill not added)");
eq((await cashier.call(`/api/shifts/${shift._id}`)).countedCash, 3930, "cashier can see the closed report");
await other.call(`/api/shifts/${shift._id}`, { expect: 404 }).then(() => ok(true, "other shop cannot read the report"));
eq((await owner.raw(`/receipt/shift/${shift._id}`)).status, 200, "Z report page");
eq((await owner.raw("/drawer")).status, 200, "drawer page");

section("Next day");
const s2 = await owner.call("/api/shifts", { body: { openingCash: 3930 } });
eq(s2.shiftNo, "SFT-000002", "next shift number");
const list = await owner.call("/api/shifts");
eq(list.length, 2, "history lists both days");
await sale(cashier, 2, { paymentMethod: "cash" }); // 200 in the new day
const closedTotal = await owner.call(`/api/shifts/${s2._id}/close`, { body: { countedCash: 4130 } });
eq(closedTotal.expectedCash, 3930 + 200, "next day counts only its own sales (a bill made between days is in the opening count)");
eq(closedTotal.difference, 0, "exact");
const backup = await owner.call("/api/backup");
ok(backup.data.shifts.length === 2, "shifts in backup");
await owner.call("/api/restore", { body: { backup, confirm: "Drawer Mart" } });
eq((await owner.call("/api/shifts", { body: { openingCash: 1 } })).shiftNo, "SFT-000003", "numbering continues after restore");

await done();
