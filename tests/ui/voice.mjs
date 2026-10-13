import { B, norm } from "../lib/harness.mjs";
// Browser test: speaking to the app. The browser's speech service is replaced by a fake that "hears"
// whatever the test queues in window.__speech, so every voice screen can be checked without a microphone.
import { chromium } from "playwright";
const out = process.argv[2];
const ok = (c, m) => { if (!c) { console.log("  ✗", m); process.exitCode = 1; } else console.log("  ✓", m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Karachi" });
await ctx.addInitScript(() => {
  window.__speech = [];
  window.__langs = [];
  window.__spoken = [];
  class FakeRecognition {
    start() {
      window.__langs.push(this.lang);
      const text = window.__speech.shift();
      setTimeout(() => {
        if (text == null) {
          this.onerror?.({ error: "no-speech" });
          this.onend?.();
          return;
        }
        const part = [{ transcript: text.split(" ")[0] }];
        part.isFinal = false;
        this.onresult?.({ resultIndex: 0, results: [part] });
        setTimeout(() => {
          const fin = [{ transcript: text }];
          fin.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: [fin] });
          this.onend?.();
        }, 120);
      }, 120);
    }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  window.SpeechRecognition = FakeRecognition;
  if (window.speechSynthesis) window.speechSynthesis.speak = (u) => window.__spoken.push(u.text);
});
const page = await ctx.newPage();
let nativeDialogs = 0;
page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const post = (path, body, method = "POST") => page.evaluate(async ([p, b, m]) => (await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [path, body, method]);
const get = (path) => page.evaluate(async (p) => (await fetch(p)).json(), path);
const say = (text) => page.evaluate((t) => window.__speech.push(t), text);
const dlg = page.locator("[role=dialog]");
const text = async (loc) => norm(await loc.innerText());
const typeIt = async (s) => {
  await dlg.locator("input[aria-label='Type what you want']").fill(s);
  await dlg.locator("input[aria-label='Type what you want']").press("Enter");
};
const login = async (u, p) => {
  await post("/api/auth/logout", {});
  await page.goto(B + "/login");
  await page.fill('input[autocomplete="username"]', u);
  await page.fill('input[type="password"]', p);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
};

const first = await page.goto(B + "/setup");
ok(/microphone=\(self\)/.test(first.headers()["permissions-policy"] ?? ""), "the app may use the microphone (Permissions-Policy)");
await post("/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
await post("/api/auth/login", { username: "admin", password: "admin-pass-123" });
await post("/api/admin/tenants", { shopName: "Madina Karyana", shopType: "karyana", maxUsers: 3, ownerName: "Bilal", username: "bilal", password: "secret1" });
await login("bilal", "secret1");
await post("/api/users", { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" });

const soap = await post("/api/products", { name: "Lux Soap", nameUrdu: "لکس صابن", unit: "pcs", costPrice: 80, salePrice: 110, lowStockAlert: 0, openingStock: 50 });
await post("/api/products", { name: "Sugar", nameUrdu: "چینی", unit: "kg", costPrice: 140, salePrice: 160, lowStockAlert: 0, openingStock: 50 });
await post("/api/products", { name: "Eggs", unit: "pcs", costPrice: 20, salePrice: 25, lowStockAlert: 0, openingStock: 120, packs: [{ name: "Dozen", size: 12, price: 290 }] });
const bilal = await post("/api/parties", { type: "customer", name: "Bilal Ahmed", phone: "0321-1112223" });
const shahidM = await post("/api/parties", { type: "customer", name: "Shahid Mehmood" });
const shahidA = await post("/api/parties", { type: "customer", name: "Shahid Ali" });
await post(`/api/parties/${bilal._id}/payment`, { type: "charge", amount: 1000 });
await post("/api/sales", { items: [{ productId: soap._id, qty: 3 }], paymentMethod: "cash" });
const balance = async (id) => (await get("/api/parties?type=customer")).find((p) => p._id === id).balance;

// ---- Voice billing on the POS
await page.goto(B + "/pos");
await say("do lux sabun, aadha kilo cheeni aur 500 rupay ki cheeni, ek darjan anday, pepsi");
await page.click("button[aria-label='Bill by voice']");
await page.waitForSelector("text=Voice bill — check and add");
const item = (said) => dlg.locator(`select[aria-label="Item for ${said}"]`);
const qty = (said) => dlg.locator(`input[aria-label="Quantity for ${said}"]`);
ok((await dlg.locator("select").count()) === 5, "five things heard");
ok((await item("do lux sabun").locator("option:checked").innerText()).startsWith("Lux Soap") && (await qty("do lux sabun").inputValue()) === "2", "“do lux sabun” → Lux Soap × 2");
ok((await item("aadha kilo cheeni").locator("option:checked").innerText()).startsWith("Sugar") && (await qty("aadha kilo cheeni").inputValue()) === "0.5", "“aadha kilo cheeni” → Sugar 0.5 kg (Urdu name)");
ok((await qty("500 rs ki cheeni").inputValue()) === "3.125", "“500 rupay ki cheeni” → 3.125 kg");
ok((await qty("ek darjan anday").inputValue()) === "1" && (await text(dlg)).includes("Dozen"), "“ek darjan anday” → 1 Dozen pack of Eggs");
ok((await item("pepsi").inputValue()) === "" && (await text(dlg)).includes("Not in your products"), "“pepsi” (not in the shop) is left out");
// Speak more: added under the first list.
await say("ek lux sabun");
await dlg.locator("button[aria-label='Speak more items']").click();
await page.waitForFunction(() => document.querySelectorAll("[role=dialog] select").length === 6);
ok(true, "“speak more items” adds to the list");
await page.screenshot({ path: `${out}/voice-bill.png` });
await dlg.locator("button:has-text('Add 5 to the bill')").click();
await page.waitForSelector("text=5 items added to the bill");
const main = await text(page.locator("main"));
// 3 × 110 + 0.5 kg + 3.125 kg sugar (Rs 580) + a dozen eggs Rs 290
ok(main.includes("1,200"), "bill total Rs 1,200 (3 soap, 3.625 kg sugar, 1 dozen eggs)");

// ---- Mic in the search box
await page.locator("aside button[aria-label='Search']").click();
await say("Bilal");
await dlg.locator("button[aria-label='Search by voice']").click();
await page.waitForFunction(() => document.querySelector('input[aria-label="Search anything"]')?.value === "Bilal");
await page.waitForSelector("[role=dialog] >> text=Bilal Ahmed");
ok(true, "spoken words go into the search box and find Bilal Ahmed");
await page.keyboard.press("Escape");

// ---- Voice assistant: receive udhaar
await page.goto(B + "/");
await say("Bilal ne 400 rupay diye");
await page.locator("aside button[aria-label='Speak']").click();
await page.waitForSelector("text=Receive Rs 400 from Bilal Ahmed?");
let t = await text(dlg);
ok(t.includes("Bilal ne 400 rupay diye") && t.includes("Rs 1,000") && t.includes("Rs 600"), "card: heard text, udhaar Rs 1,000 → Rs 600");
ok((await balance(bilal._id)) === 1000, "nothing saved before Yes");
await page.screenshot({ path: `${out}/voice-payment.png` });
await dlg.locator("button:has-text('Yes, receive')").click();
await page.waitForSelector("[role=dialog] >> text=Payment received");
ok((await balance(bilal._id)) === 600, "after Yes: Bilal owes Rs 600");
ok(await dlg.locator("button:has-text('Receipt')").isVisible(), "receipt can be printed");

// ---- Udhaar: two Shahids → choose; No saves nothing
await say("Shahid ke khate mein 300 likh do");
await dlg.locator("button:has-text('Speak again')").click();
await page.waitForSelector("text=Which customer?");
ok((await dlg.locator("button:has-text('Shahid Mehmood')").count()) === 1 && (await dlg.locator("button:has-text('Shahid Ali')").count()) === 1, "two Shahids: asks which one");
await dlg.locator("button:has-text('Shahid Ali')").click();
await page.waitForSelector("text=Add Rs 300 udhaar to Shahid Ali?");
await dlg.getByRole("button", { name: "No", exact: true }).click();
await dlg.waitFor({ state: "detached" });
ok((await balance(shahidA._id)) === 0, "No: nothing written");
await say("Shahid Mehmood ke khate mein 300 likh do");
await page.locator("aside button[aria-label='Speak']").click();
await page.waitForSelector("text=Add Rs 300 udhaar to Shahid Mehmood?");
await dlg.locator("input[aria-label='Voice amount']").fill("350");
await dlg.locator("button:has-text('Yes, add udhaar')").click();
await page.waitForSelector("text=Udhaar added");
ok((await balance(shahidM._id)) === 350, "amount changed to 350 and written to Shahid Mehmood");

// ---- Expense
await say("bijli ka bill 4500");
await dlg.locator("button:has-text('Speak again')").click();
await page.waitForSelector("text=Save expense Rs 4,500?");
ok((await dlg.locator("select[aria-label='Expense type']").inputValue()) === "Electricity", "bijli → Electricity");
await dlg.locator("button:has-text('Yes, save')").click();
await page.waitForSelector("text=Expense saved");
const exp = await get("/api/expenses");
ok(exp.some((e) => e.category === "Electricity" && e.amount === 4500 && /bijli/.test(e.note)), "expense saved with what was said as the note");

// ---- Questions, answered on screen and aloud
await say("aaj ki sale kitni hui");
await dlg.locator("button:has-text('Speak again')").click();
await page.waitForSelector("[role=region][aria-label=Answer]");
ok((await text(page.locator("[role=region][aria-label=Answer]"))).includes("Today's sales: Rs 330 in 1 bills"), "sales today: Rs 330 in 1 bill");
ok(await page.evaluate(() => window.__spoken.some((s) => s.includes("330"))), "the answer is read aloud");
await typeIt("Shahid Mehmood ka udhaar kitna hai");
await page.waitForFunction(() => document.querySelector("[role=region][aria-label=Answer]")?.innerText.includes("Shahid Mehmood owes Rs 350"));
ok(true, "typed question works too: Shahid Mehmood owes Rs 350");
await typeIt("cheeni ka stock kitna hai");
await page.waitForFunction(() => /Sugar: 46\.375 Kg in stock|Sugar: 50 Kg in stock/.test(document.querySelector("[role=region][aria-label=Answer]")?.innerText ?? ""));
ok(true, "stock of cheeni → Sugar");
await typeIt("kul udhaar kitna hai");
await page.waitForFunction(() => document.querySelector("[role=region][aria-label=Answer]")?.innerText.includes("Total udhaar: Rs 950 from 2 customers"));
ok(true, "total udhaar: Rs 950 from 2 customers");

// ---- Urdu, typed
await typeIt("بلال نے دو سو روپے دیے");
await page.waitForSelector("text=Receive Rs 200 from Bilal Ahmed?");
ok(true, "Urdu: بلال نے دو سو روپے دیے → receive Rs 200 from Bilal Ahmed");

// ---- Anything else is searched; a page name opens the page
await typeIt("Lux");
await page.waitForSelector("[role=dialog] >> text=Lux Soap");
ok(true, "unknown words are searched");
await say("naya bill");
await dlg.locator("[aria-label='Speak']").click();
await page.waitForURL(B + "/pos");
ok(true, "“naya bill” opens the bill screen");

// ---- Language switch and a silent mic
await say(null);
await page.locator("aside button[aria-label='Speak']").click();
await page.waitForSelector("text=Nothing was heard");
ok(true, "nothing heard: clear message");
await dlg.locator("button:has-text('English')").click();
await say("aaj ka munafa kitna hai");
await dlg.locator("[aria-label='Speak']").click();
await page.waitForSelector("[role=region][aria-label=Answer]");
ok((await page.evaluate(() => window.__langs.at(-1))) === "en-PK" && (await page.evaluate(() => window.__langs[0])) === "ur-PK", "listens in Urdu by default, English when chosen");
ok((await text(page.locator("[role=region][aria-label=Answer]"))).includes("Today's profit: Rs 90"), "profit answer for the owner");
await page.keyboard.press("Escape");

// ---- Phone screen
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(B + "/");
await page.evaluate(() => window.__speech.push("kul udhaar kitna hai"));
await page.locator("header button[aria-label='Speak']").click();
await page.waitForSelector("[role=region][aria-label=Answer]");
ok(!(await page.evaluate(() => document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1)), "assistant fits a phone screen");
await page.screenshot({ path: `${out}/voice-mobile.png` });
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 1440, height: 900 });

// ---- Cashier: can receive udhaar, cannot add expenses or see profit
await login("kashif", "secret2");
await page.goto(B + "/pos");
await say("bijli ka bill 4500");
await page.locator("aside button[aria-label='Speak']").click();
await page.waitForSelector("text=Only the owner or a manager can do this.");
ok(true, "cashier: expense by voice is for owner / manager");
await typeIt("aaj ka munafa kitna hai");
await page.waitForSelector("text=Only the owner or a manager can see this.");
ok(true, "cashier: profit is not shown");
await typeIt("Bilal ne 100 diye");
await dlg.locator("button:has-text('Yes, receive')").click();
await page.waitForSelector("[role=dialog] >> text=Payment received");
ok((await balance(bilal._id)) === 500, "cashier received Rs 100 by voice");
await page.keyboard.press("Escape");

// ---- A browser without voice: no mic on the POS, the assistant offers typing
const plain = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await plain.addInitScript(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});
const p2 = await plain.newPage();
p2.on("pageerror", (e) => errors.push(e.message));
await p2.goto(B + "/login");
await p2.fill('input[autocomplete="username"]', "bilal");
await p2.fill('input[type="password"]', "secret1");
await p2.click('button[type="submit"]');
await p2.waitForURL(B + "/");
await p2.goto(B + "/pos");
await p2.waitForSelector("input[placeholder*='Scan barcode']");
ok((await p2.locator("button[aria-label='Bill by voice']").count()) === 0, "no voice in this browser: no mic on the POS");
await p2.locator("aside button[aria-label='Speak']").click();
await p2.waitForSelector("text=Speaking works in Chrome or Edge");
ok(await p2.locator("input[aria-label='Type what you want']").isVisible(), "assistant still works by typing");
await plain.close();

ok(nativeDialogs === 0, "no browser pop-ups");
ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
await browser.close();
