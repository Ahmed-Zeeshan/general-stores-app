import { chromium } from "playwright";
import { B, norm } from "../lib/harness.mjs";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
let native = 0; page.on("dialog", (d) => { native++; d.dismiss(); });
const post = (path, body) => page.evaluate(async ([p, b]) => (await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body]);
const login = async () => {
  await page.goto(B + "/login");
  await page.fill('input[autocomplete="username"]', "sana");
  await page.fill('input[type="password"]', "secret1");
  await page.click('button[type="submit"]');
  await page.waitForURL(B + "/");
};
await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "UI Mart", shopType: "general", maxUsers: 3, ownerName: "Sana", username: "sana", password: "secret1" });
await post("/api/auth/logout", {});
await login();
await post("/api/products", { name: "Ghee 1kg", unit: "pcs", costPrice: 600, salePrice: 800, lowStockAlert: 1, openingStock: 50 });
await post("/api/products", { name: "Lux Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 1, openingStock: 50 });
await post("/api/products", { name: "Tea 950g", unit: "pcs", costPrice: 1500, salePrice: 1650, lowStockAlert: 1, openingStock: 50 });

await page.goto(B + "/pos");
await page.click("button:has-text('Ghee 1kg')");
await page.click("button:has-text('Lux Soap')");
await page.click("button:has-text('Lux Soap')");
await page.click("aside:has-text('Bill items') button:has-text('Hold')");
await page.waitForSelector("text=Bill on hold");
ok((await page.locator("aside:has-text('Bill items') li").count()) === 0, "cart cleared after hold");
ok(await page.locator("button:has-text('Held bills')").isVisible(), "Held bills button appears");
// serve the next customer
await page.click("button:has-text('Tea 950g')");
await page.click("text=Take Payment");
await page.click("[role=dialog] button:has-text('Confirm & Save Bill')");
await page.waitForSelector("text=Bill saved");
await page.click("[role=dialog] button:has-text('Next bill'), [role=dialog] button:has-text('New bill')").catch(() => page.keyboard.press("Escape"));
await page.keyboard.press("Escape");
// open the held one with F6
await page.keyboard.press("F6");
await page.waitForSelector("text=Bills on hold");
const lt = await page.locator("[role=dialog]").innerText().then(norm);
ok(lt.includes("Rs 1,000") && lt.includes("2 items") && lt.includes("Ghee 1kg, Lux Soap"), "held list shows items and total");
await page.screenshot({ path: `${out}/held-list.png` });
await page.click("[role=dialog] button:has-text('Open')");
await page.waitForTimeout(300);
ok((await page.locator("aside:has-text('Bill items') li").count()) === 2, "held bill back in the cart");
ok((await page.locator("aside:has-text('Bill items')").innerText().then(norm)).includes("Rs 1,000"), "total restored");
ok(!(await page.locator("button:has-text('Held bills')").count()), "held list empty after opening");
// F4 holds, and opening another while a bill is on screen asks first
await page.keyboard.press("F4");
await page.waitForSelector("text=Bill on hold");
await page.click("button:has-text('Tea 950g')");
await page.click("button:has-text('Held bills')");
await page.click("[role=dialog] button:has-text('Open')");
await page.waitForSelector("[role=alertdialog]");
ok((await page.locator("[role=alertdialog]").innerText().then(norm)).includes("Put the current bill on hold?"), "asks before replacing the bill on screen");
await page.click("[role=alertdialog] button:has-text('Hold & open')");
await page.waitForTimeout(400);
ok((await page.locator("aside:has-text('Bill items') li").count()) === 2, "opened held bill (2 items)");
ok((await page.locator("button:has-text('Held bills')").innerText().then(norm)).includes("1"), "the Tea bill is now on hold");
// survives reload and logout
await page.reload();
await page.waitForSelector("button:has-text('Held bills')");
ok(true, "held bills survive a page reload");
await post("/api/auth/logout", {});
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("dukaan:") && !k.endsWith(":outbox") && !k.endsWith(":held")) localStorage.removeItem(k); });
await login();
await page.goto(B + "/pos");
await page.waitForSelector("button:has-text('Held bills')");
ok(true, "held bills kept after logging in again");
// delete
await page.click("button:has-text('Held bills')");
await page.click("[role=dialog] button[aria-label^='Delete held bill']");
await page.waitForSelector("[role=alertdialog]");
await page.click("[role=alertdialog] button:has-text('Delete')");
await page.waitForTimeout(400);
ok((await page.locator("[role=dialog]").innerText().then(norm)).includes("No bills on hold"), "held bill deleted");
await page.keyboard.press("Escape");
// stock untouched by holding
const prods = await page.evaluate(async () => (await (await fetch("/api/products")).json()).map((p) => [p.name, p.stock]));
ok(JSON.stringify(prods).includes('["Lux Soap",50]') && JSON.stringify(prods).includes('["Ghee 1kg",50]'), "holding does not take stock out");
ok(native === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
