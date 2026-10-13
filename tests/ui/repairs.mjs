import { B, norm } from "../lib/harness.mjs";
// Browser test: repair job from booking to delivery (slip, status, parts, WhatsApp, bill).
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
const popup = async (action) => {
  const p = ctx.waitForEvent("page");
  await action();
  const w = await p;
  await w.addInitScript(() => { window.print = () => {}; });
  return w;
};

await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1", phone: "0300-5556667" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "ali");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
await post("/api/products", { name: "Screen Redmi Note 12", unit: "pcs", costPrice: 3200, salePrice: 4500, lowStockAlert: 1, openingStock: 3 });

ok((await page.locator("nav").innerText().then(norm)).includes("Repairs"), "menu has Repairs");
await page.goto(B + "/repairs");
await page.waitForSelector("text=No repair jobs here");
await page.click("button:has-text('New repair job')");
await dlg.waitFor();
await dlg.locator('input[aria-label="Customer name"]').fill("Nadeem Akhtar");
await dlg.locator('input[aria-label="Customer mobile"]').fill("0333-1234567");
await dlg.locator('input[aria-label="Phone model"]').fill("Redmi Note 12");
await dlg.locator('input[aria-label="IMEI"]').fill("351234567890123");
await dlg.locator('textarea[aria-label="Problem"]').fill("Screen broken, touch not working");
await dlg.locator("label:has-text('SIM') input").check();
await dlg.locator('input[aria-label="Estimate"]').fill("6500");
await dlg.locator('input[aria-label="Advance"]').fill("1000");
const slip = await popup(() => dlg.locator("button:has-text('Book in & print slip')").click());
await slip.waitForSelector("text=REPAIR JOB SLIP");
let t = await slip.locator("body").innerText().then(norm);
ok(t.includes("JOB-000001") && t.includes("Screen broken") && t.includes("Rs 1,000") && t.includes("SIM"), "job slip prints: job no, problem, advance, accessories");
await slip.close();
await page.waitForURL(/\/repairs\/[a-f0-9]{24}$/);
await page.waitForSelector("text=JOB-000001");

// Work on it
await page.click("button:has-text('Repairing')");
await page.waitForSelector("text=Status: Repairing");
await page.fill('input[aria-label="Search parts"]', "Screen");
await page.click("button:has-text('Screen Redmi Note 12')");
await page.click("button:has-text('Add')");
await page.waitForSelector("text=Part added (taken from stock)");
await page.fill('input[aria-label="Labour"]', "1500");
await page.fill('textarea[aria-label="Diagnosis"]', "LCD replaced");
await page.click("button:has-text('Save')");
await page.waitForSelector("text=Saved");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Rs 6,000") && t.includes("Rs 5,000"), "bill: screen 4,500 + labour 1,500 = Rs 6,000; Rs 5,000 still to pay");
await page.click("button:has-text('Ready to collect')");
await page.waitForSelector("text=Send “ready” on WhatsApp");
await page.click("button:has-text('Send “ready” on WhatsApp')");
await page.waitForTimeout(500);
ok(await waSeen((l) => l.includes("923331234567") && l.includes("JOB-000001") && l.includes("tayyar") && l.includes("Rs 5,000")), "WhatsApp: ready message with job no and balance");

// Deliver
await page.click("button:has-text('Deliver phone')");
await dlg.waitFor();
ok((await dlg.innerText().then(norm)).includes("Rs 5,000"), "deliver: Rs 5,000 to collect");
const bill = await popup(() => dlg.locator("button:has-text('Deliver & print bill')").click());
await bill.waitForSelector("text=REPAIR BILL");
t = await bill.locator("body").innerText().then(norm);
ok(t.includes("Screen Redmi Note 12") && t.includes("TOTAL") && t.includes("Rs 6,000") && t.includes("Repair warranty till"), "repair bill: parts, total and warranty");
await bill.close();
await page.waitForSelector("text=Phone delivered");
ok((await page.locator("main").innerText().then(norm)).includes("Delivered"), "job shows delivered");

await page.goto(B + "/repairs");
await page.waitForSelector("text=No repair jobs here");
await page.click("button:has-text('Delivered')");
await page.waitForSelector("text=JOB-000001");
ok(true, "delivered job listed under Delivered");

await page.setViewportSize({ width: 390, height: 844 });
await page.click("text=JOB-000001");
await page.waitForSelector("text=Parts used");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "job page fits a phone screen");
await page.screenshot({ path: `${out}/repair-job-mobile.png`, fullPage: true });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
