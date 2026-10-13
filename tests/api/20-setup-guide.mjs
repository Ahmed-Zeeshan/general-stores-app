import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- New shop: setup guide and ready-made items ----------
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Madina Karyana", shopType: "karyana", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret1" } });
await owner.login("bilal", "secret1");

section("Setup guide");
let st = await owner.call("/api/setup-status");
ok(!st.dismissed && Object.values(st.done).every((v) => !v), "new shop: nothing done yet");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
await cashier.call("/api/setup-status", { expect: 403 }).then(() => ok(true, "only the owner sees the setup guide"));

section("Ready-made items");
const list = await owner.call("/api/starter-items");
ok(list.length > 30 && list.some((i) => i.name === "Chakki Atta" && i.unit === "kg" && i.category === "Atta & Flour" && i.nameUrdu), "karyana list: Chakki Atta by kg, with Urdu name and category");
ok(list.every((i) => i.salePrice === undefined), "the list has no prices (the shop types its own)");
await owner.call("/api/starter-items", { body: { items: [{ name: "Sugar", unit: "kg", category: "Sugar & Salt", salePrice: 0 }] }, expect: 400 }).then(() => ok(true, "an item needs a sale price"));
await cashier.call("/api/starter-items", { body: { items: [{ name: "Sugar", unit: "kg", salePrice: 160 }] }, expect: 403 }).then(() => ok(true, "cashier cannot add items"));
const pick = (n) => list.find((i) => i.name === n);
let r = await owner.call("/api/starter-items", {
  body: {
    items: [
      { ...pick("Chakki Atta"), salePrice: 120, costPrice: 105, openingStock: 50 },
      { ...pick("Sugar"), salePrice: 160 },
      { ...pick("Tea Pack 475g"), salePrice: 1150, costPrice: 1080, openingStock: 12 },
      { ...pick("Matchbox"), salePrice: 10 },
      { ...pick("Eggs"), salePrice: 330 },
      { name: "Desi Ghee", unit: "kg", category: "Dairy & Ghee", salePrice: 2800 },
    ],
  },
});
eq(r.created, 6, "6 items added");
const products = await owner.call("/api/products");
const atta = products.find((p) => p.name === "Chakki Atta");
ok(atta && atta.salePrice === 120 && atta.costPrice === 105 && atta.stock === 50 && atta.category?.name === "Atta & Flour" && atta.nameUrdu === "چکی آٹا", "Chakki Atta: Rs 120/kg, cost 105, 50 kg in stock, category and Urdu name");
ok(products.find((p) => p.name === "Desi Ghee")?.category?.name === "Dairy & Ghee", "a new category is created when needed");
r = await owner.call("/api/starter-items", { body: { items: [{ ...pick("Sugar"), salePrice: 170 }, { ...pick("Maida"), salePrice: 110 }] } });
ok(r.created === 1 && r.skipped[0] === "Sugar", "items already added are skipped, not duplicated");
ok((await owner.call("/api/starter-items")).find((i) => i.name === "Sugar").exists, "the list marks what the shop already has");
const acts = (await owner.call("/api/activity")).rows.map((a) => a.summary);
ok(acts.some((s) => /ready-made items added/.test(s)), "activity log notes the ready-made items");

section("Progress and hiding");
await owner.call("/api/settings", { method: "PUT", body: { shopName: "Madina Karyana", shopType: "karyana", taxEnabled: false, taxRate: 0, pricesIncludeTax: true, phone: "0300-1234567", address: "Main Bazar, Sialkot" } });
await owner.call("/api/parties", { body: { type: "customer", name: "Usman", phone: "03001112223" } });
st = await owner.call("/api/setup-status");
ok(st.done.shop && st.done.products && st.done.customers && st.done.staff && !st.done.drawer && !st.done.bill, "done: shop details, items, customer, staff; still to do: drawer, first bill");
await owner.call("/api/setup-status", { method: "POST" });
ok((await owner.call("/api/setup-status")).dismissed, "owner can hide the guide");
await done();
