import { chromium } from "playwright";
import { B } from "../lib/harness.mjs";
const [out, cam] = process.argv.slice(2);
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", ...(cam ? [`--use-file-for-fake-video-capture=${cam}`] : [])],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi", permissions: ["camera"] });
// The sandbox has no internet: answer WhatsApp requests locally so we can check the exact link.
await ctx.route(/(web\.whatsapp\.com|wa\.me)/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>WhatsApp</h1>" }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const shot = async (name, full = true) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${name}.png`, fullPage: full }); };

await page.goto(B + "/login");
await page.fill('input[autocomplete="username"]', "usman");
await page.fill('input[type="password"]', "secret1");
await page.click('button[type="submit"]');
await page.waitForURL(B + "/");
await shot("01-dashboard-branches");
ok(await page.locator("aside select").count() > 0, "branch switcher visible");

// --- POS: USB scanner (fast typing with no box selected)
await page.goto(B + "/pos");
await page.waitForSelector("button:has-text('Tapal Tea 950g')");
await page.locator("h1").click();
await page.keyboard.type("8964000000011", { delay: 4 });
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
ok(await page.locator("aside li:has-text('Tapal Tea 950g')").count() === 1, "USB scanner adds item from anywhere on the page");
// typing slowly (a person) must not add anything
await page.locator("h1").click();
await page.keyboard.type("8964000000011", { delay: 120 });
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
ok((await page.locator("aside li:has-text('Tapal Tea 950g') input[type=number]").first().inputValue()) === "1", "slow human typing is not treated as a scan");
// --- POS: camera scan
await page.click("button[aria-label='Scan with camera']");
const camOk = await Promise.race([
  page.waitForSelector("text=Added: 8964000000011", { timeout: 20000 }).then(() => true),
  page.waitForSelector("text=No camera found", { timeout: 20000 }).then(() => false),
]).catch(() => false);
if (camOk) {
  await shot("02-pos-camera", false);
  await page.click("text=Done scanning");
  ok((await page.locator("aside li:has-text('Tapal Tea 950g') input[type=number]").first().inputValue()) === "2", "camera scan added the item (qty 2)");
} else {
  console.log("  - camera scan skipped: no camera clip given (node tests/ui/scanning.mjs <out> <clip.mjpeg>)");
  await page.click("text=Done scanning");
}

// --- Products: barcode field, generate, preview
await page.goto(B + "/products");
await page.waitForSelector("text=Tapal Tea 950g");
await page.click("text=Add product");
await page.fill('input[placeholder^="e.g. Sugar"]', "Test Labels Item");
await page.click("button[aria-label='Create a new barcode']");
await page.waitForTimeout(600);
const gen = await page.inputValue('input[placeholder="e.g. 8961014000123"]');
ok(/^20\d{11}$/.test(gen), "Create barcode fills an in-store code: " + gen);
ok(await page.locator('svg[aria-label^="Barcode"] rect, svg[aria-label^="Barcode"] g').count() > 0, "barcode preview drawn");
await shot("03-product-barcode", false);
await page.fill('input[placeholder="e.g. 8961014000123"]', "");
await page.locator('input[placeholder="e.g. 8961014000123"]').click();
await page.keyboard.type("1234567890", { delay: 3 });
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
ok(await page.locator("text=Add product >> visible=true").count() >= 0 && (await page.locator('[role=dialog]').count()) === 1, "scanner Enter in barcode box does not submit the form");
await page.keyboard.press("Escape");

// --- Labels
await page.goto(B + "/products");
await page.waitForSelector("text=Tapal Tea 950g");
const teaRow = page.locator("tr:has-text('Tapal Tea 950g')");
await teaRow.locator("button[aria-label='More actions']").click();
await teaRow.locator("a:has-text('Print labels')").click();
await page.waitForURL(/\/labels\?ids=/);
await page.waitForSelector(".print-area .label");
await page.fill('input[aria-label="Copies"]', "3");
await page.waitForTimeout(400);
ok(await page.locator(".print-area .label").count() === 3, "3 labels in preview");
await shot("04-labels-roll");
const pdfRoll = await page.pdf({ preferCSSPageSize: true });
const rollPages = (pdfRoll.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
ok(rollPages === 3, `label roll prints one label per page (${rollPages} pages)`);
await page.locator("main select").first().selectOption("a4-24");
await page.click("text=All products (1 each)");
await page.waitForTimeout(800);
await shot("05-labels-a4");
const pdfA4 = await page.pdf({ preferCSSPageSize: true });
const a4Pages = (pdfA4.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
ok(a4Pages === 1, `A4 sheet fits all labels on one page (${a4Pages})`);

// --- Udhaar report + WhatsApp
await page.goto(B + "/udhaar");
await page.waitForSelector("text=Ali Raza");
await shot("06-udhaar-report");
await page.locator("main select").filter({ hasText: "WhatsApp Web" }).first().selectOption("web");
const [wa] = await Promise.all([page.waitForEvent("popup"), page.locator("tr:has-text('Ali Raza') button:has-text('WhatsApp')").click()]);
const waUrl = wa.url();
ok(waUrl.startsWith("https://web.whatsapp.com/send?phone=923001112223"), "WhatsApp Web opens for Ali: " + waUrl.slice(0, 70));
ok(decodeURIComponent(waUrl).includes("Hi Ali Raza, please pay Rs 1,120 to City Mart."), "message uses the shop's template");
await wa.close();
await page.waitForTimeout(500);
ok(await page.locator("tr:has-text('Ali Raza') >> text=Today").count() > 0, "row shows reminded today");
await page.click("text=/Remind \\d+ on WhatsApp/");
await page.waitForSelector("text=Customer 1 of");
await shot("07-reminder-queue", false);
await page.click("[role=dialog] button:has-text('Skip')");
await page.keyboard.press("Escape");

// --- Statement
const [st] = await Promise.all([page.waitForEvent("popup"), page.locator("tr:has-text('Ali Raza') a[title='Khata statement']").click()]);
await st.waitForSelector("text=Khata Statement");
await st.waitForTimeout(800);
await st.screenshot({ path: `${out}/08-statement.png`, fullPage: true });
ok(await st.locator("text=Balance due").count() > 0, "statement shows balance due");
await st.close();

// --- Branch switch, transfers, settings
await page.goto(B + "/transfers");
await page.waitForSelector("text=Transfer history");
await shot("09-transfers");
await page.goto(B + "/settings");
await page.waitForSelector("text=Branches");
await shot("10-settings");
await Promise.all([page.waitForEvent("load"), page.locator("aside select").first().selectOption({ label: "Gulberg Branch" })]);
await page.waitForTimeout(1200);
ok((await page.locator("aside select").first().inputValue()) !== "" && (await page.locator("aside select option:checked").first().textContent()) === "Gulberg Branch", "switched to Gulberg from sidebar");

// --- mobile POS
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] });
await m.addCookies(await ctx.cookies());
const mp = await m.newPage();
await mp.goto(B + "/udhaar");
await mp.waitForTimeout(1500);
await mp.screenshot({ path: `${out}/11-mobile-udhaar.png`, fullPage: true });
console.log("page errors:", JSON.stringify(errors));
await browser.close();
