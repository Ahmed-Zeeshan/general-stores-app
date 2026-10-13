import { B, norm } from "../lib/harness.mjs";
// Browser test: product photos, Favourites first on the sale screen, and big buttons for touch screens.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const page = await ctx.newPage();
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const post = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => { const r = await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; }, [path, body, method]);
const get = (path) => page.evaluate(async (p) => (await fetch(p)).json(), path);
const status = (path) => page.evaluate(async (p) => (await fetch(p)).status, path);
const dlg = page.locator("[role=dialog]");

await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "Bismillah Store", shopType: "general", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret1" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "bilal");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");

const cola = await post("/api/products", { name: "Cola 1.5L", unit: "pcs", costPrice: 150, salePrice: 180, lowStockAlert: 0, openingStock: 24, image: `data:image/png;base64,${PNG}` });
await post("/api/products", { name: "Bread Large", unit: "pcs", costPrice: 130, salePrice: 150, lowStockAlert: 0, openingStock: 10 });
await post("/api/products", { name: "Aaloo Chips", unit: "pcs", costPrice: 40, salePrice: 50, lowStockAlert: 0, openingStock: 30 });
ok(cola.hasImage === true && cola.image === undefined, "photo saved, not sent back with the product");
ok((await status(`/api/products/${cola._id}/image`)) === 200, "photo served on its own address");
ok((await post("/api/products", { name: "Bad", unit: "pcs", costPrice: 1, salePrice: 2, lowStockAlert: 0, image: "data:text/html;base64,PGgxPg==" })).status === 400, "only photos are accepted");

// ---- Products: star an item, add a photo through the form
await page.goto(B + "/products");
await page.waitForSelector("text=Bread Large");
await page.click("button[aria-label='Star Bread Large']");
await page.waitForSelector("button[aria-label='Unstar Bread Large']");
ok((await get("/api/products")).find((p) => p.name === "Bread Large").favourite === true, "Bread Large starred");
await page.locator("tr:has-text('Aaloo Chips') button[aria-label='Edit']").click();
await dlg.waitFor();
await dlg.locator('input[aria-label="Product photo"]').setInputFiles({ name: "chips.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
await dlg.locator('img[alt="Product photo"]').waitFor();
await dlg.locator("button:has-text('Save changes')").click();
await page.waitForSelector("text=Product updated");
ok((await get("/api/products")).find((p) => p.name === "Aaloo Chips").hasImage, "photo added from the product form");

// ---- Sale screen
await page.goto(B + "/pos");
await page.waitForSelector("main >> text=Cola 1.5L");
const names = await page.locator("main .grid > button").allInnerTexts();
ok(norm(names[0]).includes("Bread Large"), "starred item comes first");
ok((await page.locator("button:has-text('Favourites')").count()) === 1, "Favourites chip shown");
await page.click("button:has-text('Favourites')");
await page.waitForFunction(() => document.querySelectorAll("main .grid > button").length === 1);
ok(true, "Favourites shows only the starred items");
await page.click("button:has-text('Favourites')");
const loaded = await page.locator("main .grid > button:has-text('Cola 1.5L') img").evaluate((img) => new Promise((r) => (img.complete ? r(img.naturalWidth) : img.addEventListener("load", () => r(img.naturalWidth)))));
ok(loaded > 0, "product photo shows on the tile");
const before = await page.locator("main .grid > button").first().boundingBox();
await page.click("button:has-text('Big buttons')");
await page.waitForTimeout(300);
const after = await page.locator("main .grid > button").first().boundingBox();
ok(after.width > before.width && after.height > before.height, "big buttons: bigger tiles");
await page.reload();
await page.waitForSelector("main >> text=Cola 1.5L");
ok((await page.locator("button:has-text('Big buttons')").getAttribute("aria-pressed")) === "true", "big buttons remembered on this computer");
await page.screenshot({ path: `${out}/pos-big.png` });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
