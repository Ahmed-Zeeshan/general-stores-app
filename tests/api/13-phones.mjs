import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Mobile shop: phones tracked by IMEI ----------
/** A valid 15-digit IMEI (check digit) from a 14-digit start. */
const imei = (n) => {
  const body = String(35_000_000_000_000 + n).padStart(14, "0");
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
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 4, maxBranches: 2, ownerName: "Ali", username: "ali", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Corner Store", shopType: "general", maxUsers: 2, ownerName: "Zara", username: "zara", password: "secret1" } });
await owner.login("ali", "secret1");
await other.login("zara", "secret1");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");

section("Mobile shop type and features");
let me = await owner.call("/api/auth/me");
ok(me.settings.shopType === "mobile", "shop type is Mobile Phone Shop");
ok(me.settings.modules.phones && me.settings.modules.repairs && me.settings.modules.wallets && me.settings.modules.installments, "all phone-shop features on for a new mobile shop");
const cats = await owner.call("/api/categories");
ok(cats.some((c) => c.name === "Mobile Phones") && cats.some((c) => c.name === "Spare Parts"), "phone-shop categories created");
const otherMe = await other.call("/api/auth/me");
ok(!otherMe.settings.modules?.phones, "a general store starts without the phone features");
const settings = await other.call("/api/settings");
await other.call("/api/settings", { method: "PUT", body: { ...settings, modules: { wallets: true } } });
otherMe.settings = (await other.call("/api/auth/me")).settings;
ok(otherMe.settings.modules.wallets && !otherMe.settings.modules.phones, "a karyana/general store can switch on just Easyload & wallets");
await other.call("/api/settings", { method: "PUT", body: { ...settings, modules: { repairs: true } } });
ok((await other.call("/api/auth/me")).settings.modules.wallets, "switching one feature keeps the others");

section("Phone models tracked by IMEI");
const phoneCat = cats.find((c) => c.name === "Mobile Phones")._id;
const base = { unit: "pcs", costPrice: 40000, salePrice: 45000, lowStockAlert: 1, category: phoneCat, trackSerial: true, warrantyMonths: 12 };
await owner.call("/api/products", { body: { ...base, name: "Bad", openingStock: 3 }, expect: 400 }).then((e) => ok(/start with no stock/.test(e.error), "opening stock by quantity refused"));
await owner.call("/api/products", { body: { ...base, name: "Bad", unit: "kg" }, expect: 400 }).then((e) => ok(/unit Piece/.test(e.error), "IMEI phones must be pieces"));
await owner.call("/api/products", { body: { ...base, name: "Bad", packs: [{ name: "Box", size: 10 }] }, expect: 400 }).then((e) => ok(/pack sizes/.test(e.error), "no pack sizes"));
const a15 = await owner.call("/api/products", { body: { ...base, name: "Samsung Galaxy A15 128GB" } });
ok(a15.trackSerial && a15.warrantyMonths === 12 && a15.stock === 0, "model saved with IMEI tracking and 12-month warranty");
const cover = await owner.call("/api/products", { body: { name: "A15 Back Cover", unit: "pcs", costPrice: 150, salePrice: 350, lowStockAlert: 5, openingStock: 20 } });

section("Adding phones with IMEI");
const I = Array.from({ length: 12 }, (_, i) => imei(i * 7 + 1));
await owner.call(`/api/products/${a15._id}/stock`, { body: { mode: "add", qty: 2 }, expect: 400 }).then((e) => ok(/tracked by IMEI/.test(e.error), "plain stock add refused for IMEI phones"));
await cashier.call("/api/devices", { body: { productId: a15._id, cost: 40000, units: [{ imei: I[0] }] }, expect: 403 }).then(() => ok(true, "cashier cannot add stock"));
const added = await owner.call("/api/devices", {
  body: {
    productId: a15._id,
    cost: 40000,
    units: [
      { imei: I[0], imei2: I[1], color: "Black", storage: "6/128GB", pta: "approved" },
      { imei: `${I[2].slice(0, 5)} ${I[2].slice(5)}`, color: "Blue", storage: "6/128GB", pta: "approved" },
      { imei: I[3], color: "Black", storage: "6/128GB", pta: "non_pta", price: 41000 },
    ],
  },
});
eq(added.length, 3, "3 phones added");
ok(added[1].imei === I[2], "spaces in a scanned IMEI are removed");
let prod = (await owner.call(`/api/products/${a15._id}`)).product;
eq(prod.stock, 3, "stock = phones in stock (3)");
await owner.call("/api/devices", { body: { productId: a15._id, cost: 40000, units: [{ imei: I[0] }] }, expect: 409 }).then((e) => ok(/already in stock/.test(e.error), "same IMEI cannot be in stock twice"));
await owner.call("/api/devices", { body: { productId: a15._id, cost: 40000, units: [{ imei: I[1] }] }, expect: 409 }).then(() => ok(true, "second IMEI of a phone also counts"));
await owner.call("/api/devices", { body: { productId: a15._id, cost: 40000, units: [{ imei: I[5] }, { imei: I[5] }] }, expect: 400 }).then((e) => ok(/twice/.test(e.error), "IMEI typed twice in one entry refused"));
await owner.call("/api/devices", { body: { productId: cover._id, cost: 1, units: [{ imei: I[6] }] }, expect: 400 }).then((e) => ok(/not tracked by IMEI/.test(e.error), "a cover cannot get IMEIs"));
await owner.call("/api/devices", { body: { productId: a15._id, cost: 1, units: [{ imei: "12" }] }, expect: 400 }).then((e) => ok(/not a valid/.test(e.error), "too-short serial refused"));
eq((await owner.call(`/api/devices/lookup?imei=${I[0]}`)).checkOk, true, "valid IMEI passes the check digit");
eq((await owner.call(`/api/devices/lookup?imei=${I[0].slice(0, 14)}9`)).checkOk, I[0].endsWith("9"), "wrong check digit is flagged");
const list = await cashier.call(`/api/devices?product=${a15._id}`);
eq(list.length, 3, "cashier sees the 3 in-stock phones to sell");
eq((await other.call(`/api/devices?status=all`)).length, 0, "another shop sees none of them");

section("Selling by IMEI");
const [d1, d2, d3] = added;
await cashier.call("/api/sales", { body: { items: [{ productId: a15._id, qty: 1 }], paymentMethod: "cash" }, expect: 400 }).then((e) => ok(/Choose which/.test(e.error), "selling without choosing the phone refused"));
await cashier.call("/api/sales", { body: { items: [{ productId: a15._id, qty: 2, serials: [d1._id] }], paymentMethod: "cash" }, expect: 400 }).then((e) => ok(/must match/.test(e.error), "quantity must match the phones chosen"));
await cashier.call("/api/sales", { body: { items: [{ productId: cover._id, qty: 1, serials: [d1._id] }], paymentMethod: "cash" }, expect: 400 }).then(() => ok(true, "IMEI on a non-phone item refused"));
const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Usman Ghani", phone: "03001234567" } });
const sale1 = await cashier.call("/api/sales", {
  body: { items: [{ productId: a15._id, qty: 1, serials: [d1._id] }, { productId: cover._id, qty: 1 }], paymentMethod: "cash", customerId: cust._id },
});
const line = sale1.items[0];
ok(line.serials.length === 1 && line.serials[0].imei === I[0] && line.serials[0].imei2 === I[1], "bill keeps the IMEIs of the phone sold");
eq(line.price, 45000, "sold at the model's price");
eq(line.cost, 40000, "cost is the real cost of that phone");
ok(line.warrantyMonths === 12 && new Date(line.warrantyUntil) > new Date(Date.now() + 360 * 864e5), "12-month warranty with end date on the bill");
let dev = await owner.call(`/api/devices/${d1._id}`);
ok(dev.status === "sold" && dev.sale.invoiceNo === sale1.invoiceNo && dev.sale.customerName === "Usman Ghani" && dev.sale.price === 45000, "phone marked sold with bill, customer and price");
ok(dev.history.map((h) => h.action).join(",") === "Added to stock,Sold", "phone history: added, sold");
eq((await owner.call(`/api/products/${a15._id}`)).product.stock, 2, "stock 3 → 2");
await cashier.call("/api/sales", { body: { items: [{ productId: a15._id, qty: 1, serials: [d1._id] }], paymentMethod: "cash" }, expect: 400 }).then((e) => ok(/not in stock/.test(e.error) && e.error.includes(sale1.invoiceNo), "the same phone cannot be sold twice: " + e.error));
// Used / special-price phone: its own price is used.
const sale2 = await cashier.call("/api/sales", { body: { items: [{ productId: a15._id, qty: 1, serials: [d3._id] }], paymentMethod: "cash" } });
eq(sale2.items[0].price, 41000, "phone with its own asking price sells at that price");
await cashier.call("/api/sales", { body: { items: [{ productId: a15._id, qty: 1, serials: [d2._id], price: 30000 }], paymentMethod: "cash" } }).then((s) => {
  eq(s.items[0].price, 45000, "cashier cannot change the price");
  return owner.call(`/api/sales/${s._id}/return`, { body: {} });
});
ok((await owner.call(`/api/devices/${d2._id}`)).status === "in_stock", "full return of that bill puts the phone back in stock");

section("Two counters selling the same phone at the same moment");
const race = await Promise.all([
  cashier.raw("/api/sales", { body: { items: [{ productId: a15._id, qty: 1, serials: [d2._id] }], paymentMethod: "cash" } }),
  owner.raw("/api/sales", { body: { items: [{ productId: a15._id, qty: 1, serials: [d2._id] }], paymentMethod: "cash" } }),
]);
const statuses = race.map((r) => r.status).sort();
ok(statuses[0] === 200 && statuses[1] >= 400, `one sale wins, the other is refused (${statuses.join(", ")})`);
eq((await owner.call(`/api/products/${a15._id}`)).product.stock, 0, "stock correct after the race (0)");
eq((await owner.call(`/api/devices?status=sold&product=${a15._id}`)).length, 3, "3 phones sold, none twice");

section("Customer returns a phone");
await owner.call(`/api/sales/${sale1._id}/return`, { body: { items: [{ index: 0, qty: 1 }] }, expect: 400 }).then((e) => ok(/Choose which/.test(e.error), "return must say which phone"));
await owner.call(`/api/sales/${sale1._id}/return`, { body: { items: [{ index: 0, qty: 1, serials: [d3._id] }] }, expect: 400 }).then((e) => ok(/not sold on this bill/.test(e.error), "a phone from another bill cannot be returned on this one"));
const r1 = (await owner.call(`/api/sales/${sale1._id}/return`, { body: { items: [{ index: 0, qty: 1, serials: [d1._id] }], reason: "Customer changed mind" } })).return;
ok(r1.items[0].serials[0].imei === I[0] && r1.total === 45000, "return slip names the IMEI; Rs 45,000 back");
dev = await owner.call(`/api/devices/${d1._id}`);
ok(dev.status === "in_stock" && !dev.sale, "phone is back in stock");
eq(dev.history.at(-1).action, "Returned by customer", "history: returned by customer");
await owner.call(`/api/sales/${sale1._id}/return`, { body: { items: [{ index: 0, qty: 1, serials: [d1._id] }] }, expect: 400 }).then((e) => ok(/already returned/.test(e.error), "same phone cannot be returned twice"));
const s1 = await owner.call(`/api/sales/${sale1._id}`);
ok(s1.items[0].serials[0].returned === true && s1.status === "partially_returned", "bill shows the phone returned (cover still sold)");
eq((await owner.call(`/api/products/${a15._id}`)).product.stock, 1, "stock 0 → 1");

section("Buying phones from a supplier");
const sup = await owner.call("/api/parties", { body: { type: "supplier", name: "Hall Road Distributors" } });
await owner.call("/api/purchases", { body: { supplierId: sup._id, items: [{ productId: a15._id, qty: 2, cost: 39500 }] }, expect: 400 }).then((e) => ok(/IMEI of every/.test(e.error), "purchase without IMEIs refused"));
await owner.call("/api/purchases", { body: { supplierId: sup._id, items: [{ productId: a15._id, qty: 2, cost: 39500, units: [{ imei: I[6] }] }] }, expect: 400 }).then((e) => ok(/quantity is 2 but 1/.test(e.error), "IMEI count must match quantity"));
await owner.call("/api/purchases", { body: { supplierId: sup._id, items: [{ productId: a15._id, qty: 1, cost: 39500, units: [{ imei: I[0] }] }] }, expect: 409 }).then(() => ok(true, "IMEI already in stock refused (nothing saved)"));
const pur = await owner.call("/api/purchases", {
  body: { supplierId: sup._id, amountPaid: 0, items: [{ productId: a15._id, qty: 3, cost: 39500, units: [{ imei: I[6], color: "Black" }, { imei: I[7], color: "Green" }, { imei: I[8], color: "Black" }] }, { productId: cover._id, qty: 10, cost: 140 }] },
});
ok(pur.items[0].serials?.length === 3 || (await owner.call(`/api/purchases/${pur._id}`)).items[0].serials.length === 3, "purchase keeps the 3 IMEIs");
eq((await owner.call(`/api/products/${a15._id}`)).product.stock, 4, "stock 1 → 4");
const fromSup = await owner.call(`/api/devices?q=${I[7]}`);
ok(fromSup.length === 1 && fromSup[0].source.refNo === pur.purchaseNo && fromSup[0].source.name === "Hall Road Distributors" && fromSup[0].cost === 39500, "phone knows its purchase, supplier and cost");
eq((await owner.call(`/api/parties/${sup._id}`)).party.balance, 3 * 39500 + 1400, "supplier khata Rs 119,900");

section("Returning a phone to the supplier");
const p1 = await owner.call(`/api/purchases/${pur._id}`);
const devOf = (im) => p1.items[0].serials.find((x) => x.imei === im).device;
await owner.call(`/api/purchases/${pur._id}/return`, { body: { items: [{ index: 0, qty: 1 }] }, expect: 400 }).then((e) => ok(/Choose which/.test(e.error), "supplier return must say which phone"));
await owner.call(`/api/purchases/${pur._id}/return`, { body: { items: [{ index: 0, qty: 1, serials: [d1._id] }] }, expect: 400 }).then((e) => ok(/not on this purchase/.test(e.error), "a phone from elsewhere cannot go back on this purchase"));
const prn = await owner.call(`/api/purchases/${pur._id}/return`, { body: { items: [{ index: 0, qty: 1, serials: [devOf(I[7])] }], reason: "Dead on arrival" } });
ok(prn.total === 39500 && prn.items[0].serials[0].imei === I[7], "supplier return of 1 phone, Rs 39,500 off the khata");
ok((await owner.call(`/api/devices/${devOf(I[7])}`)).status === "returned", "phone marked returned to supplier");
eq((await owner.call(`/api/products/${a15._id}`)).product.stock, 3, "stock 4 → 3");
// Sell one phone of this purchase, then the purchase cannot be cancelled.
await cashier.call("/api/sales", { body: { items: [{ productId: a15._id, qty: 1, serials: [devOf(I[8])] }], paymentMethod: "cash" } });
await owner.call(`/api/purchases/${pur._id}/void`, { body: { reason: "test" }, expect: 400 }).then((e) => ok(/already returned|not in stock/i.test(e.error), "purchase with a returned/sold phone cannot be cancelled"));
const pur2 = await owner.call("/api/purchases", { body: { items: [{ productId: a15._id, qty: 2, cost: 39000, units: [{ imei: I[9] }, { imei: I[10] }] }] } });
const v = await owner.call(`/api/purchases/${pur2._id}/void`, { body: { reason: "Entered twice" } });
ok(v.status === "void", "purchase cancelled");
ok((await owner.call(`/api/devices?status=removed`)).filter((x) => [I[9], I[10]].includes(x.imei)).length === 2, "its phones are removed from stock");
eq((await owner.call(`/api/products/${a15._id}`)).product.stock, 2, "stock back to 2");

section("Moving phones to another branch");
const b2 = await owner.call("/api/branches", { body: { name: "Mall Branch" } });
const here = await owner.call(`/api/devices?product=${a15._id}`);
await owner.call("/api/transfers", { body: { toBranch: b2._id, items: [{ productId: a15._id, qty: 1 }] }, expect: 400 }).then((e) => ok(/Choose which/.test(e.error), "transfer must say which phones"));
const trf = await owner.call("/api/transfers", { body: { toBranch: b2._id, items: [{ productId: a15._id, qty: 1, serials: [here[0]._id] }] } });
ok(trf.transferNo, "transfer saved");
dev = await owner.call(`/api/devices/${here[0]._id}`);
ok(dev.branch === b2._id && dev.status === "in_stock" && dev.history.at(-1).action === "Moved to Mall Branch", "phone is now at Mall Branch");
const byBranch = (await owner.call(`/api/products/${a15._id}`)).byBranch;
ok(byBranch.find((b) => b.name === "Mall Branch").qty === 1 && byBranch.find((b) => b.name !== "Mall Branch").qty === 1, "branch stock 1 + 1");
await cashier.call("/api/sales", { body: { items: [{ productId: a15._id, qty: 1, serials: [here[0]._id] }], paymentMethod: "cash" }, expect: 400 }).then((e) => ok(/another branch/.test(e.error), "a phone at another branch cannot be sold here"));

section("Correcting and removing phones");
const left = (await owner.call(`/api/devices?product=${a15._id}`))[0];
await owner.call(`/api/devices/${left._id}`, { method: "PATCH", body: { imei: I[11], color: "Gold", price: 44000 } });
dev = await owner.call(`/api/devices/${left._id}`);
ok(dev.imei === I[11] && dev.color === "Gold" && dev.price === 44000 && dev.history.at(-1).action === "Details changed", "IMEI, colour and price corrected (history kept)");
await owner.call(`/api/devices/${d3._id}`, { method: "PATCH", body: { imei: I[5] }, expect: 400 }).then((e) => ok(/sold or returned/.test(e.error), "IMEI of a sold phone cannot be changed"));
await owner.call(`/api/devices/${left._id}/remove`, { body: { reason: "x" }, expect: 400 }).then(() => ok(true, "removing needs a reason"));
await owner.call(`/api/devices/${left._id}/remove`, { body: { reason: "Screen broken in shop" } });
ok((await owner.call(`/api/devices/${left._id}`)).status === "removed", "phone removed from stock");
prod = (await owner.call(`/api/products/${a15._id}`)).product;
ok(prod.stock === 0 && prod.totalStock === 1, "stock here 1 → 0; shop total 1 (the Mall Branch phone)");

section("IMEI history, switches, backup and activity");
const look = await owner.call(`/api/devices/lookup?imei=${I[2]}`);
ok(look.records.length === 1 && look.records[0].history.map((h) => h.action).join(",") === "Added to stock,Sold,Returned by customer,Sold", "IMEI lookup shows the full story: added, sold, returned, sold again");
const look2 = await owner.call(`/api/devices/lookup?imei=${I[1]}`);
ok(look2.records.length === 1 && String(look2.records[0]._id) === String(d1._id), "lookup also finds a phone by its second IMEI");
await owner.call(`/api/products/${a15._id}`, { method: "PUT", body: { ...base, name: a15.name, trackSerial: false } , expect: 400 }).then((e) => ok(/still has phones in stock/.test(e.error), "IMEI tracking cannot be switched off while phones are in stock"));
await owner.call(`/api/products/${cover._id}`, { method: "PUT", body: { name: cover.name, unit: "pcs", costPrice: 150, salePrice: 350, lowStockAlert: 5, trackSerial: true }, expect: 400 }).then((e) => ok(/without IMEIs/.test(e.error), "IMEI tracking cannot be switched on while there is plain stock"));
const backup = await owner.call("/api/backup");
const allDevices = await owner.call("/api/devices?status=all&branch=all");
ok(allDevices.length === 8 && backup.data.devices.length === 8 && backup.data.devices.every((d) => d.history?.length), "backup has all 8 phone records with their history");
const acts = await owner.call("/api/activity");
const rows = acts.rows ?? acts;
ok(["device.add", "device.update", "device.remove"].every((a) => rows.some((r) => r.action === a)), "activity log records phones added, changed, removed");
section("Accessories: brand and phone models they fit");
const glass = await owner.call("/api/products", { body: { name: "Tempered Glass 9D", brand: "Remax", fits: "Samsung A54, A55 · Galaxy S23 FE", unit: "pcs", costPrice: 80, salePrice: 300, lowStockAlert: 5, openingStock: 30 } });
ok(glass.brand === "Remax" && glass.fits.includes("A55"), "brand and fits saved");
const find = async (q) => (await cashier.call(`/api/products?q=${encodeURIComponent(q)}`)).map((p) => p.name);
ok((await find("a55")).includes("Tempered Glass 9D"), "searching the phone model finds the accessory");
ok((await find("glass a54")).includes("Tempered Glass 9D") && !(await find("glass a15")).length, "every word must match (glass + A54 yes, glass + A15 no)");
ok((await find("remax")).includes("Tempered Glass 9D"), "search by brand");
await owner.call(`/api/products/${glass._id}`, { method: "PUT", body: { name: "Tempered Glass 9D", brand: "", fits: "", unit: "pcs", costPrice: 80, salePrice: 300, lowStockAlert: 5 } });
const g2 = (await owner.call(`/api/products?q=Tempered`))[0];
ok(!g2.brand && !g2.fits, "brand and fits can be cleared");
await done();
