import mongoose from "mongoose";
import { B, db, norm, oid } from "../lib/harness.mjs";
// Browser test: selling a phone on installments from the sale screen, the agreement, collecting,
// cancelling a payment, late reminders and closing a plan.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const imei = (n) => {
  const body = String(35_600_000_000_000 + n).padStart(14, "0");
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + ((10 - (sum % 10)) % 10);
};
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

const I = [imei(5), imei(9)];
const phone = await post("/api/products", { name: "Tecno Spark 20", unit: "pcs", costPrice: 32000, salePrice: 40000, lowStockAlert: 0, trackSerial: true, warrantyMonths: 12 });
await post("/api/devices", { productId: phone._id, cost: 32000, units: [{ imei: I[0], color: "Blue" }, { imei: I[1], color: "Black" }] });
await post("/api/parties", { type: "customer", name: "Shahid Mehmood", phone: "03211234567" });
ok((await page.locator("nav").innerText().then(norm)).includes("Installments"), "menu has Installments");

// ---- Sell on installments from the sale screen
await page.goto(B + "/pos");
await page.waitForSelector("text=Tecno Spark 20");
await page.fill('input[placeholder^="Scan barcode"]', I[0]);
await page.keyboard.press("Enter");
await page.waitForSelector(`aside >> text=IMEI ${I[0]}`);
await page.click("button:has-text('Take Payment')");
await dlg.waitFor();
await dlg.locator("button:has-text('Sell on installments')").click();
await dlg.locator("text=Sell on installments (qist)").waitFor();
ok(await dlg.locator("button:has-text('Save & print agreement')").isDisabled(), "cannot save without a customer and CNIC");
await dlg.locator("button:has-text('Choose customer')").click();
await page.locator("[role=dialog] >> text=Shahid Mehmood").click();
await page.waitForSelector("[role=dialog] >> text=Shahid Mehmood");
await dlg.locator('input[aria-label="Customer CNIC"]').fill("3410112345673");
await dlg.locator('input[aria-label="Customer address"]').fill("Satellite Town, Gujranwala");
await dlg.locator('input[aria-label="Advance"]').fill("10000");
await dlg.locator('select[aria-label="Months"]').selectOption("6");
await dlg.locator('input[aria-label="Markup value"]').fill("10");
await dlg.locator("summary:has-text('Guarantor')").click();
await dlg.locator('input[aria-label="Guarantor name"]').fill("Tariq Mehmood");
await dlg.locator('input[aria-label="Guarantor CNIC"]').fill("34101-7654321-1");
await dlg.locator('input[aria-label="Guarantor relation"]').fill("Brother");
let d = await dlg.innerText().then(norm);
ok(d.includes("In installments") && d.includes("Rs 33,000") && d.includes("Rs 5,500") && d.includes("Customer pays in all") && d.includes("Rs 43,000"), "preview: Rs 30,000 + 10% = Rs 33,000 → 6 × Rs 5,500 (Rs 43,000 in all)");
const pop = ctx.waitForEvent("page");
await dlg.locator("button:has-text('Save & print agreement')").click();
const agreement = await pop;
await agreement.waitForSelector("text=Installment Sale Agreement");
let t = await agreement.locator("body").innerText().then(norm);
ok(t.includes("QST-000001") && t.includes("34101-1234567-3") && t.includes("Tariq Mehmood (Brother)") && t.includes(I[0]) && t.includes("6 monthly × Rs 5,500") && /thirty[- ]three thousand/i.test(t), "agreement: plan no, CNIC, guarantor, IMEI, 6 × Rs 5,500, amount in words");
await agreement.close();
await page.waitForSelector("text=Sold on installments");
t = await dlg.innerText().then(norm);
ok(t.includes("QST-000001") && t.includes("6 × Rs 5,500"), "success: QST-000001, 6 × Rs 5,500");
await dlg.locator("text=Open the installment plan").click();

// ---- Plan page: receive, receipt, cancel a payment
await page.waitForSelector("text=Monthly installments");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Cash price") && t.includes("Rs 40,000") && t.includes("Left to pay") && t.includes("Rs 33,000"), "plan page: cash price Rs 40,000, Rs 33,000 left");
await page.click("button:has-text('Receive installment')");
await dlg.waitFor();
ok((await dlg.locator('input[aria-label="Amount received"]').inputValue()) === "5500", "amount filled with the next installment (Rs 5,500)");
await dlg.locator("button:has-text('Save Rs')").click();
await page.waitForSelector("text=QST-000001-1: Rs 5,500 received");
const rPop = ctx.waitForEvent("page");
await page.locator("main button:has-text('Print receipt')").click();
const slip = await rPop;
await slip.waitForSelector("text=INSTALLMENT RECEIPT");
t = await slip.locator("body").innerText().then(norm).then((x) => x.replace(/\s+/g, " "));
ok(t.includes("QST-000001-1") && t.includes("Left before Rs 33,000") && t.includes("LEFT TO PAY Rs 27,500"), "receipt: Rs 33,000 before, Rs 27,500 left");
await slip.close();
await page.click("button:has-text('WhatsApp confirmation')");
await page.waitForTimeout(300);
ok(await waSeen((l) => l.includes("923211234567") && l.includes("wusool") && l.includes("Rs 27,500")), "WhatsApp: payment confirmation with balance");
// A second payment entered by mistake, then cancelled by the owner.
await page.click("button:has-text('Receive installment')");
await dlg.waitFor();
await dlg.locator('input[aria-label="Amount received"]').fill("2000");
await dlg.locator('select[aria-label="Paid by"]').selectOption("jazzcash");
await dlg.locator('input[aria-label="Transaction ID"]').fill("JC-7788");
await dlg.locator("button:has-text('Save Rs')").click();
await page.waitForSelector("text=QST-000001-2: Rs 2,000 received");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Part paid") && t.includes("JC-7788"), "part payment shows on the 2nd month, with the JazzCash TID");
await page.click("button[aria-label='Cancel payment QST-000001-2']");
await dlg.waitFor();
await dlg.locator('textarea[aria-label="Reason"]').fill("Entered by mistake");
await dlg.locator("button:has-text('Cancel payment')").click();
await page.waitForSelector("text=Payment cancelled");
const p1 = await get(`/api/installments?status=active`);
ok(p1.rows[0].paid === 5500 && p1.rows[0].balance === 27500, "back to Rs 5,500 received, Rs 27,500 left");

// ---- Late installments and the reminder
const plan = p1.rows[0];
await (await db()).collection("installmentplans").updateOne({ _id: oid(plan._id) }, { $set: { schedule: plan.schedule.map((x, i) => ({ ...x, dueDate: new Date(Date.now() + (i - 2) * 30 * 864e5 - 864e5) })) } });
await page.goto(B + "/installments");
await page.waitForSelector("text=QST-000001");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Late amount") && t.includes("Rs 11,000") && t.includes("Still to collect") && t.includes("Rs 27,500"), "cards: Rs 11,000 late, Rs 27,500 to collect");
await page.click("button:has-text('Late (1)')");
await page.waitForSelector("text=2 late");
ok(true, "Late tab lists the plan (2 installments late)");
await page.click("button:has-text('Due today')");
await page.waitForSelector("text=Nothing due today");
await page.click("button:has-text('Running')");
await page.fill('input[aria-label="Search installments"]', "34101-1234567");
await page.waitForSelector("text=Shahid Mehmood");
ok(true, "search by CNIC");
await page.click("text=QST-000001");
await page.waitForSelector("text=Monthly installments");
await page.locator("main button:has-text('Send reminder')").click();
await page.waitForTimeout(300);
ok(await waSeen((l) => l.includes("yaad-dehani") && l.includes("Rs 11,000") && l.includes("QST-000001")), "WhatsApp reminder with the late amount");
await page.waitForSelector("text=Last reminder");
ok(true, "reminder date shown");

// ---- Closing a plan: phone taken back
await page.click("button:has-text('Close plan')");
await dlg.waitFor();
await dlg.locator('textarea[aria-label="Reason"]').fill("Stopped paying, phone returned");
ok(await dlg.locator('input[aria-label="Take the goods back"]').isChecked(), "take the goods back is ticked by default");
await dlg.locator("button:has-text('Close plan')").click();
await page.waitForSelector("text=QST-000001 closed");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Closed.") && t.includes("Rs 27,500 not collected") && t.includes("Not collected"), "plan closed: Rs 27,500 not collected");
const dev = await get(`/api/devices?q=${I[0]}`);
ok(dev[0].status === "in_stock", "phone back in stock");

// ---- Dashboard shows the mobile shop's day
await page.goto(B + "/");
await page.waitForSelector("text=Mobile shop today");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Installments") && t.includes("Rs 5,500 collected today") && t.includes("Easyload & wallets") && t.includes("Repairs") && t.includes("Used phones bought"), "dashboard: mobile shop today (installments collected, Easyload, repairs, used phones)");

// ---- Phone screen
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/installments?x=1");
await page.click("button:text-is('All')");
await page.waitForSelector("text=QST-000001");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "installments list fits a phone screen");
await page.click("text=QST-000001");
await page.waitForSelector("text=Monthly installments");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "plan page fits a phone screen");
await page.screenshot({ path: `${out}/installment-plan-mobile.png`, fullPage: true });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await mongoose.disconnect();
await browser.close();
