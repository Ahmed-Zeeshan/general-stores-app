import { chromium } from "playwright";
import { B, norm } from "../lib/harness.mjs";
// Browser test for the pricing tools: a customer's special prices, discount on one item, price history,
// bulk price update and correcting a saved bill.
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const call = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) })).json(), [path, body, method]);
const get = (path) => page.evaluate(async (p) => (await fetch(p)).json(), path);
const body = async () => norm(await page.locator("main").innerText());

await page.goto(B + "/setup");
await call("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await call("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await call("/api/admin/tenants", { shopName: "Rate Store", shopType: "general", maxUsers: 3, ownerName: "Imran", username: "imran", password: "secret1" });
await call("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "imran");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");

const sugar = await call("/api/products", { name: "Sugar", unit: "kg", costPrice: 100, salePrice: 120, lowStockAlert: 0, openingStock: 100 });
const cola = await call("/api/products", { name: "Cola", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 0, openingStock: 100 });
const ali = await call("/api/parties", { type: "customer", name: "Ali Bhai", phone: "03001234567" });
await call("/api/shifts", { openingCash: 1000 });

// ---- Special prices on the customer page
await page.goto(B + `/customers/${ali._id}`);
await page.click("button:has-text('Special prices')");
await page.waitForSelector("text=No special prices");
ok(true, "Special prices tab: empty at first");
await page.fill("input[aria-label='Add special price item']", "Sug");
await page.click("ul >> button:has-text('Sugar')");
const sugarInput = page.locator("input[aria-label='Special price for Sugar']");
ok((await sugarInput.inputValue()) === "120", "item added at its normal price");
ok((await page.locator("text=Not saved yet").count()) === 1, "shows it is not saved yet");
await sugarInput.fill("100");
await page.waitForSelector("text=Rs 20 less");
ok(true, "shows “Rs 20 less” beside the special price");
await page.screenshot({ path: `${out}/special-prices.png` });
await page.click("button:has-text('Save special prices')");
await page.waitForSelector("text=Special prices saved");
await page.waitForFunction(() => !document.body.innerText.includes("Not saved yet"));
const saved = await get(`/api/parties/${ali._id}/prices`);
ok(saved.length === 1 && saved[0].price === 100, "saved: Sugar Rs 100 for Ali");

// ---- New Bill: the special price comes in by itself; discount on one item
await page.goto(B + "/pos");
await page.waitForSelector("button:has-text('Sugar')");
const cart = page.locator("aside:has-text('Bill items')");
await page.click("text=Walk-in customer");
await page.waitForSelector("[role=dialog] >> text=Ali Bhai");
await page.click("[role=dialog] >> text=Ali Bhai");
await page.waitForTimeout(400);
// Loose item: "Rs 500 of sugar" works at Ali's price.
await page.click("button:has-text('Sugar')");
await page.waitForSelector("[role=dialog] >> text=Price:");
ok(norm(await page.locator("[role=dialog]").innerText()).includes("Rs 100"), "weight box shows Ali's price Rs 100 / kg");
await page.click("[role=dialog] button:has-text('By Rupees')");
await page.fill("[role=dialog] input[type=number]", "500");
ok(norm(await page.locator("[role=dialog]").innerText()).includes("5 Kg = Rs 500"), "Rs 500 of sugar = 5 kg at the special price: " + norm(await page.locator("[role=dialog]").innerText()).replace(/\n/g, " / "));
await page.click("[role=dialog] button:has-text('Add to bill')");
await page.click("button:has-text('Cola')");
await page.waitForTimeout(300);
let ct = norm(await cart.innerText());
ok(/Sugar\s+Rs 100 \/ Kg\s+Special price/.test(ct), "picking Ali puts sugar at the special Rs 100 with a “Special price” tag: " + ct.replace(/\n/g, " / ").slice(0, 300));
await cart.locator("button[aria-label='Give discount on Cola']").click();
await cart.locator("input[aria-label='Discount on Cola']").fill("15");
await page.waitForTimeout(200);
ct = norm(await cart.innerText());
ok(ct.includes("Rs 85"), "Cola line: 100 − 15 = Rs 85");
await cart.locator("input[aria-label='Discount on Cola']").fill("500");
await page.waitForTimeout(200);
ok((await cart.locator("input[aria-label='Discount on Cola']").inputValue()) === "100", "item discount can't be more than the line (500 → 100)");
await cart.locator("input[aria-label='Discount on Cola']").fill("15");
await page.screenshot({ path: `${out}/special-pos.png` });
await page.click("text=Take Payment");
await page.click("[role=dialog] button:has-text('Confirm & Save Bill')");
await page.waitForSelector("text=Bill saved");
await page.keyboard.press("Escape");
let sales = await get("/api/sales?from=2000-01-01&to=2100-01-01");
const bill = sales[0];
ok(bill.total === 585 && bill.items.find((i) => i.name === "Sugar").qty === 5 && bill.items.find((i) => i.name === "Sugar").special === true && bill.items.find((i) => i.name === "Cola").discount === 15, "bill saved: Rs 585 (5 kg sugar at 100, cola 100 − 15)");

// ---- Products: price history and bulk update
await page.goto(B + "/products");
await page.waitForSelector("tr:has-text('Sugar')");
await page.locator("tr:has-text('Sugar') button[aria-label='Price history']").click();
await page.waitForSelector("text=Price history — Sugar");
ok(norm(await page.locator("[role=dialog]").innerText()).includes("New item"), "price history shows the first price (New item)");
await page.keyboard.press("Escape");
await page.click("button:has-text('Update prices')");
await page.waitForSelector("text=Type how much to change the prices");
await page.fill("input[aria-label='Change by']", "10");
await page.waitForSelector("text=2 prices will change");
let dlg = norm(await page.locator("[role=dialog]").innerText());
ok(dlg.includes("Rs 132") && dlg.includes("Rs 110"), "preview: Sugar 120 → 132, Cola 100 → 110");
await page.locator("[role=dialog] button:has-text('Rs 5')").click();
await page.waitForTimeout(600);
dlg = norm(await page.locator("[role=dialog]").innerText());
ok(dlg.includes("Rs 130"), "rounded to Rs 5: 132 → 130");
await page.screenshot({ path: `${out}/bulk-prices.png` });
await page.click("[role=dialog] button:has-text('Change 2 prices')");
await page.waitForSelector("text=Change 2 prices?");
await page.locator("[role=alertdialog] button:has-text('Change prices')").click();
await page.waitForSelector("text=2 prices changed");
ok((await get(`/api/products/${sugar._id}`)).product.salePrice === 130, "Sugar is now Rs 130");
await page.waitForTimeout(500);
await page.locator("tr:has-text('Sugar') button[aria-label='Price history']").click();
await page.waitForSelector("text=Bulk price update");
dlg = norm(await page.locator("[role=dialog]").innerText());
ok(dlg.includes("Imran") && dlg.includes("Rs 130"), "price history shows the bulk change by Imran");
await page.screenshot({ path: `${out}/price-history.png` });
await page.keyboard.press("Escape");

// ---- Sales History: correct the bill
await page.goto(B + "/sales");
await page.waitForSelector(`text=${bill.invoiceNo}`);
await page.click(`button[aria-label='Correct ${bill.invoiceNo}']`);
await page.waitForSelector(`text=Correct bill ${bill.invoiceNo}?`);
await page.click("[role=alertdialog] button:has-text('Correct this bill')");
await page.waitForURL(B + "/pos");
await page.waitForSelector(`text=Correcting bill ${bill.invoiceNo}`);
ct = norm(await cart.innerText());
ok(ct.includes("Sugar") && ct.includes("Cola") && ct.includes("Rs 585"), "New Bill opens with the same items and total: " + ct.slice(0, 200).replace(/\n/g, " / "));
ok(norm(await page.locator("aside").first().innerText()).includes("Ali Bhai") || (await page.locator("text=Ali Bhai").count()) > 0, "…and the same customer");
await page.screenshot({ path: `${out}/correct-pos.png` });
// Fix the mistake: 2 colas, not 1.
await cart.locator("li:has-text('Cola') button[aria-label='Increase']").click();
await page.waitForTimeout(200);
await page.click("text=Take Payment");
await page.click("[role=dialog] button:has-text('Confirm & Save Bill')");
await page.waitForSelector("text=Bill saved");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
ok((await page.locator("text=Correcting bill").count()) === 0, "banner gone after saving");
sales = await get("/api/sales?from=2000-01-01&to=2100-01-01");
const fixed = sales.find((s) => s.correctionOf?.invoiceNo === bill.invoiceNo);
ok(fixed && fixed.total === 685, "corrected bill saved and linked, at the prices of the old bill (500 + 2 × 100 − 15 = 685): " + fixed?.total);
await page.goto(B + "/sales");
await page.waitForSelector(`text=Correction of ${bill.invoiceNo}`);
ok((await page.locator(`text=Corrected → ${fixed?.invoiceNo}`).count()) === 1, "Sales History shows both links");
ok((await page.locator(`button[aria-label='Correct ${bill.invoiceNo}']`).count()) === 0, "the returned bill has no Correct button");
await page.screenshot({ path: `${out}/correct-sales.png` });

// ---- Urdu
await page.evaluate(() => localStorage.setItem("dukaan:lang", "ur"));
await page.goto(B + `/customers/${ali._id}`);
await page.click("button:has-text('خاص ریٹ')");
await page.waitForSelector("text=خاص ریٹ محفوظ کریں");
ok(!(await body()).includes("Special price"), "Urdu: special prices tab translated");
await page.goto(B + "/sales");
await page.waitForSelector(`text=${bill.invoiceNo}`);
ok((await body()).includes("درستی"), "Urdu: correction badge translated");
await page.evaluate(() => localStorage.setItem("dukaan:lang", "en"));

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
