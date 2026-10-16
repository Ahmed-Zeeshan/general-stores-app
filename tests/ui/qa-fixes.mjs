import { B, norm } from "../lib/harness.mjs";
// Browser test for the QA report: customer cards and search, phone check, drawer status, product names,
// P&L signs, plurals, the 404 page, the first screen after login, and Urdu on the customers page.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const posts = []; page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/parties") && posts.push(r.url()));
const post = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body, method]);
const text = async (sel) => norm(await page.locator(sel).first().innerText());
const card = (label) => page.locator(`div.p-5:has(p:text-is("${label}"))`).first();

await page.goto(B + "/setup");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "Ashraf Store", shopType: "general", maxUsers: 3, ownerName: "Ashraf", username: "ashraf001", password: "secret1" });
await post("/api/auth/logout", {});

// ---- First screen after login: drawn straight away from the login answer
await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "ashraf001");
await page.fill('input[type="password"]', "secret1");
let meCalls = 0;
page.on("request", (r) => r.url().endsWith("/api/auth/me") && meCalls++);
const t0 = Date.now();
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
await page.waitForSelector("text=Ashraf Store");
ok(Date.now() - t0 < 5000, `dashboard menu shown ${Date.now() - t0} ms after pressing Log in`);
ok(await page.evaluate(() => !!localStorage.getItem("dukaan:me")), "login details saved for the first screen");

const soap = await post("/api/products", { name: "Aata (flour)", nameUrdu: "Aata (flour) burhan", brand: "Aata (flour)", unit: "pcs", costPrice: 80, salePrice: 600, lowStockAlert: 0, openingStock: 50 });
await post("/api/parties", { type: "customer", name: "Danish", phone: "03491234567", openingBalance: 500 });
await post("/api/parties", { type: "customer", name: "Bilal", phone: "03001234567" });

// ---- Drawer status: dashboard checklist and New Bill agree
await page.goto(B + "/");
await page.waitForSelector("text=Get your shop ready");
const stepDone = async () => (await page.locator("div.text-sm.font-semibold:text-is('Open the cash drawer')").getAttribute("class")).includes("line-through");
ok(!(await stepDone()), "no drawer open: checklist step not ticked");
await page.goto(B + "/pos");
await page.waitForSelector("text=Drawer not open");
ok(true, "…and New Bill says the drawer is not open");
await post("/api/shifts", { openingCash: 1000 });
await page.goto(B + "/");
await page.waitForSelector("text=Get your shop ready");
ok(await stepDone(), "drawer opened: checklist step ticked");
await page.goto(B + "/pos");
await page.waitForSelector("input[placeholder*='Scan barcode']");
await page.waitForTimeout(800);
ok((await page.locator("text=Drawer not open").count()) === 0, "…and New Bill no longer says it is not open");

// ---- Product name not repeated
const tile = norm(await page.locator("button:has-text('Aata (flour)')").first().innerText());
ok(tile.includes("burhan") && tile.split("Aata (flour)").length === 2, "New Bill tile: name once, extra name shows only “burhan”: " + tile.replace(/\n/g, " / "));
await page.goto(B + "/products");
await page.waitForSelector("text=Aata (flour)");
const row = norm(await page.locator("tr:has-text('Aata (flour)')").first().innerText());
ok(row.split("Aata (flour)").length === 2 && row.includes("burhan"), "Products list: name not repeated");

// ---- Customers: totals ignore the search; empty states
await page.goto(B + "/customers");
await page.waitForSelector("text=Danish");
ok(norm(await card("Total customers").innerText()).includes("2"), "Total customers 2");
ok(norm(await card("Udhaar to collect").innerText()).includes("Rs 500") && norm(await card("Udhaar to collect").innerText()).includes("1 customer") && !norm(await card("Udhaar to collect").innerText()).includes("1 customers"), "Udhaar to collect Rs 500 · “1 customer” (singular)");
await page.fill("input[aria-label='Search by name or phone']", "zzzz");
await page.waitForSelector("text=No customers match your search");
ok(norm(await card("Total customers").innerText()).includes("2") && norm(await card("Udhaar to collect").innerText()).includes("Rs 500"), "searching zzzz: the cards still show the whole shop");
ok((await page.locator("text=Add regular customers").count()) === 0, "no-match message, not the “add customers” one");
await page.click("button:has-text('Clear search')");
await page.waitForSelector("text=Bilal");
ok((await page.inputValue("input[aria-label='Search by name or phone']")) === "", "Clear search empties the box and shows everyone");
await page.fill("input[aria-label='Search by name or phone']", "0349");
await page.waitForFunction(() => !document.body.innerText.includes("Bilal"));
ok(norm(await card("Total customers").innerText()).includes("2"), "searching 0349: Total customers still 2");
await page.fill("input[aria-label='Search by name or phone']", "");

// ---- Phone check in the form
await page.click("button:has-text('Add customer')");
const dlg = page.locator("[role=dialog]");
await dlg.locator("input").first().fill("QA Phone");
await dlg.locator("input[inputmode=tel]").fill("abc123");
posts.length = 0;
await dlg.locator("button:has-text('Save')").click();
await page.waitForSelector("[role=dialog] >> text=Pakistani mobile number");
ok(posts.length === 0, "abc123: error under the field, nothing sent to the server");
await dlg.locator("input[inputmode=tel]").fill("+92 300 7654321");
await dlg.locator("button:has-text('Save')").click();
await page.waitForSelector("text=QA Phone");
ok((await text("li:has-text('QA Phone')")).includes("0300-7654321"), "+92 300 7654321 saved as 0300-7654321 and shown at once");
await page.waitForFunction(() => document.body.innerText.includes("Total customers") && /Total customers\s*3/.test(document.body.innerText));
ok(true, "cards updated to 3 customers");
await page.screenshot({ path: `${out}/qa-customers.png` });

// ---- Reports: no double minus
const sale = await post("/api/sales", { items: [{ productId: soap._id, qty: 2 }], paymentMethod: "cash" });
await post(`/api/sales/${sale._id}/return`, { items: [{ index: 0, qty: 1 }], refundMethod: "cash" });
await page.goto(B + "/reports");
await page.waitForSelector("text=Profit & Loss");
const ret = norm(await page.locator("div:has(> dt:has-text('Returns (1)'))").first().innerText());
ok(ret.includes("Rs 600") && !ret.includes("Rs -600") && !ret.includes("Rs −600"), "“− Returns (1)  Rs 600” (no double minus): " + ret.replace(/\n/g, " "));

// ---- 404 inside the app
await page.goto(B + "/does-not-exist");
await page.waitForSelector("text=Page not found");
ok((await page.locator("aside >> text=Ashraf Store").count()) > 0, "404 page keeps the app's menu and styling");
await page.click("a:has-text('Back to Dashboard')");
await page.waitForURL(B + "/");
ok(true, "Back to Dashboard works");

// ---- Urdu on the customers page
await page.evaluate(() => localStorage.setItem("dukaan:lang", "ur"));
await page.goto(B + "/customers");
await page.waitForSelector("li:has-text('Danish')");
const main = norm(await page.locator("main").innerText());
for (const en of ["Udhaar to collect", "Total customers", "Add customer", "will give"]) ok(!main.includes(en), `Urdu: “${en}” is translated`);
ok(!(await page.inputValue("input[aria-label='Search by name or phone']").then(() => page.getAttribute("input[aria-label='Search by name or phone']", "placeholder"))).includes("Search"), "Urdu: search placeholder translated");
ok(!norm(await page.locator("aside button[aria-label='Search']").innerText()).includes("Search anything"), "Urdu: “Search anything…” translated");
await page.fill("input[aria-label='Search by name or phone']", "zzzz");
await page.waitForTimeout(800);
ok(!norm(await page.locator("main").innerText()).includes("No customers match"), "Urdu: no-match message translated");
await page.screenshot({ path: `${out}/qa-customers-urdu.png` });
await page.evaluate(() => localStorage.setItem("dukaan:lang", "en"));

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
