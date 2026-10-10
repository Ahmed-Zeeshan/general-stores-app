import { B, norm } from "../lib/harness.mjs";
// Browser test: receive udhaar (part / full), receipt, WhatsApp confirmation, cancel, POS quick receive.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const page = await ctx.newPage();
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
// Capture WhatsApp links instead of leaving the app.
const waLinks = [];
await ctx.route(/wa\.me|web\.whatsapp\.com/, (route) => { waLinks.push(decodeURIComponent(route.request().url())); route.fulfill({ status: 200, body: "wa" }); });
const post = (path, body) => page.evaluate(async ([p, b]) => (await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body]);

await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "UI Mart", shopType: "general", maxUsers: 3, ownerName: "Sana", username: "sana", password: "secret1", phone: "0300-9998887" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "sana");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
const bilal = await post("/api/parties", { type: "customer", name: "Bilal Ahmed", phone: "0300-1234567", openingBalance: 2500 });
await post("/api/parties", { type: "customer", name: "Ali Raza", phone: "0321-7654321", openingBalance: 800 });

// ---- Customer page: part payment
await page.goto(`${B}/customers/${bilal._id}`);
await page.click("button:has-text('Receive payment')");
const dlg = page.locator("[role=dialog]");
await dlg.waitFor();
// The dialog animates in; give slower machines a moment before reading it.
await page.waitForFunction(() => /Full payment[\s\S]*Half/.test(document.querySelector("[role=dialog]")?.innerText ?? ""), null, { timeout: 10000 }).catch(() => {});
let t = await dlg.innerText().then(norm);
ok(t.includes("Full payment") && t.includes("Rs 2,500") && t.includes("Half"), "quick amounts: full and half" + (t.includes("Rs 2,500") ? "" : ` — dialog showed: ${JSON.stringify(t.slice(0, 300))}`));
await dlg.locator("input[aria-label=Amount]").fill("1000");
t = (await dlg.innerText().then(norm)).replace(/\n/g, " ");
ok(/Remaining\s*Rs 1,500/.test(t) && t.includes("Part payment"), "shows remaining 1,500 and 'Part payment'");
await page.screenshot({ path: `${out}/pay-part.png` });
await dlg.locator("button:has-text('Receive Rs 1,000')").click();
await page.waitForSelector("text=Payment received");
t = await page.locator("[role=dialog]").innerText().then(norm);
ok(t.includes("RCP-000001") && t.includes("Still to collect: Rs 1,500"), "done screen: receipt no and remaining");
await page.screenshot({ path: `${out}/pay-done.png` });
await page.click("[role=dialog] button:has-text('WhatsApp')");
await page.waitForTimeout(800);
const msg = waLinks.at(-1) ?? "";
ok(msg.includes("923001234567") && msg.includes("Rs 1,000") && msg.includes("RCP-000001") && msg.includes("Rs 1,500"), "WhatsApp message: number, amount, receipt, balance");
const [rp] = await Promise.all([page.waitForEvent("popup"), page.click("[role=dialog] button:has-text('Receipt')")]);
await rp.waitForSelector("text=PAYMENT RECEIPT");
const rt = await rp.innerText("body").then(norm);
ok(rt.includes("RCP-000001") && rt.includes("Bilal Ahmed") && rt.includes("PART PAYMENT") && rt.includes("Rs 2,500") && rt.includes("Rs 1,500"), "receipt: number, customer, part payment, before/after");
await rp.screenshot({ path: `${out}/pay-receipt.png`, fullPage: true });
await rp.close();
await page.click("[role=dialog] button:has-text('Done')");
await page.waitForTimeout(400);
ok((await page.locator("h1 ~ *, .text-4xl").first().innerText().then(norm)).length > 0, "back on khata");
ok(await page.locator("text=Rs 1,500").first().isVisible(), "khata balance now 1,500");

// ---- Full payment with the quick button
await page.click("button:has-text('Receive payment')");
await dlg.waitFor();
await dlg.locator("button:has-text('Full payment')").click();
t = (await dlg.innerText().then(norm)).replace(/\n/g, " ");
ok(t.includes("Full payment — khata will be clear"), "full payment message");
await dlg.locator("select").selectOption("jazzcash");
await dlg.locator("button:has-text('Receive Rs 1,500')").click();
await page.waitForSelector("text=Khata clear — fully paid");
ok(true, "khata clear after full payment");
await page.click("[role=dialog] button:has-text('Done')");
await page.waitForTimeout(400);

// ---- Row actions: receipt, cancel
const rows = page.locator("tbody tr");
ok(await page.locator("button[aria-label='Print receipt']").count() === 2, "each payment row has a receipt button");
ok(await page.locator("button[aria-label='WhatsApp receipt']").count() === 2, "each payment row has WhatsApp");
await page.locator("tr:has-text('RCP-000002') button[aria-label='Cancel payment']").click();
await page.waitForSelector("[role=alertdialog]");
t = await page.locator("[role=alertdialog]").innerText().then(norm);
ok(t.includes("Cancel payment RCP-000002?") && t.includes("Rs 1,500"), "cancel asks for confirmation with amount");
await page.screenshot({ path: `${out}/pay-cancel-confirm.png` });
await page.click("[role=alertdialog] button:has-text('Cancel payment')");
await page.waitForSelector("text=Payment cancelled");
await page.waitForTimeout(500);
ok(await page.locator("tr:has-text('RCP-000002') span.line-through").count() === 1, "original payment row struck through and marked Cancelled");
ok(await page.locator("tr:has-text('RCP-000002') button[aria-label='Cancel payment']").count() === 0, "no cancel button on cancelled payment");
ok(await page.locator(".text-4xl:has-text('Rs 1,500')").count() === 1, "balance back to 1,500");
await page.screenshot({ path: `${out}/pay-khata.png`, fullPage: true });
ok((await rows.count()) >= 4, "khata lists payments and reversal");

// ---- POS quick receive (F8)
await page.goto(B + "/pos");
await page.waitForSelector("text=New Bill");
await page.keyboard.press("F8");
await page.waitForSelector("[role=dialog] button:has-text('Ali Raza')");
t = await page.locator("[role=dialog]").innerText().then(norm);
ok(t.includes("Bilal Ahmed") && t.includes("Ali Raza"), "lists customers with udhaar");
await page.fill("input[aria-label='Search customer']", "Ali");
await page.waitForTimeout(500);
ok(!(await page.locator("[role=dialog]").innerText().then(norm)).includes("Bilal"), "search filters customers");
await page.click("[role=dialog] button:has-text('Ali Raza')");
await page.locator("[role=dialog] input[aria-label=Amount]").fill("300");
await page.screenshot({ path: `${out}/pay-pos.png` });
await page.click("[role=dialog] button:has-text('Receive Rs 300')");
await page.waitForSelector("text=Payment received");
ok((await page.locator("[role=dialog]").innerText().then(norm)).includes("Still to collect: Rs 500"), "POS: part payment saved, 500 left");
await page.click("[role=dialog] button:has-text('Done')");
await page.click("button:has-text('Receive udhaar')");
await page.waitForSelector("text=Receive udhaar — choose customer");
ok(true, "button opens it too");
await page.keyboard.press("Escape");

// ---- Udhaar report receive button + dashboard
await page.goto(B + "/udhaar");
await page.waitForSelector("tr:has-text('Ali Raza')");
await page.click("tr:has-text('Ali Raza') button:has-text('Receive')");
await page.waitForSelector("[role=dialog] >> text=Ali Raza");
ok((await dlg.innerText().then(norm)).includes("Rs 500"), "udhaar report: receive with balance");
await page.keyboard.press("Escape");
await page.goto(B + "/");
await page.waitForSelector("text=Udhaar to Collect");
ok((await page.locator("body").innerText().then(norm)).includes("collected today"), "dashboard shows collected today");
await page.goto(B + "/reports");
await page.waitForSelector("text=Udhaar collected");
ok((await page.locator("body").innerText().then(norm)).toLowerCase().includes("old udhaar collected"), "reports list collections by method");

// ---- Settings: payment message template
await page.goto(B + "/settings");
await page.waitForSelector("text=Payment received message");
ok((await page.locator("body").innerText().then(norm)).includes("wusool ho gayi"), "settings preview of payment message");

// ---- phone width
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${B}/customers/${bilal._id}`);
await page.click("button:has-text('Receive payment')");
await dlg.waitFor();
await page.waitForTimeout(300);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no sideways scroll on phone");
await page.screenshot({ path: `${out}/pay-mobile.png` });

ok(nativeDialogs === 0, "no browser pop-ups used");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
