import { B, Client, ok, eq, section, done } from "../lib/harness.mjs";
import { gunzipSync } from "zlib";

// ---------- Production: cookies, automatic backups ----------
const admin = new Client("admin"), owner = new Client("owner");
section("Login cookie over http on the shop network");
let res = await admin.raw("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
let sc = res.headers.getSetCookie().join(";");
ok(sc.includes("dukaan_session=") && !/;\s*secure/i.test(sc), "http: session cookie without Secure (works on http://192.168.x.x)");
const https = await fetch(B + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-proto": "https" }, body: JSON.stringify({ username: "admin", password: "admin-pass-123" }) });
ok(/;\s*secure/i.test(https.headers.getSetCookie().join(";")), "https: session cookie is Secure");
await admin.call("/api/admin/tenants", { body: { shopName: "Backup Mart", shopType: "general", maxUsers: 3, ownerName: "Hamza", username: "hamza", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Second Shop", shopType: "bakery", maxUsers: 3, ownerName: "Zara", username: "zara", password: "secret1" } });
await owner.login("hamza", "secret1");
const p = await owner.call("/api/products", { body: { name: "Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 1, openingStock: 10 } });
await owner.call("/api/sales", { body: { items: [{ productId: p._id, qty: 2 }], paymentMethod: "cash" } });

section("Automatic backups");
await owner.call("/api/admin/backups", { expect: 403 }).then(() => ok(true, "shop owner cannot see server backups"));
const run = await admin.call("/api/admin/backups", { method: "POST" });
ok(run.lastOk && run.shops === 2, "backed up both shops");
const info = await admin.call("/api/admin/backups");
ok(info.enabled === (process.env.AUTO_BACKUP !== "off") && info.keep === 30 && info.status.lastOk, "status shows last run (scheduler off in tests)");
const mine = info.shops.find((s) => s.shopName === "Backup Mart");
ok(mine && mine.files.length >= 1, "copy listed for the shop");
const dl = await admin.raw(`/api/admin/backups/file?folder=${encodeURIComponent(mine.folder)}&name=${encodeURIComponent(mine.files[0].name)}`);
eq(dl.status, 200, "download works");
const json = JSON.parse(gunzipSync(Buffer.from(await dl.arrayBuffer())).toString());
ok(json.format === "dukaan-manager-backup" && json.data.sales.length === 1 && json.shop.shopName === "Backup Mart", "gzip file holds a full shop backup");
eq((await admin.raw(`/api/admin/backups/file?folder=..&name=../../package.json`)).status, 400, "path tricks refused");
eq((await owner.raw(`/api/admin/backups/file?folder=${encodeURIComponent(mine.folder)}&name=${encodeURIComponent(mine.files[0].name)}`)).status, 403, "owner cannot download server backups");
await owner.call("/api/products", { body: { name: "After backup", unit: "pcs", costPrice: 1, salePrice: 2, lowStockAlert: 1 } });
await owner.call("/api/restore", { body: { backup: json, confirm: "Backup Mart" } });
ok(!(await owner.call("/api/products")).some((x) => x.name === "After backup"), "automatic backup restores");
for (let i = 0; i < 2; i++) await admin.call("/api/admin/backups", { method: "POST" });
const again = await admin.call("/api/admin/backups");
ok(again.shops.find((s) => s.shopName === "Backup Mart").files.length >= 1, "more copies kept (rotation keeps newest 30)");

await done();
