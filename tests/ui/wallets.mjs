import { B, norm } from "../lib/harness.mjs";
// Browser test: Easyload, packages, JazzCash cash in, slip, cancel, balance check.
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
await post("/api/admin/tenants", { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1", phone: "0300-5556667" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "ali");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");

ok((await page.locator("nav").innerText().then(norm)).includes("Easyload & Wallets"), "menu has Easyload & Wallets");
await page.goto(B + "/wallets");
await page.waitForSelector("text=No SIMs or accounts yet");
await page.locator("main button:has-text('Add SIM / account')").first().click();
await dlg.waitFor();
await dlg.locator('input[aria-label="Account name"]').fill("Jazz Easyload SIM");
await dlg.locator('input[aria-label="Account number"]').fill("0300-1112223");
await dlg.locator('input[aria-label="Opening balance"]').fill("5000");
await dlg.locator('input[aria-label="Low balance alert"]').fill("4500");
await dlg.locator('input[aria-label="Commission percent"]').fill("2.8");
await dlg.locator("button:has-text('Add')").last().click();
await page.waitForSelector("text=Account added");
await post("/api/wallets", { name: "JazzCash Retailer", kind: "wallet", provider: "jazzcash", feePct: 1, openingBalance: 30000 });
await post("/api/packages", { operator: "jazz", name: "Weekly Super Plus", kind: "hybrid", data: "30 GB", minutes: "1500 mins", validityDays: 7, price: 300 });
await post("/api/packages", { operator: "zong", name: "Zong Weekly", price: 260 });
await page.reload();
await page.waitForSelector("text=Jazz Easyload SIM");

// Easyload
await page.fill('input[aria-label="Customer number"]', "0301-2345678");
await page.click("button:has-text('500')");
let t = await page.locator("main").innerText().then(norm);
ok(t.includes("Commission") && t.includes("Rs 14") && t.includes("Take from the customer Rs 500"), "Easyload Rs 500: commission Rs 14, take Rs 500");
await page.click("button:has-text('Save Easyload')");
await page.waitForSelector("text=WTX-000003: Easyload Rs 500 saved");
await page.waitForSelector("text=Rs 4,500");
ok(true, "SIM balance now Rs 4,500");

// Package (only Jazz packages for the Jazz SIM)
await page.click("button:text-is('Package')");
await page.waitForSelector("text=Weekly Super Plus");
ok(await page.locator("text=Zong Weekly").count() === 0, "only Jazz packages shown for a Jazz SIM");
await page.fill('input[aria-label="Customer number"]', "03012345678");
await page.click("button:has-text('Weekly Super Plus')");
await page.click("button:has-text('Save Package')");
await page.waitForSelector("text=Package Rs 300 saved");
ok((await page.locator("main").innerText().then(norm)).includes("Low balance: Jazz Easyload SIM (Rs 4,200)"), "low balance warning once the SIM is below Rs 4,500");

// JazzCash cash in with the usual fee filled in
await page.click("button:has-text('Cash in / send')");
await page.fill('input[aria-label="Customer number"]', "03451234567");
await page.fill('input[aria-label="Amount"]', "2000");
await page.waitForTimeout(200);
ok((await page.inputValue('input[aria-label="Fee"]')) === "20", "usual 1% fee filled in (Rs 20)");
await page.fill('input[aria-label="Transaction ID"]', "TID-9911");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Take from the customer Rs 2,020"), "take Rs 2,020 from the customer");
await page.click("button:has-text('Save Cash in / send money')");
await page.waitForSelector("text=Cash in / send money Rs 2,000 saved");

// Slip
const pop = ctx.waitForEvent("page");
await page.click("text=Print slip for WTX-000005");
const slip = await pop;
await slip.waitForSelector("text=TOTAL PAID");
t = await slip.locator("body").innerText().then(norm);
ok(t.includes("03451234567") && t.includes("TID-9911") && t.includes("Rs 2,020"), "slip: number, TID, total Rs 2,020");
await slip.close();

// Day totals and cancelling the cash in
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Rs 42.40") || t.includes("Rs 42.4"), "profit today Rs 42.40 (14 + 8.40 + 20)");
await page.click("button[aria-label='Cancel WTX-000005']");
await dlg.waitFor();
await dlg.locator('textarea[aria-label="Reason"]').fill("Wrong number, money returned");
await dlg.locator("button:has-text('Cancel entry')").click();
await page.waitForSelector("text=WTX-000005 cancelled");
const jc = (await get("/api/wallets")).find((w) => w.name === "JazzCash Retailer");
ok(jc.balance === 30000, "JazzCash balance back to Rs 30,000");

// Balance check
await page.click("button[aria-label='Balance check Jazz Easyload SIM']");
await dlg.waitFor();
await dlg.locator('input[aria-label="Actual balance"]').fill("4190");
ok((await dlg.innerText().then(norm)).includes("Difference -Rs 10") || (await dlg.innerText().then(norm)).includes("Difference Rs -10"), "difference shown before saving");
await dlg.locator("button:has-text('Save balance check')").click();
await page.waitForSelector("text=Balance corrected by");

// Packages page
await page.goto(B + "/wallets/packages");
await page.waitForSelector("text=Weekly Super Plus");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("30 GB · 1500 mins · 7 days") && t.includes("Zong Weekly"), "package list shows what each package gives");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/wallets");
await page.waitForSelector("text=Jazz Easyload SIM");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "wallets page fits a phone screen");
await page.screenshot({ path: `${out}/wallets-mobile.png`, fullPage: true });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
