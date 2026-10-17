import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- "Make bills only when the cash drawer is open" ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Drawer Mart", shopType: "general", maxUsers: 4, maxBranches: 2, ownerName: "Hamid", username: "hamid", password: "secret1" } });
await owner.login("hamid", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const b2 = await owner.call("/api/branches", { body: { name: "Gulberg Branch" } });
const soap = await owner.call("/api/products", { body: { name: "Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 0, openingStock: 500 } });
const bill = (who, extra = {}, expect = 200) => who.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1 }], paymentMethod: "cash", ...extra }, expect });
const base = { shopName: "Drawer Mart", shopType: "general", taxEnabled: false, taxRate: 0, pricesIncludeTax: true };

section("Rule off (the default)");
ok((await owner.call("/api/settings")).requireOpenDrawer === false, "off for a new shop");
await bill(cashier);
ok(true, "bill made with no drawer open");

section("Rule on");
await cashier.call("/api/settings", { method: "PUT", body: { ...base, requireOpenDrawer: true }, expect: 403 });
ok(true, "a cashier cannot switch it");
await owner.call("/api/settings", { method: "PUT", body: { ...base, requireOpenDrawer: true } });
ok((await owner.call("/api/settings")).requireOpenDrawer === true, "owner switched it on");
ok((await cashier.call("/api/auth/me")).settings.requireOpenDrawer === true, "New Bill knows about the rule");
let e = await bill(cashier, {}, 409);
ok(/cash drawer is not open/.test(e.error), "bill refused while the drawer is closed: " + e.error);
e = await bill(owner, {}, 409);
ok(/cash drawer is not open/.test(e.error), "…for the owner too");
const offline = await bill(cashier, { clientId: "offline-bill-0001", soldAt: new Date(Date.now() - 5 * 60_000).toISOString() });
ok(offline.invoiceNo && offline.offline !== false, "a bill made offline earlier is still accepted when it arrives");
const again = await bill(cashier, { clientId: "offline-bill-0001", soldAt: new Date(Date.now() - 5 * 60_000).toISOString() });
eq(again._id, offline._id, "…and sending it twice does not make two bills");

const shift = await cashier.call("/api/shifts", { body: { openingCash: 2000 } });
const s = await bill(cashier);
ok(s.invoiceNo, "drawer opened: bills work again");
e = await bill(owner, { branchId: b2._id }, 409);
ok(/cash drawer is not open/.test(e.error), "another branch with its drawer closed still cannot make bills");
await cashier.call(`/api/shifts/${shift._id}/close`, { body: { denominations: [{ value: 1000, count: 2 }, { value: 100, count: 2 }] } });
await bill(cashier, {}, 409);
ok(true, "drawer closed for the day: bills stop again");

section("Rule off again");
await owner.call("/api/settings", { method: "PUT", body: { ...base, requireOpenDrawer: false } });
await bill(cashier);
ok(true, "switched off: bills work without a drawer");
const act = (await owner.call("/api/activity")).rows;
ok(act.some((r) => r.action === "settings.update" && r.summary.includes("bills only with an open cash drawer")), "the change is in the activity log");

await done();
