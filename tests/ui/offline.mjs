import { chromium } from "playwright";
import { B, startServer, stopServer } from "../lib/harness.mjs";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "ahmed");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
await page.goto(B + "/pos");
await page.waitForSelector("button:has-text('Olpers 1L')");
// Let the service worker take control and cache the page + chunks, then reload once so it is controlled.
await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready);
await page.reload();
await page.waitForSelector("button:has-text('Olpers 1L')");
await page.waitForTimeout(1500);
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker controls the POS page");
// open customer picker once online so customers get saved
await page.click("text=Walk-in customer");
await page.waitForSelector("text=Bilal");
await page.keyboard.press("Escape");

console.log("-- stopping the app server");
await stopServer();
await page.reload();
await page.waitForSelector("button:has-text('Olpers 1L')", { timeout: 15000 });
ok(true, "POS page opens with the server stopped");
ok(await page.locator("text=Offline mode").count() > 0, "offline mode badge shown");
await page.screenshot({ path: `${out}/01-offline-pos.png` });

// Sale 1: cash, 2 milk
await page.click("button:has-text('Olpers 1L')");
await page.click("button:has-text('Olpers 1L')");
await page.click("text=Take Payment");
await page.fill('input[placeholder="600"]', "1000");
await page.click("text=Confirm & Save Bill");
await page.waitForSelector("text=Bill saved on this device");
ok(await page.locator("text=Rs 400").count() > 0, "change Rs 400 shown offline");
await page.screenshot({ path: `${out}/02-offline-saved.png` });
const [rc] = await Promise.all([page.waitForEvent("popup"), page.click("button:has-text('Print')")]);
ok((await rc.content()).includes("OFFLINE BILL"), "offline receipt can be printed");
await rc.close();
await page.click("text=Next bill");

// Sale 2: udhaar for cached customer
await page.click("button:has-text('Olpers 1L')");
await page.click("text=Walk-in customer");
await page.click("button:has-text('Bilal')");
await page.click("text=Take Payment");
await page.click("[role=dialog] button:has-text('Udhaar')");
await page.click("text=Confirm & Save Bill");
await page.waitForSelector("text=Bill saved on this device");
await page.click("text=Next bill");
ok(await page.locator("button:has-text('2 waiting')").count() > 0, "2 bills waiting");
ok(await page.locator("button:has-text('Olpers 1L') >> text=Stock: 7").count() > 0, "local stock reduced to 7");
await page.screenshot({ path: `${out}/03-offline-waiting.png` });

console.log("-- starting the app server again");
await startServer();
await page.waitForSelector("text=offline bill(s) sent", { timeout: 40000 });
ok(true, "bills synced automatically");
await page.waitForTimeout(1000);
ok(await page.locator("button:has-text('waiting')").count() === 0, "outbox empty after sync");
await page.screenshot({ path: `${out}/04-synced.png` });

const sales = await page.evaluate(async () => (await fetch("/api/sales")).json());
const off = sales.filter((s) => s.offline);
ok(off.length === 2, "server has 2 offline bills (" + off.length + ")");
ok(off.some((s) => s.creditAmount === 300 && s.customerName === "Bilal"), "udhaar bill recorded for Bilal");
ok(off.some((s) => s.total === 600 && s.change === 400), "cash bill recorded with change");
const p = await page.evaluate(async () => (await fetch("/api/products?q=Olpers")).json());
ok(p[0].stock === 7, "server stock now 7");
const cust = await page.evaluate(async () => (await fetch("/api/parties?type=customer")).json());
ok(cust[0].balance === 300, "Bilal's khata is 300");
// idempotency: resend same clientId
const again = await page.evaluate(async (s) => (await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ productId: s.items[0].product, qty: 1 }], paymentMethod: "cash", clientId: s.clientId, soldAt: new Date().toISOString() }) })).json(), off[0]);
ok(again._id === off[0]._id, "re-sending the same bill returns the existing one (no duplicate)");
const count = (await page.evaluate(async () => (await fetch("/api/sales")).json())).length;
ok(count === 2, "still exactly 2 bills");
console.log("page errors:", errors);
await browser.close();
