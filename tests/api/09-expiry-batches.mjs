import { Client, ok, eq, section, db, oid, done } from "../lib/harness.mjs";

// ---------- Batch-wise expiry (FEFO) ----------
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + n * 864e5));
const admin = new Client("admin"), owner = new Client("owner"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Fresh Mart", shopType: "general", maxUsers: 4, maxBranches: 2, ownerName: "Hamza", username: "hamza", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 2, ownerName: "Zara", username: "zara", password: "secret1" } });
await owner.login("hamza", "secret1");
await other.login("zara", "secret1");
const batches = async (pid) =>
  (await (await db()).collection("stockbatches").find({ product: oid(pid) }).sort({ createdAt: 1 }).toArray()).map((b) => ({
    id: b._id.toString(),
    qty: b.qty,
    exp: b.expiryDate ? new Date(b.expiryDate.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10) : null,
    branch: b.branch.toString(),
    no: b.batchNo || null,
  }));
const level = async (p) => (await owner.call(`/api/products/${p._id}`)).product.stock;
const sumB = (list, branch) => Math.round(list.filter((b) => !branch || b.branch === branch).reduce((a, b) => a + b.qty, 0) * 1000) / 1000;

section("Lots arrive with their own expiry");
const milk = await owner.call("/api/products", { body: { name: "Olpers 1L", unit: "pcs", costPrice: 280, salePrice: 300, lowStockAlert: 5, trackExpiry: true, openingStock: 10, expiryDate: day(20) } });
ok(milk.trackExpiry === true, "expiry tracking on");
let b = await batches(milk._id);
ok(b.length === 1 && b[0].qty === 10 && b[0].exp === day(20), "opening stock is one lot expiring in 20 days");
const p2 = await owner.call("/api/purchases", { body: { items: [{ productId: milk._id, qty: 20, cost: 280, expiryDate: day(5), batchNo: "L-55" }] } });
const p3 = await owner.call("/api/purchases", { body: { items: [{ productId: milk._id, qty: 15, cost: 280, expiryDate: day(40) }] } });
await owner.call(`/api/products/${milk._id}/stock`, { body: { mode: "add", qty: 4, expiryDate: day(-2), batchNo: "OLD" } });
b = await batches(milk._id);
eq(b.length, 4, "4 lots");
eq(sumB(b), await level(milk), "lots add up to stock (49)");
ok(b.find((x) => x.no === "L-55")?.exp === day(5), "batch number and expiry kept");

section("Sales take the earliest expiry first (expired last)");
const sale = await owner.call("/api/sales", { body: { items: [{ productId: milk._id, qty: 25 }], paymentMethod: "cash" } });
eq(sale.items[0].batches.length, 2, "bill took from 2 lots");
ok(sale.items[0].batches[0].qty === 20 && sale.items[0].batches[1].qty === 5, "20 from the 5-day lot, then 5 from the 20-day lot");
b = await batches(milk._id);
ok(b.find((x) => x.no === "OLD").qty === 4, "expired lot not sold");
eq(sumB(b), await level(milk), "lots still add up to stock (24)");

section("Expiry report and write-off");
let rep = await owner.call("/api/expiry?within=7");
ok(rep.rows.length === 1 && rep.rows[0].daysLeft < 0 && rep.rows[0].qty === 4, "7-day view: only the expired lot (the 5-day lot is sold out)");
eq(rep.summary.expired.value, 4 * 280, "expired value at cost");
rep = await owner.call("/api/expiry?within=30");
ok(rep.rows.some((r) => r.qty === 5 && r.daysLeft >= 19), "30-day view adds the 20-day lot");
const dash = await owner.call("/api/dashboard");
ok(dash.expiringCount >= 1, "dashboard warns about expiring lots");
const expiredLot = rep.rows.find((r) => r.daysLeft < 0);
await other.call(`/api/expiry/${expiredLot._id}/write-off`, { body: {}, expect: 404 }).then(() => ok(true, "other shop cannot write off"));
await owner.call(`/api/expiry/${expiredLot._id}/write-off`, { body: {} });
eq(await level(milk), 20, "stock 24 - 4 written off");
b = await batches(milk._id);
eq(b.find((x) => x.no === "OLD").qty, 0, "expired lot empty");
await owner.call(`/api/expiry/${expiredLot._id}/write-off`, { body: {}, expect: 400 }).then(() => ok(true, "cannot write off an empty lot"));
const mv = (await owner.call(`/api/products/${milk._id}`)).movements[0];
ok(mv.type === "wastage" && mv.qty === -4, "written off as wastage in stock history");

section("Returns go back to their lots");
await owner.call(`/api/sales/${sale._id}/return`, { body: { items: [{ index: 0, qty: 10 }] } });
b = await batches(milk._id);
const lot5 = b.find((x) => x.no === "L-55"), lot20 = b.find((x) => x.exp === day(20));
ok(lot20.qty === 5 + 5 && lot5.qty === 5, "10 back: 5 to the 20-day lot (its full share), 5 to the 5-day lot");
await owner.call(`/api/sales/${sale._id}/return`, { body: {} });
b = await batches(milk._id);
ok(b.find((x) => x.no === "L-55").qty === 20 && b.find((x) => x.exp === day(20)).qty === 10, "all 25 back where they came from");
eq(sumB(b), await level(milk), "lots add up to stock (45)");

section("Supplier returns and cancelled purchases use their own lot");
await owner.call(`/api/purchases/${p3._id}/return`, { body: { items: [{ index: 0, qty: 5 }] } });
b = await batches(milk._id);
eq(b.find((x) => x.exp === day(40)).qty, 10, "returned from the 40-day lot (that purchase), not FEFO");
await owner.call(`/api/purchases/${p2._id}/void`, { body: {} });
b = await batches(milk._id);
eq(b.find((x) => x.no === "L-55").qty, 0, "cancelled purchase removed its own lot");
eq(sumB(b), await level(milk), "lots add up to stock (20)");

section("Transfers carry the lots");
const b2 = await owner.call("/api/branches", { body: { name: "Gulberg" } });
await owner.call("/api/transfers", { body: { toBranch: b2._id, items: [{ productId: milk._id, qty: 12 }] } });
b = await batches(milk._id);
const there = b.filter((x) => x.branch === b2._id);
ok(there.some((x) => x.exp === day(20) && x.qty === 10) && there.some((x) => x.exp === day(40) && x.qty === 2), "Gulberg got 10 of the 20-day lot and 2 of the 40-day lot");
const here = b.filter((x) => x.branch !== b2._id);
eq(sumB(here), 8, "8 left at main");

section("Turning tracking on later; shelf life");
const eggs = await owner.call("/api/products", { body: { name: "Eggs", unit: "dozen", costPrice: 300, salePrice: 360, lowStockAlert: 2, openingStock: 30 } });
eq((await batches(eggs._id)).length, 0, "untracked product has no lots");
await owner.call(`/api/products/${eggs._id}`, { method: "PUT", body: { name: "Eggs", unit: "dozen", costPrice: 300, salePrice: 360, lowStockAlert: 2, trackExpiry: true, expiryDate: day(10) } });
b = await batches(eggs._id);
ok(b.length === 1 && b[0].qty === 30 && b[0].exp === day(10), "existing 30 became one lot");
const bread = await owner.call("/api/products", { body: { name: "Bread", unit: "pcs", costPrice: 80, salePrice: 120, lowStockAlert: 5, trackExpiry: true, shelfLifeDays: 3 } });
await owner.call(`/api/products/${bread._id}/stock`, { body: { mode: "add", qty: 40 } });
b = await batches(bread._id);
eq(b[0].exp, day(3), "bread lot expires in 3 days (shelf life)");
const backup = await owner.call("/api/backup");
ok(backup.data.stockBatches.length >= 8, "lots are in the backup");
eq((await owner.raw("/expiry")).status, 200, "expiry page");

await done();
