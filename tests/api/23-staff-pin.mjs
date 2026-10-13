import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Staff: PIN to switch user on a shared counter, counter limits, automatic backups ----------
const admin = new Client("admin"), owner = new Client("owner"), counter = new Client("counter"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Bismillah Store", shopType: "general", maxUsers: 4, ownerName: "Bilal", username: "bilal", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 3, ownerName: "Omar", username: "omar", password: "secret3" } });
await owner.login("bilal", "secret1");
await other.login("omar", "secret3");
const kashif = await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
const sana = await owner.call("/api/users", { body: { name: "Sana", username: "sana", password: "secret4", role: "manager" } });
const soap = await owner.call("/api/products", { body: { name: "Lux Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 0, openingStock: 100 } });
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Shahid", phone: "03211234567" } });
const me = async (c) => (await c.call("/api/auth/me")).user;

section("PIN");
await owner.call(`/api/users/${kashif._id}`, { method: "PUT", body: { pin: "12" }, expect: 400 }).then((e) => ok(/4 to 6 digits/.test(e.error), "PIN must be 4–6 digits"));
await owner.call(`/api/users/${kashif._id}`, { method: "PUT", body: { pin: "1234" } });
await owner.call(`/api/users/${sana._id}`, { method: "PUT", body: { pin: "908172" } });
const staff = (await owner.call("/api/users")).users;
ok(staff.find((u) => u.username === "kashif").hasPin && staff.every((u) => u.pinHash === undefined), "PIN saved (never sent back)");

// The counter computer is logged in as the owner; Kashif takes over with his PIN.
await counter.login("bilal", "secret1");
let list = await counter.call("/api/auth/switch");
ok(list.length === 2 && list.some((p) => p.name === "Kashif") && !list.some((p) => p.name === "Bilal"), "switch screen lists staff with a PIN");
await counter.call("/api/auth/switch", { body: { userId: kashif._id, pin: "4321" }, expect: 401 }).then(() => ok(true, "wrong PIN refused"));
await counter.call("/api/auth/switch", { body: { userId: kashif._id, pin: "1234" } });
eq((await me(counter)).name, "Kashif", "counter is now Kashif");
await counter.call("/api/settings", { method: "PUT", body: { shopName: "x" }, expect: 403 }).then(() => ok(true, "with Kashif's own permissions (cashier)"));
await counter.call("/api/auth/switch", { body: { userId: sana._id, pin: "908172" } });
eq((await me(counter)).role, "manager", "then Sana (manager) takes over");
const acts = (await owner.call("/api/activity")).rows.map((a) => a.summary);
ok(acts.some((s) => /Kashif took over the counter from Bilal/.test(s)) && acts.some((s) => /Wrong PIN for Kashif/.test(s)), "activity log: switches and the wrong PIN");
await other.call("/api/auth/switch", { body: { userId: kashif._id, pin: "1234" }, expect: 404 }).then(() => ok(true, "another shop cannot switch to Kashif"));
await new Client("anon").call("/api/auth/switch", { body: { userId: kashif._id, pin: "1234" }, expect: 401 }).then(() => ok(true, "nobody logged in: no PIN switch"));
for (let i = 0; i < 10; i++) await counter.call("/api/auth/switch", { body: { userId: kashif._id, pin: "0000" }, expect: 401 });
await counter.call("/api/auth/switch", { body: { userId: kashif._id, pin: "1234" }, expect: 429 }).then(() => ok(true, "10 wrong PINs: locked for a while"));
await owner.call(`/api/users/${sana._id}`, { method: "PUT", body: { pin: "" } });
ok(!(await owner.call("/api/users")).users.find((u) => u.username === "sana").hasPin, "PIN removed");

section("Counter limits");
const cashier = new Client("cashier");
await cashier.login("kashif", "secret2");
await owner.call(`/api/users/${kashif._id}`, { method: "PUT", body: { maxDiscountPct: 5, allowUdhaar: false } });
const bill = (extra) => ({ items: [{ productId: soap._id, qty: 10 }], paymentMethod: "cash", ...extra });
await cashier.call("/api/sales", { body: bill({ discount: 100 }), expect: 400 }).then((e) => ok(/10.0% is more than your limit of 5%/.test(e.error), "10% bill discount refused (limit 5%)"));
await cashier.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 10, discount: 60 }], paymentMethod: "cash" }, expect: 400 }).then(() => ok(true, "item discounts count too"));
ok((await cashier.call("/api/sales", { body: bill({ discount: 50 }) })).total === 950, "5% is allowed");
await cashier.call("/api/sales", { body: bill({ paymentMethod: "credit", amountPaid: 0, customerId: cust._id }), expect: 400 }).then((e) => ok(/not allowed to give udhaar/.test(e.error), "udhaar refused for Kashif"));
ok((await owner.call("/api/sales", { body: bill({ discount: 300, paymentMethod: "credit", amountPaid: 0, customerId: cust._id }) })).creditAmount === 700, "the owner has no limits");
const off = await cashier.call("/api/sales", { body: { ...bill({ paymentMethod: "credit", amountPaid: 0, customerId: cust._id }), clientId: "test-offline-1", soldAt: new Date(Date.now() - 3600e3).toISOString() } });
ok(off.creditAmount === 1000, "an offline bill already handed over is still recorded");
await owner.call(`/api/users/${kashif._id}`, { method: "PUT", body: { maxDiscountPct: "", allowUdhaar: true } });
ok((await cashier.call("/api/sales", { body: bill({ discount: 200 }) })).total === 800, "limits removed");

section("Automatic backups");
const ab = await owner.call("/api/backup/auto");
ok(ab.enabled === false && typeof ab.dir === "string" && Array.isArray(ab.files), "owner sees the automatic backup status (off in tests) and folder");
await cashier.call("/api/backup/auto", { expect: 403 }).then(() => ok(true, "cashier cannot"));
await owner.call("/api/backup/auto?file=../../etc/passwd", { expect: 404 }).then(() => ok(true, "only this shop's backup files can be downloaded"));
await done();
