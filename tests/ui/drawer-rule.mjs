import { chromium } from "playwright";
import { B, norm } from "../lib/harness.mjs";
// Browser test: the owner switches on "bills only with an open cash drawer"; New Bill then asks to open
// the drawer at Take Payment and carries on to the payment.
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const call = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) })).json(), [path, body, method]);

await page.goto(B + "/setup");
await call("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await call("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await call("/api/admin/tenants", { shopName: "Drawer Store", shopType: "general", maxUsers: 3, ownerName: "Hamid", username: "hamid", password: "secret1" });
await call("/api/auth/logout", {});
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "hamid");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
await call("/api/products", { name: "Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 0, openingStock: 100 });

// Owner switches the rule on in Settings.
await page.goto(B + "/settings");
await page.waitForSelector("text=Make bills only when the cash drawer is open");
await page.click("label:has-text('Make bills only when the cash drawer is open') input[type=checkbox]");
await page.click("button:has-text('Save settings')");
await page.waitForSelector("text=Settings saved");
ok((await call("/api/settings", undefined, "GET")).requireOpenDrawer === true, "Settings: rule switched on and saved");

// New Bill: told to open the drawer; Take Payment opens it first.
await page.goto(B + "/pos");
await page.waitForSelector("button:has-text('Soap')");
await page.waitForSelector("text=Open the drawer to make bills");
ok(true, "New Bill shows “Open the drawer to make bills”");
await page.click("button:has-text('Soap')");
await page.click("button:has-text('Take Payment')");
await page.waitForSelector("text=Open the cash drawer first");
ok((await page.locator("text=Total to pay").count()) === 0, "Take Payment asks to open the drawer before the payment");
await page.screenshot({ path: `${out}/drawer-rule-ask.png` });
await page.fill("input[aria-label='Opening cash']", "3000");
await page.click("button:has-text('Open drawer & continue')");
await page.waitForSelector("text=Total to pay");
ok(true, "drawer opened → payment window opens straight away");
const cur = await call("/api/shifts/current", undefined, "GET");
ok(cur.shift && cur.shift.openingCash === 3000, "drawer open with Rs 3,000 counted");
await page.click("[role=dialog] button:has-text('Confirm & Save Bill')");
await page.waitForSelector("text=Bill saved");
ok(true, "bill saved");
await page.keyboard.press("Escape");
ok((await page.locator("text=Open the drawer to make bills").count()) === 0, "the warning is gone once the drawer is open");

// The drawer is closed from another computer: the next bill asks again instead of failing.
await call(`/api/shifts/${cur.shift._id}/close`, { denominations: [{ value: 1000, count: 3 }, { value: 100, count: 1 }] });
await page.click("button:has-text('Soap')");
await page.click("button:has-text('Take Payment')");
await page.click("[role=dialog] button:has-text('Confirm & Save Bill')");
await page.waitForSelector("text=Open the cash drawer first");
ok(true, "drawer closed elsewhere: saving the bill asks to open the drawer (nothing lost)");
await page.fill("input[aria-label='Opening cash']", "500");
await page.click("button:has-text('Open drawer & continue')");
await page.waitForSelector("text=Total to pay");
await page.click("[role=dialog] button:has-text('Confirm & Save Bill')");
await page.waitForSelector("text=Bill saved");
ok(true, "…and the bill is saved after opening it");

// Urdu
await page.evaluate(() => localStorage.setItem("dukaan:lang", "ur"));
await page.goto(B + "/settings");
await page.waitForSelector("text=بل صرف تب بنیں جب کیش دراز کھلا ہو");
ok(true, "Urdu: the setting is translated");

ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
