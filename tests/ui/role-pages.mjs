import { chromium } from "playwright";
import { B, norm } from "../lib/harness.mjs";
// Browser test: a page a role may not use, opened by typing its address, says so (instead of loading forever),
// and the pages the role may use still open.
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: "Asia/Karachi" });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const call = (path, body) => page.evaluate(async ([p, b]) => (await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body]);
const main = async () => norm(await page.locator("main").innerText());

await page.goto(B + "/setup");
await call("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await call("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await call("/api/admin/tenants", { shopName: "Role Store", shopType: "general", maxUsers: 4, ownerName: "Rashid", username: "rashid", password: "secret1" });
await call("/api/auth/logout", {});
await call("/api/auth/login", { username: "rashid", password: "secret1" });
await call("/api/users", { name: "Naveed", username: "naveed", password: "secret2", role: "manager" });
await call("/api/users", { name: "Kashif", username: "kashif", password: "secret3", role: "cashier" });

async function as(username, password) {
  await call("/api/auth/logout", {});
  await page.evaluate(() => localStorage.clear());
  await call("/api/auth/login", { username, password });
}

await as("kashif", "secret3");
for (const p of ["/reports", "/expenses", "/purchases", "/udhaar", "/activity", "/settings", "/suppliers"]) {
  await page.goto(B + p);
  await page.waitForSelector("text=You can't open this page", { timeout: 15000 }).catch(() => {});
  const t = await main();
  ok(t.includes("You can't open this page") && t.includes(p === "/activity" || p === "/settings" ? "only for the shop owner" : "only for the owner or a manager"), `cashier opening ${p}: told it is not for them`);
}
for (const [p, text] of [["/pos", "Bill items"], ["/sales", "Sales History"], ["/customers", "Customers"]]) {
  await page.goto(B + p);
  await page.waitForSelector(`text=${text}`);
  ok(!(await main()).includes("You can't open this page"), `cashier can still open ${p}`);
}

await as("naveed", "secret2");
for (const p of ["/activity", "/settings"]) {
  await page.goto(B + p);
  await page.waitForSelector("text=You can't open this page", { timeout: 15000 }).catch(() => {});
  ok((await main()).includes("only for the shop owner"), `manager opening ${p}: told it is only for the owner`);
}
await page.goto(B + "/reports");
await page.waitForTimeout(1500);
ok(!(await main()).includes("You can't open this page"), "manager can open /reports");

await as("rashid", "secret1");
await page.goto(B + "/settings");
await page.waitForTimeout(1500);
ok(!(await main()).includes("You can't open this page"), "owner can open /settings");

await page.evaluate(() => localStorage.setItem("dukaan:lang", "ur"));
await as("kashif", "secret3");
await page.evaluate(() => localStorage.setItem("dukaan:lang", "ur"));
await page.goto(B + "/reports");
await page.waitForSelector("text=آپ یہ صفحہ نہیں کھول سکتے");
ok(true, "Urdu: the message is translated");

ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
