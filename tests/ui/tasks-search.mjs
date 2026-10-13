import { B, norm } from "../lib/harness.mjs";
// Browser test: the Today's tasks bell (one-tap WhatsApp) and the Ctrl+K search box.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + n * 864e5));
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
await post("/api/admin/tenants", { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1", phone: "0300-5556667" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "ali");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");

const job = await post("/api/repairs", { customerName: "Nadeem Akhtar", customerPhone: "0333-7654321", deviceName: "Redmi Note 12", problem: "Screen broken", promisedAt: day(1) });
await post(`/api/repairs/${job._id}/status`, { status: "ready" });
await post("/api/wallets", { name: "Jazz SIM", kind: "load", provider: "jazz", lowAlert: 5000, openingBalance: 3000 });
const shahid = await post("/api/parties", { type: "customer", name: "Shahid Mehmood", phone: "0321-1234567", openingBalance: 2500 });
const charger = await post("/api/products", { name: "Charger 20W", unit: "pcs", costPrice: 600, salePrice: 1200, lowStockAlert: 0, openingStock: 5 });
await post("/api/sales", { items: [{ productId: charger._id, qty: 1 }], paymentMethod: "cash", customerId: shahid._id });
await page.reload();

// ---- Bell
const bell = page.locator("aside button[aria-label^=\"Today's tasks\"]");
await page.waitForFunction(() => /\(\d+\)/.test(document.querySelector("aside button[aria-label^=\"Today's tasks\"]")?.getAttribute("aria-label") ?? ""));
ok((await bell.getAttribute("aria-label")) === "Today's tasks (3)", "bell shows 3 things to do (drawer, phone ready, SIM top-up)");
await bell.click();
await dlg.waitFor();
let t = await dlg.innerText().then(norm);
ok(t.includes("Open the cash drawer") && t.includes("Redmi Note 12 ready for Nadeem Akhtar") && t.includes("Top up Jazz SIM"), "list: open drawer, phone ready, top up SIM");
await dlg.locator("button[aria-label='WhatsApp: Redmi Note 12 ready for Nadeem Akhtar']").click();
await dlg.locator("text=Sent").waitFor();
await page.waitForTimeout(300);
ok(await waSeen((l) => l.includes("923337654321") && l.includes("JOB-000001") && l.includes("tayyar")), "one tap: 'ready' WhatsApp to the customer");
await dlg.locator("text=Open the cash drawer").click();
await page.waitForURL(B + "/drawer");
ok(true, "tapping a task opens its page");

// ---- Search (Ctrl+K)
await page.keyboard.press("Control+k");
const box = page.locator('input[aria-label="Search anything"]');
await box.waitFor();
await box.fill("03211234567");
await page.waitForSelector("[role=dialog] >> text=Shahid Mehmood");
t = await page.locator("[role=dialog]").innerText().then(norm);
ok(/customers/i.test(t) && t.includes("owes Rs 2,500"), "Ctrl+K: mobile number without dashes finds the customer and what he owes");
await page.keyboard.press("Enter");
await page.waitForFunction(() => /\/customers\/[a-f0-9]{24}$/.test(location.pathname));
ok(true, "Enter opens the customer");
// Customer page: summary and tabs
await page.waitForSelector("text=Bought in all");
await page.click("button:has-text('Bills (1)')");
await page.waitForSelector("text=Charger 20W");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Rs 1,200") && /Repairs \(0\)/.test(t) && /Installments \(0\)/.test(t), "customer page: bills tab with the bill, repairs and installments tabs");
await page.click("button:has-text('Khata')");
await page.waitForSelector("text=Khata history");
await page.locator("aside button[aria-label='Search']").click();
await box.fill("redmi");
await page.waitForSelector("[role=dialog] >> text=JOB-000001 · Redmi Note 12");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Escape");
ok((await box.count()) === 0, "Esc closes the search box");

// ---- Phone screen
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/");
await page.locator("header button[aria-label^=\"Today's tasks\"]").click();
await dlg.waitFor();
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "tasks list fits a phone screen");
await page.screenshot({ path: `${out}/tasks-mobile.png` });
await page.keyboard.press("Escape");
await page.locator("header button[aria-label='Search']").click();
await box.fill("Nadeem");
await page.waitForSelector("[role=dialog] >> text=JOB-000001 · Redmi Note 12");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "search fits a phone screen");
await page.screenshot({ path: `${out}/search-mobile.png` });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
