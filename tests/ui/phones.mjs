import { B, norm } from "../lib/harness.mjs";
// Browser test of phones by IMEI: settings, Phones page, selling by IMEI, returns, purchases, receipt.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const imei = (n) => {
  const body = String(35_120_000_000_000 + n).padStart(14, "0");
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return body + ((10 - (sum % 10)) % 10);
};
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
const cats = await get("/api/categories");
const phone = await post("/api/products", { name: "Infinix Hot 40", unit: "pcs", costPrice: 30000, salePrice: 34000, lowStockAlert: 1, trackSerial: true, warrantyMonths: 12, category: cats.find((c) => c.name === "Mobile Phones")._id });
await post("/api/products", { name: "Fast Charger 33W", unit: "pcs", costPrice: 600, salePrice: 1200, lowStockAlert: 2, openingStock: 10 });
await post("/api/products", { name: "Silicone Back Cover", brand: "Baseus", fits: "Infinix Hot 40, Hot 40i", unit: "pcs", costPrice: 150, salePrice: 450, lowStockAlert: 2, openingStock: 12 });
const I = Array.from({ length: 10 }, (_, i) => imei(i * 11 + 3));
await post("/api/devices", { productId: phone._id, cost: 30000, units: [{ imei: I[0], color: "Black", storage: "8/256GB", pta: "approved" }, { imei: I[1], color: "Gold", storage: "8/256GB", pta: "approved" }] });

// ---- Menu and settings
let nav = await page.locator("nav").innerText().then(norm);
ok(nav.includes("Phones (IMEI)") && !nav.includes("Production"), "menu: Phones shown, bakery Production hidden for a mobile shop");
await page.goto(B + "/settings");
await page.waitForSelector("text=Features");
const features = await page.locator("label:has-text('Mobile phones by IMEI') input[type=checkbox]").isChecked();
ok(features, "Settings → Features: IMEI phones switched on");
ok((await page.locator("select").first().inputValue()) === "mobile", "shop type shows Mobile Phone Shop");

// ---- Phones page: list, IMEI check, add phones
await page.goto(B + "/phones");
await page.waitForSelector(`text=${I[0]}`);
let t = await page.locator("main").innerText().then(norm);
ok(t.includes("Phones in stock") && t.includes(I[1]) && t.includes("Infinix Hot 40"), "Phones page lists the 2 phones in stock");
await page.fill('input[aria-label="Check IMEI"]', I[1]);
await page.click("button:has-text('Check')");
await page.waitForSelector("text=IMEI check digit OK");
t = await page.locator("main").innerText().then(norm);
ok(t.includes("Added to stock") && t.includes("Gold"), "IMEI check shows the phone and its history");
await page.fill('input[aria-label="Check IMEI"]', "111111111111111");
await page.click("button:has-text('Check')");
await page.waitForSelector("text=never been in your shop");
ok(true, "unknown IMEI: never been in your shop");
await page.click("button:has-text('Add phones')");
await dlg.waitFor();
const wrong = I[2].slice(0, 14) + ((Number(I[2][14]) + 1) % 10);
await dlg.locator('textarea[aria-label="IMEIs"]').fill(`${I[2]}\n${wrong}`);
let d = await dlg.innerText().then(norm);
ok(d.includes("2 phones") && d.includes("wrong check digit"), "add phones: counts IMEIs and warns about a wrong check digit");
await dlg.locator('textarea[aria-label="IMEIs"]').fill(`${I[2]}\n${I[2]}`);
ok((await dlg.innerText().then(norm)).includes("entered twice"), "add phones: duplicate IMEI flagged");
await dlg.locator('textarea[aria-label="IMEIs"]').fill(`${I[2]}, ${I[3]}`);
await dlg.locator('input[aria-label="Colour"]').fill("Blue");
await dlg.locator("button:has-text('Add 1 phone')").click();
await page.waitForSelector("text=1 phone added to stock");
await page.waitForSelector(`text=${I[2]}`);
ok((await get(`/api/devices?q=${I[3]}`))[0]?.color === "Blue", "phone with 2 IMEIs added (blue)");

// ---- Product form shows the IMEI switch
await page.goto(B + "/products");
await page.waitForSelector("text=Infinix Hot 40");
ok(await page.locator("tr:has-text('Infinix Hot 40') a:has-text('IMEIs')").count() === 1, "products: phone model has an IMEIs button instead of Stock");
await page.click("button:has-text('Add product')");
await dlg.waitFor();
ok(await dlg.locator('input[aria-label="Track by IMEI"]').count() === 1, "product form offers IMEI tracking");
await dlg.locator('input[aria-label="Track by IMEI"]').check();
ok(await dlg.locator('input[aria-label="Warranty months"]').count() === 1 && (await dlg.locator("text=Stock you have now").count()) === 0, "IMEI products ask for warranty, not opening stock");
await dlg.locator("button:has-text('Cancel')").click();

// ---- Billing: choose the phone by IMEI
const cust = await post("/api/parties", { type: "customer", name: "Usman", phone: "03001234567" });
await page.goto(B + "/pos");
await page.waitForSelector("text=Infinix Hot 40");
await page.fill('input[placeholder^="Scan barcode"]', "cover hot 40i");
await page.waitForFunction(() => document.querySelectorAll("main .grid > button").length === 1);
t = await page.locator("main .grid > button").innerText().then(norm);
ok(t.includes("Silicone Back Cover") && t.includes("Baseus · Fits Infinix Hot 40, Hot 40i"), "typing \"cover hot 40i\" finds the cover that fits that phone (brand and models shown)");
await page.fill('input[placeholder^="Scan barcode"]', "");
await page.waitForSelector("text=Infinix Hot 40");
await page.locator("main button:has-text('Infinix Hot 40')").first().click();
await dlg.waitFor();
await dlg.locator(`button[aria-label="IMEI ${I[2]}"]`).waitFor();
d = await dlg.innerText().then(norm);
ok(d.includes("Which Infinix Hot 40?") && d.includes(I[0]) && d.includes(I[2]), "tapping a phone asks which one (IMEI list)");
await dlg.locator(`button[aria-label="IMEI ${I[0]}"]`).click();
await page.waitForSelector(`aside >> text=IMEI ${I[0]}`);
// Scan another phone's IMEI straight into the search box.
await page.fill('input[placeholder^="Scan barcode"]', I[1]);
await page.keyboard.press("Enter");
await page.waitForSelector(`aside >> text=IMEI ${I[1]}`);
ok(true, "typing / scanning an IMEI adds that exact phone");
await page.fill('input[placeholder^="Scan barcode"]', I[1]);
await page.keyboard.press("Enter");
await page.waitForSelector("text=already on this bill");
ok(true, "the same phone cannot be added twice");
const cartPanel = page.locator("aside:has-text('Bill items')");
let cart = await cartPanel.innerText().then(norm);
ok(cart.includes("12 months warranty") && cart.includes("Rs 68,000"), "bill: 2 phones, warranty shown, total Rs 68,000");
// Customer picks only one phone after all.
await cartPanel.locator(`li:has-text('IMEI ${I[1]}') button[aria-label=Remove]`).click();
await page.click("text=Walk-in customer");
await page.click("[role=dialog] >> text=Usman");
await page.click("button:has-text('Take Payment')");
await dlg.waitFor();
await dlg.locator("button:has-text('Confirm & Save Bill')").click();
await page.waitForSelector("text=Bill saved");
const sold = await get(`/api/devices?q=${I[0]}&status=sold`);
ok(sold.length === 1 && sold[0].sale.customerName === "Usman", "phone marked sold to Usman");
const saleId = sold[0].sale.id;
await page.keyboard.press("Escape");

// ---- Receipt
await page.goto(`${B}/receipt/${saleId}`);
await page.waitForSelector(`text=IMEI: ${I[0]}`);
t = await page.locator("body").innerText().then(norm);
ok(t.includes("Warranty 12 months, till"), "receipt prints the IMEI and the warranty end date");

// ---- Return by IMEI
await page.goto(B + "/sales");
await page.waitForSelector(`text=${sold[0].sale.invoiceNo}`);
await page.click(`tr:has-text('${sold[0].sale.invoiceNo}') button:has-text('Return')`);
await page.waitForSelector("[role=dialog] >> text=Return everything");
await dlg.locator(`input[aria-label="Return IMEI ${I[0]}"]`).check();
await dlg.locator("button:has-text('Return & refund Rs 34,000')").click();
await page.waitForSelector("text=Return saved");
ok((await get(`/api/devices?q=${I[0]}`))[0]?.status === "in_stock", "returned phone is back in stock");
await page.keyboard.press("Escape");

// ---- Purchase with IMEIs
await page.goto(B + "/purchases/new");
await page.fill('input[placeholder^="Search product"]', "Infinix");
await page.locator("button:has-text('Infinix Hot 40')").first().click();
await dlg.waitFor();
await dlg.locator('textarea[aria-label="IMEIs"]').fill(`${I[5]}\n${I[6]}\n${I[7]}`);
await dlg.locator('input[aria-label="Colour"]').fill("Green");
await dlg.locator("button:has-text('Use 3 phones')").click();
await page.waitForSelector("text=3 IMEIs — change");
await page.click("button:has-text('Save purchase')");
await page.waitForURL(B + "/purchases");
const fromPurchase = await get(`/api/devices?product=${phone._id}`);
ok(fromPurchase.filter((x) => x.color === "Green" && x.source?.type === "purchase").length === 3, "purchase added 3 green phones with their IMEIs");

// ---- Phone detail: correct and remove
await page.goto(B + "/phones");
await page.waitForSelector(`text=${I[7]}`);
await page.click(`tr:has-text('${I[7]}') button:has-text('Details')`);
await dlg.waitFor();
await dlg.locator("button:has-text('Remove from stock')").click();
await dlg.locator('textarea[aria-label="Reason"]').fill("Dead on arrival, sent for claim");
await dlg.locator("button:has-text('Remove from stock')").click();
await page.waitForSelector("text=Phone removed from stock");
ok((await get(`/api/devices?q=${I[7]}&status=all`))[0]?.status === "removed", "phone removed with a reason");
await page.keyboard.press("Escape");

// ---- Phone screen on a phone
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/phones");
await page.waitForSelector(`text=${I[5]}`);
const sideways = await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1);
ok(!sideways, "Phones page fits a phone screen");
await page.screenshot({ path: `${out}/phones-mobile.png`, fullPage: true });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
