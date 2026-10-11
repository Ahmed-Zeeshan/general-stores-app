import { B, norm } from "../lib/harness.mjs";
// Browser test: buying a used phone from a customer (form, IMEI history warning, agreement print).
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const imei = (n) => {
  const body = String(35_400_000_000_000 + n).padStart(14, "0");
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
const model = await post("/api/products", { name: "Oppo A78 128GB", unit: "pcs", costPrice: 40000, salePrice: 48000, lowStockAlert: 0, trackSerial: true });
const I = [imei(1), imei(22)];
// This phone was sold by the shop before.
await post("/api/devices", { productId: model._id, cost: 40000, units: [{ imei: I[1] }] });
const dev = (await get(`/api/devices?q=${I[1]}`))[0];
await post("/api/sales", { items: [{ productId: model._id, qty: 1, serials: [dev._id] }], paymentMethod: "cash" });

let nav = await page.locator("nav").innerText().then(norm);
ok(nav.includes("Used Phones Bought"), "menu has Used Phones Bought");
await page.goto(B + "/used-phones/new");
await page.waitForSelector("text=Buy a Used Phone");
await page.fill('input[aria-label="Seller name"]', "Imran Khan");
await page.fill('input[aria-label="Seller CNIC"]', "3520212345671");
await page.locator('input[aria-label="Seller mobile"]').click();
ok((await page.inputValue('input[aria-label="Seller CNIC"]')) === "35202-1234567-1", "CNIC formats itself to 35202-1234567-1");
await page.fill('input[aria-label="Seller mobile"]', "0300-1112223");
await page.selectOption('select[aria-label="Phone model"]', model._id);
await page.fill('input[aria-label="IMEI"]', I[1]);
await page.waitForSelector("text=Your shop sold this phone");
ok(true, "IMEI sold before: the form says when and on which bill");
await page.fill('input[aria-label="IMEI"]', I[0]);
await page.waitForSelector("text=never been in your shop");
ok(true, "new IMEI: never been in the shop, check digit OK");
await page.fill('input[aria-label="Colour"]', "Black");
await page.locator("label:has-text('Body / frame OK') input").uncheck();
await page.fill('input[aria-label="Battery health"]', "88");
await page.locator("label:has-text('Box') input").check();
await page.fill('input[aria-label="Price paid"]', "36000");
await page.fill('input[aria-label="Sale price"]', "43000");
ok((await page.locator("main").innerText().then(norm)).includes("Profit when sold: Rs 7,000"), "shows profit when sold (Rs 7,000)");
await page.click("button:has-text('Save & print agreement')");
await page.waitForSelector("text=Read the declaration");
ok(true, "cannot save until the seller's declaration is ticked");
await page.locator('input[aria-label="Seller declaration"]').check();
const popupP = ctx.waitForEvent("page");
await page.click("button:has-text('Save & print agreement')");
const agreement = await popupP;
await agreement.addInitScript(() => { window.print = () => {}; });
await page.waitForURL(B + "/used-phones");
await agreement.waitForSelector("text=Used Mobile Purchase Agreement");
const a = await agreement.locator("body").innerText().then(norm);
ok(a.includes("Imran Khan") && a.includes("35202-1234567-1") && a.includes(I[0]) && a.includes("Rs 36,000") && a.includes("Thirty-Six Thousand Rupees Only"), "agreement: seller, CNIC, IMEI, price in figures and words");
ok(a.includes("Not OK: Body / frame") && a.includes("88%") && a.includes("Thumb impression"), "agreement: checks, battery, signature and thumb boxes");
await agreement.screenshot({ path: `${out}/used-agreement.png`, fullPage: true });
await agreement.close();

await page.waitForSelector("text=BUY-000001");
let t = await page.locator("main").innerText().then(norm);
ok(t.includes("Imran Khan") && t.includes("35202-1234567-1") && t.includes("Rs 36,000"), "list shows the purchase");
const d0 = (await get(`/api/devices?q=${I[0]}`))[0];
ok(d0?.status === "in_stock" && d0.price === 43000 && d0.condition === "used", "phone is in stock at Rs 43,000 for resale");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/used-phones/new");
await page.waitForSelector("text=Buy a Used Phone");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "buy form fits a phone screen");
await page.screenshot({ path: `${out}/used-phone-form-mobile.png`, fullPage: true });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
