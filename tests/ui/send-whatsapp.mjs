import { B, norm } from "../lib/harness.mjs";
// Browser test: sending a bill on WhatsApp (with a link when the app has a public address) and the
// customer opening the link without logging in.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
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
await post("/api/admin/tenants", { shopName: "Bismillah Store", shopType: "general", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret1", phone: "0300-5556667" });
await post("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "bilal");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
await post("/api/settings", { shopName: "Bismillah Store", shopType: "general", taxEnabled: false, taxRate: 0, pricesIncludeTax: true, phone: "0300-5556667", address: "Main Bazar, Sialkot", publicUrl: B }, "PUT");
await post("/api/products", { name: "Lux Soap", unit: "pcs", costPrice: 80, salePrice: 110, lowStockAlert: 0, openingStock: 50 });
await post("/api/parties", { type: "customer", name: "Shahid", phone: "0321-1234567" });

// ---- Bill → WhatsApp from the Bill saved screen
await page.goto(B + "/pos");
await page.click("button:has-text('Lux Soap')");
await page.click("button:has-text('Lux Soap')");
await page.click("text=Walk-in customer");
await page.click("[role=dialog] >> text=Shahid");
await page.click("button:has-text('Take Payment')");
await dlg.waitFor();
await dlg.locator("button:has-text('Confirm & Save Bill')").click();
await page.waitForSelector("text=Bill saved");
await page.click("button:has-text('Send bill on WhatsApp')");
await page.waitForSelector("text=Send the bill on WhatsApp");
// The window opens on "Picture" (tested in bill-image.mjs); this test sends the text message.
await page.click("[role=dialog] button:has-text('Text message')");
await page.locator('textarea[aria-label="Message"]').waitFor();
ok((await page.inputValue('input[aria-label="Customer WhatsApp number"]')) === "0321-1234567", "customer's number filled in");
const msg = await page.inputValue('textarea[aria-label="Message"]');
ok(msg.includes("INV-000001") && msg.includes("Lux Soap × 2 — Rs 220") && msg.includes("*Kul: Rs 220*") && msg.includes(`Bill dekhein: ${B}/r/s-`), "message: bill no, items, total and the link");
await page.click("[role=dialog] button:has-text('Open WhatsApp')");
await page.waitForTimeout(400);
ok(await waSeen((l) => l.includes("923211234567") && l.includes("INV-000001")), "WhatsApp opened for 0321-1234567 with the bill");
const link = msg.match(/Bill dekhein: (\S+)/)[1];

// ---- The customer opens the link (no login)
const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
const gp = await guest.newPage();
await gp.goto(link);
await gp.waitForSelector("text=Bill INV-000001");
let t = await gp.locator("body").innerText().then(norm);
ok(t.includes("Bismillah Store") && t.includes("Main Bazar, Sialkot") && t.includes("Lux Soap") && t.includes("Rs 220"), "customer sees the shop and the bill without logging in");
ok(!(await gp.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "bill page fits the customer's phone");
await gp.screenshot({ path: `${out}/customer-bill.png`, fullPage: true });
await gp.goto(link.slice(0, -2) + "xx");
await gp.waitForSelector("text=This link is not valid.");
ok(true, "a changed link shows 'not valid'");
await gp.goto(B + "/");
await gp.waitForURL(/\/login/);
ok(true, "the rest of the app still needs a login");
await guest.close();

// ---- From Sales History, a walk-in bill: type the number
await post("/api/sales", { items: [{ productId: (await page.evaluate(async () => (await (await fetch("/api/products")).json())[0]._id)), qty: 1 }], paymentMethod: "cash" });
await page.goto(B + "/sales");
await page.click("button[aria-label='WhatsApp INV-000002']");
await page.locator('textarea[aria-label="Message"]').waitFor();
ok((await page.locator("[role=dialog] button:has-text('Open WhatsApp')").isDisabled()), "walk-in bill: asks for a number first");
await page.fill('input[aria-label="Customer WhatsApp number"]', "0345 1234567");
await page.click("[role=dialog] button:has-text('Open WhatsApp')");
await page.waitForTimeout(400);
ok(await waSeen((l) => l.includes("923451234567") && l.includes("INV-000002")), "sent to the typed number");

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
