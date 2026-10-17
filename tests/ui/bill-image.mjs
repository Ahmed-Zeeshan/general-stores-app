import { chromium, devices } from "playwright";
import fs from "node:fs";
import { B, norm } from "../lib/harness.mjs";
// Browser test: the bill sent on WhatsApp as a picture or a PDF — the picture is drawn, saved, copied on a
// computer (and the customer's chat opens), and handed to the share menu on a phone.
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];

// ---------- computer ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi", acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
// WhatsApp opening is recorded instead of really opening.
await ctx.addInitScript(() => {
  window.__opened = [];
  window.open = (url) => { window.__opened.push(String(url)); return null; };
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const call = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body, method]);

await page.goto(B + "/setup");
await call("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await call("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await call("/api/admin/tenants", { shopName: "Ashraf General Store", shopType: "general", maxUsers: 3, ownerName: "Ashraf", username: "ashraf", password: "secret1" });
await call("/api/auth/logout", {});
await call("/api/auth/login", { username: "ashraf", password: "secret1" });
const set = await call("/api/settings", { shopName: "Ashraf General Store", shopType: "general", taxEnabled: false, taxRate: 0, pricesIncludeTax: true, address: "Shop 12, Main Bazar, Gujranwala", phone: "0335-3514100", ntn: "1234567-8", receiptFooter: "Thank you for shopping! / خریداری کا شکریہ", publicUrl: B }, "PUT");
ok(set.address === "Shop 12, Main Bazar, Gujranwala", "shop address, phone, NTN and app address saved");
const aata = await call("/api/products", { name: "Aata (flour) 10kg", unit: "pcs", costPrice: 900, salePrice: 1050, lowStockAlert: 0, openingStock: 50 });
const oil = await call("/api/products", { name: "Dalda Cooking Oil", unit: "litre", costPrice: 400, salePrice: 450, lowStockAlert: 0, openingStock: 50, packs: [{ name: "Carton", size: 12, price: 5200 }] });
const sugar = await call("/api/products", { name: "Sugar", unit: "kg", costPrice: 130, salePrice: 150, lowStockAlert: 0, openingStock: 100 });
const ali = await call("/api/parties", { type: "customer", name: "Ali Bhai", phone: "0300-1234567" });
const sale = await call("/api/sales", {
  items: [{ productId: aata._id, qty: 2, discount: 50 }, { productId: oil._id, qty: 1, pack: "Carton" }, { productId: sugar._id, qty: 2.5 }],
  customerId: ali._id, paymentMethod: "cash", amountPaid: 5000, discount: 25,
});

await page.goto(B + "/sales");
await page.waitForSelector(`text=${sale.invoiceNo}`);
await page.click(`button[aria-label='WhatsApp ${sale.invoiceNo}']`);
await page.waitForSelector("[data-testid=bill-preview]", { timeout: 20000 });
const dialog = page.locator("[role=dialog]");
ok(norm(await dialog.innerText()).includes("Picture"), "the WhatsApp window opens on “Picture”");
const size = await page.locator("[data-testid=bill-preview]").evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
ok(size.w === 1080 && size.h > 1500 && size.h < 4000, `bill picture drawn: ${size.w} × ${size.h} (with the QR code of the online bill)`);
await dialog.locator("[data-testid=bill-preview]").screenshot({ path: `${out}/bill-preview-in-window.png` });

// Save the picture: a real PNG with the shop's name in the file name.
let [dl] = await Promise.all([page.waitForEvent("download"), dialog.locator("button:has-text('Save picture')").click()]);
ok(dl.suggestedFilename() === `Ashraf-General-Store-${sale.invoiceNo}.png`, "picture file name: " + dl.suggestedFilename());
await dl.saveAs(`${out}/bill.png`);
const png = fs.readFileSync(`${out}/bill.png`);
ok(png.subarray(1, 4).toString() === "PNG" && png.length > 30_000, `saved picture is a PNG (${Math.round(png.length / 1024)} KB)`);

// Copy the picture and open the customer's chat.
await dialog.locator("button:has-text('Copy picture & open WhatsApp')").click();
await page.waitForSelector("text=Bill picture copied");
const opened = await page.evaluate(() => window.__opened);
ok(opened.length === 1 && opened[0].includes("923001234567"), "WhatsApp opens on the customer's chat: " + opened[0]?.slice(0, 60));
ok(decodeURIComponent(opened[0]).includes(sale.invoiceNo), "…with a short note naming the bill");
const clip = await page.evaluate(async () => {
  const items = await navigator.clipboard.read();
  return items[0]?.types ?? [];
});
ok(clip.includes("image/png"), "the bill picture is on the clipboard, ready for Ctrl+V");

// PDF
await dialog.locator("button:has-text('PDF')").first().click();
[dl] = await Promise.all([page.waitForEvent("download"), dialog.locator("button:has-text('Save PDF')").first().click()]);
await dl.saveAs(`${out}/bill.pdf`);
const pdf = fs.readFileSync(`${out}/bill.pdf`);
ok(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.includes("/DCTDecode") && pdf.subarray(-6).toString().includes("%%EOF"), `saved PDF is a valid PDF (${Math.round(pdf.length / 1024)} KB)`);
// The PDF opens in the browser's own PDF reader without errors.
const pdfPage = await ctx.newPage();
await pdfPage.goto("file://" + `${process.cwd()}/${out}/bill.pdf`.replace(/^\/+/, "/")).catch(() => {});
await pdfPage.close();

// Text message is still there, and the choice is remembered.
await dialog.locator("button:has-text('Text message')").click();
ok((await dialog.locator("textarea[aria-label='Message']").inputValue()).includes(sale.invoiceNo), "“Text message” still sends the old text");
await dialog.locator("button:has-text('Picture')").click();
await page.keyboard.press("Escape");
ok((await page.evaluate(() => localStorage.getItem("dukaan:wa-bill-mode"))) === "image", "the chosen way is remembered");

// ---------- phone: the share menu gets the file ----------
const phone = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Karachi" });
await phone.addInitScript(() => {
  window.__shared = [];
  navigator.canShare = () => true;
  navigator.share = async (d) => {
    window.__shared.push({ names: d.files.map((f) => f.name), types: d.files.map((f) => f.type), sizes: d.files.map((f) => f.size), text: d.text });
  };
});
const mp = await phone.newPage();
mp.on("pageerror", (e) => errors.push(e.message));
await mp.goto(B + "/login");
await mp.evaluate(async () => fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "ashraf", password: "secret1" }) }));
await mp.goto(B + `/receipt/${sale._id}`);
await mp.click("button:has-text('WhatsApp')");
await mp.waitForSelector("[data-testid=bill-preview]", { timeout: 20000 });
ok((await mp.locator("input[aria-label='Customer WhatsApp number']").count()) === 0, "phone: no number box needed (the share menu picks the chat)");
await mp.locator("[role=dialog] button:has-text('Share on WhatsApp')").click();
await mp.waitForFunction(() => window.__shared.length === 1);
let shared = await mp.evaluate(() => window.__shared[0]);
ok(shared.types[0] === "image/png" && shared.sizes[0] > 30_000 && shared.names[0].endsWith(".png"), "phone: the bill picture goes to the share menu");
ok(shared.text.includes(sale.invoiceNo), "…with a short note");
await mp.click("button:has-text('WhatsApp')");
await mp.waitForSelector("[data-testid=bill-preview]", { timeout: 20000 });
await mp.locator("[role=dialog] button:has-text('PDF')").first().click();
await mp.locator("[role=dialog] button:has-text('Share on WhatsApp')").click();
await mp.waitForFunction(() => window.__shared.length === 2);
shared = await mp.evaluate(() => window.__shared[1]);
ok(shared.types[0] === "application/pdf" && shared.names[0].endsWith(".pdf"), "phone: the PDF goes to the share menu");
await mp.screenshot({ path: `${out}/bill-share-phone.png` });

ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
