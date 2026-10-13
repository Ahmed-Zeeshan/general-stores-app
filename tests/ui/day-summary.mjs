import { B } from "../lib/harness.mjs";
// Browser test: the end-of-day WhatsApp summary for the owner (dashboard) and the day-close message.
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

// Settings: owner's own WhatsApp number
await page.goto(B + "/settings");
await page.fill('input[aria-label="Owner\'s WhatsApp number"]', "0333-9998887");
await page.click("button:has-text('Save settings')");
await page.waitForSelector("text=Settings saved");

const soap = await post("/api/products", { name: "Lux Soap", unit: "pcs", costPrice: 80, salePrice: 110, lowStockAlert: 0, openingStock: 50 });
const cust = await post("/api/parties", { type: "customer", name: "Shahid", phone: "0321-1234567" });
await post("/api/shifts", { openingCash: 1000 });
await post("/api/sales", { items: [{ productId: soap._id, qty: 10 }], paymentMethod: "cash" });
await post("/api/sales", { items: [{ productId: soap._id, qty: 2 }], paymentMethod: "credit", customerId: cust._id });
await post("/api/expenses", { category: "Tea", amount: 150, method: "cash" });

// ---- Dashboard summary
await page.goto(B + "/");
await page.click("button:has-text(\"Send today's summary\")");
await page.locator('textarea[aria-label="Summary message"]').waitFor();
const msg = await page.inputValue('textarea[aria-label="Summary message"]');
ok((await page.inputValue('input[aria-label="Send to number"]')) === "0333-9998887", "goes to the owner's number from Settings");
ok(msg.includes("*Bismillah Store* — din ka hisaab") && msg.includes("Sale: *Rs 1,320* (2 bill)") && msg.includes("Kharchay: Rs 150"), "summary: sales Rs 1,320 in 2 bills, expenses Rs 150");
ok(msg.includes("*Khalis munafa: Rs 210*") && msg.includes("Udhaar diya: Rs 220"), "net profit Rs 210 (12 × 30 − 150), udhaar given Rs 220");
ok(msg.includes("Cash daraz:") && msg.includes("abhi khula hai") && msg.includes("1. Lux Soap — Rs 1,320"), "drawer still open; best seller listed");
await page.click("[role=dialog] button:has-text('Open WhatsApp')");
await page.waitForTimeout(400);
ok(await waSeen((l) => l.includes("923339998887") && l.includes("din ka hisaab")), "WhatsApp opened to the owner");

// ---- Day close message
await page.goto(B + "/drawer");
await page.click("button:has-text('Close day')");
await page.waitForSelector("text=Close day — count the cash");
await page.click("[role=dialog] button:has-text('Enter total')");
await page.fill("input[aria-label='Counted cash']", "1900");
await page.click("[role=dialog] button:has-text('Close day')");
await page.waitForSelector("[role=alertdialog]");
await page.click("[role=alertdialog] button:has-text('Close day')");
await page.waitForSelector("text=Day closed");
await page.click("button:has-text('Send to the owner on WhatsApp')");
await page.locator('textarea[aria-label="Summary message"]').waitFor();
const z = await page.inputValue('textarea[aria-label="Summary message"]');
ok(z.includes("din band") && z.includes("Daraz mein hona chahiye: Rs 1,950") && z.includes("Gina gaya: Rs 1,900") && z.includes("*Kam: Rs 50*"), "day close: should be Rs 1,950, counted Rs 1,900, short Rs 50");
await page.screenshot({ path: `${out}/day-close-whatsapp.png` });

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
