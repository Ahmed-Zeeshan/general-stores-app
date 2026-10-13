import { B, norm } from "../lib/harness.mjs";
// Browser test: a new shop's setup guide, the ready-made item list, and the help pages.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const page = await ctx.newPage();
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const post = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body, method]);
const get = (path) => page.evaluate(async (p) => (await fetch(p)).json(), path);
const dlg = page.locator("[role=dialog]");

await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "ali");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");

// ---- Guide
await page.waitForSelector("text=Get your shop ready");
let t = await page.locator("main").innerText().then(norm);
ok(t.includes("0 of 9 done") && t.includes("Add the phones in stock by IMEI") && t.includes("Add your Easyload SIMs"), "mobile shop guide: 9 steps incl. phones and Easyload SIMs");

// ---- Ready-made list
await page.click("button:has-text('Ready-made list')");
await dlg.locator("text=Add ready-made items").waitFor();
await dlg.locator("text=Tempered Glass").first().waitFor();
await dlg.locator('input[aria-label="Find an item"]').fill("glass");
ok((await dlg.locator("input[type=checkbox]").count()) === 1, "search narrows the list");
await dlg.locator('input[aria-label="Tempered Glass sale price"]').fill("350");
await dlg.locator('input[aria-label="Tempered Glass stock"]').fill("40");
await dlg.locator('input[aria-label="Find an item"]').fill("");
await dlg.locator('input[aria-label="Sell Fast Charger 20W"]').check();
t = await dlg.innerText().then(norm);
ok(t.includes("Type the sale price for 1 ticked item") && (await dlg.locator("button:has-text('Add 2 items')").isDisabled()), "a ticked item without a price stops the save");
await dlg.locator('input[aria-label="Fast Charger 20W sale price"]').fill("1500");
await dlg.locator("button:has-text('Add 2 items')").click();
await page.waitForSelector("text=2 items added");
const glass = (await get("/api/products?q=Tempered")).find((p) => p.name === "Tempered Glass");
ok(glass?.salePrice === 350 && glass.stock === 40 && glass.category?.name === "Covers & Protectors", "Tempered Glass added: Rs 350, 40 in stock, right category");
await page.waitForSelector("text=items you sell"); // still listed (needs 5 items)
ok((await page.locator("main").innerText().then(norm)).includes("(2 so far)"), "guide shows 2 items so far");

// ---- Printer test step
const pop = ctx.waitForEvent("page");
await page.click("a:has-text('Print test receipt')");
const test = await pop;
await test.waitForSelector("text=PRINTER TEST");
await test.close();
ok((await page.locator("main").innerText().then(norm)).includes("1 of 9 done"), "printer tested: 1 of 9 done");

// ---- Help
await page.goto(B + "/repairs");
await page.click("a[aria-label='Help for this page']");
await page.waitForURL(B + "/help#repairs");
await page.waitForSelector("#repairs >> text=Repairs → New repair job");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Making a bill") && t.includes("Installments (qist)") && t.includes("Keyboard shortcuts"), "help page: topics incl. mobile shop ones");
ok((await page.locator("nav").locator("xpath=..").locator("a:has-text('Help')").count()) === 1, "Help in the menu");

// ---- Hide the guide
await page.goto(B + "/");
await page.waitForSelector("text=Get your shop ready");
await page.click("button[aria-label='Hide the setup guide']");
await page.waitForSelector("text=Get your shop ready", { state: "detached" });
await page.reload();
await page.waitForSelector("text=Today's Sales");
ok((await page.locator("text=Get your shop ready").count()) === 0, "hidden guide stays hidden");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/help");
await page.waitForSelector("text=Making a bill");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "help page fits a phone screen");
await page.goto(B + "/products");
await page.click("button:has-text('Ready-made items')");
await dlg.locator("text=Tempered Glass").first().waitFor();
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "ready-made list fits a phone screen");
await page.screenshot({ path: `${out}/starter-mobile.png` });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
