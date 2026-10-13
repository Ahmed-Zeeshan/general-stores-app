import { B, norm } from "../lib/harness.mjs";
// Browser test: giving staff a PIN and switching user on the counter; the reorder list with a
// WhatsApp order to the supplier.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const waLinks = [];
// WhatsApp opens in its own window; wait for it rather than a fixed time.
const waSeen = async (pred) => { for (let i = 0; i < 60; i++) { if (waLinks.some(pred)) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
await ctx.route(/wa\.me|web\.whatsapp\.com|whatsapp:/, (route) => { waLinks.push(decodeURIComponent(route.request().url())); route.fulfill({ status: 200, body: "wa" }); });
const page = await ctx.newPage();
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const post = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body, method]);
const dlg = page.locator("[role=dialog]");

await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "Madina Karyana", shopType: "karyana", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret1" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "bilal");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
await post("/api/users", { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" });

// ---- Owner gives Kashif a PIN and a discount limit
await page.goto(B + "/settings");
await page.locator("tr:has-text('kashif') button").first().click();
await dlg.waitFor();
await dlg.locator('input[aria-label="PIN"]').fill("2468");
await dlg.locator('input[aria-label="Discount limit"]').fill("5");
await dlg.locator("button:has-text('Save')").last().click();
await page.waitForSelector("text=discount up to 5%");
ok((await page.locator("tr:has-text('kashif')").innerText().then(norm)).includes("PIN"), "staff list shows the PIN and the limit");

// ---- Switch user on the counter
await page.goto(B + "/pos");
await page.locator("aside button:has-text('Switch user')").click();
await dlg.locator("button[aria-label='Switch to Kashif']").click();
for (const d of "2460") await dlg.locator(`button[aria-label='Digit ${d}']`).click();
await dlg.locator("button:has-text('OK')").click();
await page.waitForSelector("text=Wrong PIN.");
ok(true, "wrong PIN shows an error");
for (const d of "2468") await page.keyboard.press(d);
await page.keyboard.press("Enter");
await page.waitForSelector("aside >> text=Kashif · Cashier");
ok(page.url().endsWith("/pos"), "Kashif took over, still on the bill screen");
ok(!(await page.locator("nav").innerText().then(norm)).includes("Settings"), "with a cashier's menu");
await page.locator("aside button:has-text('Switch user')").click();
ok((await dlg.innerText().then(norm)).includes("Nobody has a PIN yet") === false && (await dlg.locator("button[aria-label='Switch to Kashif']").isDisabled()), "Kashif shows as logged in now");
await page.keyboard.press("Escape");

// Back to the owner with the password, for the reorder list.
await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "bilal");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");

// ---- Reorder list
const sup = await post("/api/parties", { type: "supplier", name: "Al-Madina Traders", phone: "0300-1112223" });
const sugar = await post("/api/products", { name: "Sugar", unit: "kg", costPrice: 140, salePrice: 160, lowStockAlert: 5 });
await post("/api/purchases", { supplierId: sup._id, amountPaid: 0, items: [{ productId: sugar._id, qty: 35, cost: 140 }] });
for (let i = 0; i < 3; i++) await post("/api/sales", { items: [{ productId: sugar._id, qty: 10 }], paymentMethod: "cash" });
await page.goto(B + "/reorder");
await page.waitForSelector("text=Al-Madina Traders");
let t = await page.locator("main").innerText().then(norm);
ok(t.includes("Sugar") && t.includes("5 days") && (await page.inputValue('input[aria-label="Order Sugar"]')) === "9", "Sugar: lasts 5 days, order 9 kg");
await page.fill('input[aria-label="Order Sugar"]', "20");
await page.click("button:has-text('WhatsApp order')");
await page.waitForTimeout(400);
ok(await waSeen((l) => l.includes("923001112223") && l.includes("Sugar — 20")), "WhatsApp order to the supplier with the changed quantity");
await page.click("button:has-text('1 month')");
await page.waitForFunction(() => document.querySelector('input[aria-label="Order Sugar"]')?.value === "25");
ok(true, "one month: order 25 kg");
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "reorder list fits a phone screen");
await page.screenshot({ path: `${out}/reorder-mobile.png`, fullPage: true });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
