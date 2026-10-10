import { B, norm } from "../lib/harness.mjs";
// Browser test of the item-level return screen (run on a freshly reset database).
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const post = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body, method]);
const get = (path) => page.evaluate(async (p) => (await fetch(p)).json(), path);

await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "UI Mart", shopType: "general", maxUsers: 3, ownerName: "Sana", username: "sana", password: "secret1" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "sana");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
const rice = await post("/api/products", { name: "Basmati Rice", unit: "kg", costPrice: 200, salePrice: 250, lowStockAlert: 1, openingStock: 100 });
const soap = await post("/api/products", { name: "Lux Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 1, openingStock: 50 });
const cust = await post("/api/parties", { type: "customer", name: "Bilal", phone: "0300-1234567" });
// 3 kg rice 750 + 4 soap 400 = 1150; paid 650 → 500 udhaar
const sale = await post("/api/sales", { items: [{ productId: rice._id, qty: 3 }, { productId: soap._id, qty: 4 }], paymentMethod: "cash", amountPaid: 650, customerId: cust._id });

await page.goto(B + "/sales");
await page.waitForSelector(`text=${sale.invoiceNo}`);
await page.click(`tr:has-text('${sale.invoiceNo}') button:has-text('Return')`);
const dlg = page.locator("[role=dialog]");
await page.waitForSelector("[role=dialog] >> text=Return everything");
ok((await dlg.innerText().then(norm)).includes(`Return items — ${sale.invoiceNo}`), "return screen opens for the bill");
ok(await dlg.locator("button:has-text('Save return')").isDisabled(), "save disabled until an item is chosen");
// two soaps with the + button
const soapRow = dlg.locator("li:has-text('Lux Soap')");
await soapRow.locator("button[aria-label=More]").click();
await soapRow.locator("button[aria-label=More]").click();
let txt = await dlg.innerText().then(norm);
ok(txt.includes("Value of returned items") && txt.includes("Rs 200"), "value shown (Rs 200)");
ok(/udhaar\s*Rs 200/.test(txt.replace(/\n/g, " ")), "taken off udhaar");
await dlg.locator("select").first().selectOption("Damaged / broken");
await page.screenshot({ path: `${out}/return-partial.png` });
await dlg.locator("button:has-text('Save return')").click();
await page.waitForSelector("text=Return saved");
txt = await page.locator("[role=dialog]").innerText().then(norm);
ok(txt.includes("Udhaar reduced by Rs 200") && txt.includes("No money to give back"), "done screen: udhaar reduced, nothing to give");
await page.screenshot({ path: `${out}/return-done.png` });
await page.click("[role=dialog] button:has-text('Done')");
await page.waitForTimeout(500);
ok(await page.locator(`tr:has-text('${sale.invoiceNo}') >> text=Part returned`).count() === 1, "bill shows Part returned");
ok(await page.locator(`tr:has-text('${sale.invoiceNo}') >> text=returned`).count() >= 1, "bill shows returned amount");

// second return: everything left, refund into khata
await page.click(`tr:has-text('${sale.invoiceNo}') button:has-text('Return')`);
await page.waitForSelector("[role=dialog] >> text=Return everything");
txt = await dlg.innerText().then(norm);
ok(txt.includes("2 already returned"), "already returned quantity shown (fresh copy of the bill)");
await dlg.locator("button:has-text('Return everything')").click();
txt = (await dlg.innerText().then(norm)).replace(/\n/g, " ");
ok(txt.includes("Rs 950"), "remaining value Rs 950");
ok(/Give back Rs 650 by/.test(txt), "cash paid to give back Rs 650");
ok(await dlg.locator("button:has-text('Return & refund Rs 650')").count() === 1, "button names the refund");
await dlg.locator("select").last().selectOption("khata");
ok(await dlg.locator("button:has-text('Save return')").count() === 1, "khata refund: button says Save return");
await page.screenshot({ path: `${out}/return-all.png` });
await dlg.locator("button:has-text('Save return')").click();
await page.waitForSelector("text=Return saved");
ok((await page.locator("[role=dialog]").innerText().then(norm)).includes("Added to customer's khata as credit"), "done: added to khata");
const [p] = await Promise.all([page.waitForEvent("popup"), page.click("[role=dialog] button:has-text('Print')")]);
await p.waitForLoadState();
await p.waitForSelector("text=RETURN", { timeout: 10000 });
const rtxt = await p.innerText("body").then(norm);
ok(rtxt.includes(sale.invoiceNo) && /RTN-/.test(rtxt), "return receipt shows bill and return number");
await p.screenshot({ path: `${out}/return-receipt.png`, fullPage: true });
await p.close();
await page.click("[role=dialog] button:has-text('Done')");
await page.waitForTimeout(500);
ok(await page.locator(`tr:has-text('${sale.invoiceNo}') >> text=Returned`).count() >= 1, "bill now Returned");
ok(await page.locator(`tr:has-text('${sale.invoiceNo}') button:has-text('Return')`).count() === 0, "no Return button on returned bill");
const party = await get(`/api/parties/${cust._id}`);
ok(Math.abs(party.party.balance + 650) < 0.01, `customer khata shows advance (${party.party.balance})`);

await page.click("button:has-text('Returns')");
await page.waitForSelector("text=RTN-000002");
ok((await page.locator("tbody").innerText().then(norm)).includes("to khata"), "returns tab lists refund to khata");
await page.screenshot({ path: `${out}/returns-tab.png` });

// bill receipt shows returns
await page.goto(`${B}/receipt/${sale._id}`);
await page.waitForSelector("text=RTN-000001");
ok(true, "bill receipt lists its returns");

// mobile view of the return screen
const s2 = await post("/api/sales", { items: [{ productId: soap._id, qty: 2 }], paymentMethod: "cash", amountPaid: 200 });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/sales");
await page.waitForSelector(`text=${s2.invoiceNo}`);
await page.click(`tr:has-text('${s2.invoiceNo}') button:has-text('Return')`);
await dlg.waitFor();
await page.waitForTimeout(300);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no sideways scroll on phone");
await page.screenshot({ path: `${out}/return-mobile.png` });

ok(nativeDialogs === 0, "no browser pop-ups used");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
