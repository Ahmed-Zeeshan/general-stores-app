import { chromium } from "playwright";
import { B, norm } from "../lib/harness.mjs";
// Browser test: records open each other — khata rows, supplier purchases, stock history, activity log,
// the drawer's bills — and the day close (recount prompt, reason, float) with its Z report.
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const call = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) })).json(), [path, body, method]);
const main = async () => norm(await page.locator("main").innerText());

await page.goto(B + "/setup");
await call("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await call("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await call("/api/admin/tenants", { shopName: "Link Store", shopType: "general", maxUsers: 3, ownerName: "Nadia", username: "nadia", password: "secret1" });
await call("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "nadia");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");

const shift = await call("/api/shifts", { openingCash: 5000 });
const tea = await call("/api/products", { name: "Tapal Tea", unit: "pcs", costPrice: 400, salePrice: 500, lowStockAlert: 0 });
const sup = await call("/api/parties", { type: "supplier", name: "Akbar Traders" });
const cust = await call("/api/parties", { type: "customer", name: "Bilal Khan", phone: "03001234567" });
const pur = await call("/api/purchases", { supplierId: sup._id, items: [{ productId: tea._id, qty: 10, cost: 400 }] });
const sale = await call("/api/sales", { items: [{ productId: tea._id, qty: 2 }], paymentMethod: "credit", customerId: cust._id });
const cashBill = await call("/api/sales", { items: [{ productId: tea._id, qty: 1 }], paymentMethod: "cash" });

// ---- Customer khata: the bill number opens the bill
await page.goto(B + `/customers/${cust._id}`);
await page.waitForSelector(`text=${sale.invoiceNo}`);
const [rcpt] = await Promise.all([page.waitForEvent("popup"), page.click(`main a:has-text('${sale.invoiceNo}')`)]);
await rcpt.waitForSelector("text=TOTAL");
ok(norm(await rcpt.innerText("body")).includes(sale.invoiceNo) && norm(await rcpt.innerText("body")).includes(`Drawer ${shift.shiftNo}`), "khata row → the bill, which shows its drawer " + shift.shiftNo);
await rcpt.close();

// ---- Supplier page: Purchases tab → the purchase
await page.goto(B + `/suppliers/${sup._id}`);
await page.click("button:has-text('Purchases')");
await page.waitForSelector(`text=${pur.purchaseNo}`);
await page.click(`a:has-text('${pur.purchaseNo}')`);
await page.waitForURL(/\/purchases\?id=/);
await page.waitForSelector(`[role=dialog] >> text=${pur.purchaseNo}`);
ok(true, "supplier → Purchases tab → the purchase opens");
await page.keyboard.press("Escape");

// ---- Products: stock history, each row opens its record
await page.goto(B + "/products");
await page.waitForSelector("tr:has-text('Tapal Tea')");
await page.locator("tr:has-text('Tapal Tea') button[aria-label='More actions']").click();
await page.click("text=Stock history");
await page.waitForSelector("text=Stock history — Tapal Tea");
const sh = norm(await page.locator("[role=dialog]").innerText());
ok(sh.includes("Purchase") && sh.includes(pur.purchaseNo) && sh.includes("Sold") && sh.includes(sale.invoiceNo), "stock history lists the purchase and the bills");
ok((await page.locator(`[role=dialog] a:has-text('${sale.invoiceNo}')`).count()) === 1, "…and the bill number is a link");
await page.screenshot({ path: `${out}/stock-history.png` });
await page.keyboard.press("Escape");

// ---- Activity log: open the record
await page.goto(B + "/activity");
await page.waitForSelector("text=Open");
ok((await page.locator(`a:has-text('Open ${pur.purchaseNo}')`).count()) >= 1, "activity log: “Open PUR-…” link on the purchase");

// ---- Drawer: its bills, then close with a recount prompt
await page.goto(B + "/drawer");
await page.click("a:has-text('Bills in this drawer')");
await page.waitForURL(/\/sales\?shift=/);
await page.waitForSelector(`text=Drawer ${shift.shiftNo}`);
await page.waitForSelector(`text=${cashBill.invoiceNo}`);
ok((await main()).includes(sale.invoiceNo), "drawer → Sales History filtered to its bills (chip “Drawer SFT-…”)");
await page.goto(B + "/drawer");
await page.click("button:has-text('Close day')");
await page.click("button:has-text('Enter total')");
// Should be 1,500: 5,000 opening + 500 cash bill − 4,000 paid for the purchase. Count 1,000 = Rs 500 short.
await page.fill("input[aria-label='Counted cash']", "1000");
await page.fill("input[aria-label='Keep in drawer']", "600");
await page.locator("[role=dialog] button:has-text('Close day')").last().click();
await page.locator("[role=alertdialog] button:has-text('Close day')").click();
await page.waitForSelector("text=Rs 500 SHORT");
ok(true, "count Rs 500 short: asked to count again or give a reason");
await page.fill("textarea[aria-label='Close note']", "Gave change from the drawer to the bakery");
await page.locator("[role=dialog] button:has-text('Close day')").last().click();
await page.locator("[role=alertdialog] button:has-text('Close day')").click();
await page.waitForSelector("text=Day closed");
const done = norm(await page.locator("[role=dialog]").innerText());
ok(done.includes("Kept in drawer for next day") && done.includes("Rs 600") && done.includes("Rs 400"), "result: Rs 600 kept, Rs 400 taken out");
const [z] = await Promise.all([page.waitForEvent("popup"), page.click("[role=dialog] button:has-text('Z report')")]);
await z.waitForSelector("text=Z REPORT");
const zt = norm(await z.innerText("body"));
ok(zt.includes("Bill numbers") && zt.includes("Kept in drawer (float)") && zt.includes("SHORT Rs 500"), "Z report: bill numbers, float, result");
await z.screenshot({ path: `${out}/z-report.png`, fullPage: true });
await z.close();
await page.keyboard.press("Escape");

// ---- Next opening is checked against the float
await page.goto(B + "/drawer");
await page.waitForSelector("text=left Rs 600 in the drawer");
await page.fill("input[aria-label='Opening cash']", "100");
await page.waitForSelector("text=Rs 500 less than the last close left in the drawer");
ok(true, "opening Rs 500 less than was left: warned before opening");

ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
