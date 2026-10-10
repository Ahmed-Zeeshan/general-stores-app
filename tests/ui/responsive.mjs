// Every screen at phone, tablet, laptop and desktop width: no sideways page scroll, nothing cut off
// at the right edge, and amounts / dates / short headings never broken over two lines.
// Screenshots go to test-results/responsive/<width>/ for a visual check.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { B, Client, SHOTS, launchBrowser, check, finishUi, today } from "../lib/harness.mjs";

const WIDTHS = [
  { w: 360, h: 760 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1440, h: 900 },
];
const out = join(SHOTS, "responsive");

// ---------- realistic data with long names and big amounts ----------
const admin = new Client("admin"), owner = new Client("owner");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
const shop = await admin.call("/api/admin/tenants", {
  body: { shopName: "Ashraf General Store & Bakers", shopType: "general", maxUsers: 5, maxBranches: 2, ownerName: "Ashraf", username: "ashraf", password: "secret1", phone: "0335-3514100" },
});
await owner.login("ashraf", "secret1");
await owner.call("/api/settings", { method: "PUT", body: { address: "Mohallah Chah Trang, Near Gujjar Colony, Gujrat", phone: "03353514100" } }).catch(() => {});
const cat = await owner.call("/api/categories", { body: { name: "Cooking Oil & Ghee" } }).catch(() => null);
const ghee = await owner.call("/api/products", {
  body: { name: "Dalda Banaspati Ghee 5kg Tin (Special Offer Pack)", unit: "pcs", barcode: "8964000123457", costPrice: 2850, salePrice: 3100, lowStockAlert: 5, openingStock: 400, ...(cat ? { categoryId: cat._id } : {}), packs: [{ name: "Carton", size: 4, price: 12000 }] },
});
const sugar = await owner.call("/api/products", { body: { name: "Sugar", unit: "kg", costPrice: 140, salePrice: 160, lowStockAlert: 5, openingStock: 2000 } });
const milk = await owner.call("/api/products", { body: { name: "Olpers Milk 1L", unit: "pcs", costPrice: 280, salePrice: 300, lowStockAlert: 50, openingStock: 3, trackExpiry: true, shelfLifeDays: 2 } });
const cust = await owner.call("/api/parties", {
  body: { type: "customer", name: "Danish s/O Muhammad Riaz Chaudhry", phone: "03007868889", address: "Gujjar Colony Mohallah Chah Traing, Street No. 14, House 221-B", openingBalance: 152000, creditLimit: 500000 },
});
const sup = await owner.call("/api/parties", { body: { type: "supplier", name: "Al-Madina Wholesale Traders (Pvt) Ltd", phone: "03001112223", openingBalance: 1250000 } });
await owner.call("/api/shifts", { body: { openingCash: 125000, note: "Morning float" } });
const bill = await owner.call("/api/sales", { body: { items: [{ productId: ghee._id, qty: 120 }, { productId: sugar._id, qty: 12.5 }], paymentMethod: "credit", customerId: cust._id } });
await owner.call("/api/sales", { body: { items: [{ productId: sugar._id, qty: 3 }], paymentMethod: "cash" } });
await owner.call("/api/sales", {
  body: { items: [{ productId: ghee._id, qty: 2 }], payments: [{ method: "cash", amount: 3000 }, { method: "jazzcash", amount: 3200, ref: "JC-99887766" }], paymentMethod: "cash" },
}).catch(() => {});
const pay = await owner.call(`/api/parties/${cust._id}/payment`, { body: { type: "payment", amount: 250000, method: "cash", note: "received in cash on dated 10 oct" } });
const ret = await owner.call(`/api/sales/${bill._id}/return`, { body: { items: [{ index: 0, qty: 2 }] } });
await owner.call("/api/purchases", { body: { supplierId: sup._id, supplierInvoice: "INV-2026-000123", amountPaid: 300000, items: [{ productId: ghee._id, qty: 200, cost: 2850 }, { productId: milk._id, qty: 24, cost: 280, expiryDate: today() }] } });
await owner.call("/api/expenses", { body: { category: "Electricity", amount: 48500, note: "LESCO bill for September including fuel adjustment" } });
await owner.call("/api/promotions", { body: { name: "Ramzan Bachat Offer — 5% off on all bills over Rs 5,000", kind: "bill", value: 5, minAmount: 5000, maxDiscount: 1500 } });
const shifts = await owner.call("/api/shifts");
const shiftId = (Array.isArray(shifts) ? shifts : shifts.shifts ?? shifts.items ?? [])[0]?._id;

const PAGES = [
  ["dashboard", "/"],
  ["pos", "/pos"],
  ["products", "/products"],
  ["customers", "/customers"],
  ["customer", `/customers/${cust._id}`],
  ["suppliers", "/suppliers"],
  ["supplier", `/suppliers/${sup._id}`],
  ["sales", "/sales"],
  ["purchases", "/purchases"],
  ["purchase-new", "/purchases/new"],
  ["expenses", "/expenses"],
  ["udhaar", "/udhaar"],
  ["reports", "/reports"],
  ["drawer", "/drawer"],
  ["expiry", "/expiry"],
  ["promotions", "/promotions"],
  ["activity", "/activity"],
  ["labels", "/labels"],
  ["production", "/production"],
  ["transfers", "/transfers"],
  ["settings", "/settings"],
  ["statement", `/statement/${cust._id}`],
  ["supplier-statement", `/statement/${sup._id}`],
  ["receipt", `/receipt/${bill._id}`],
  ["receipt-payment", `/receipt/payment/${pay._id}`],
  ["receipt-return", `/receipt/return/${ret.return._id}`],
  ...(shiftId ? [["receipt-shift", `/receipt/shift/${shiftId}`]] : []),
  ["receipt-test", "/receipt/test"],
];
const ADMIN_PAGES = [
  ["admin", "/admin"],
  ["admin-shop", `/admin/shops/${shop._id}`],
];
const PUBLIC_PAGES = [["login", "/login"]];

/** Runs in the page: layout problems a person would notice. */
function findProblems() {
  const vw = document.documentElement.clientWidth;
  const problems = [];
  const doc = document.scrollingElement;
  if (doc.scrollWidth > vw + 1) problems.push(`page scrolls sideways (${doc.scrollWidth}px wide on a ${vw}px screen)`);
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX)) return true;
      if (s.position === "fixed" && p.getBoundingClientRect().right <= 0) return true; // closed side menu
    }
    return false;
  };
  const label = (el) => (el.innerText || el.value || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const lines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    return tops.size;
  };
  // Tables must never need a sideways scroll (they turn into cards when they don't fit).
  {
    for (const box of document.querySelectorAll("div")) {
      if (!/(auto|scroll)/.test(getComputedStyle(box).overflowX) || !box.querySelector(":scope > table") || !visible(box)) continue;
      if (box.scrollWidth > box.clientWidth + 2) problems.push(`table needs sideways scroll: "${label(box.querySelector("th, td") ?? box)}…"`);
    }
  }
  const seen = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(".no-responsive-check") || !visible(el)) continue;
    const tag = el.tagName;
    if (["SCRIPT", "STYLE", "SVG", "PATH", "svg", "path", "HTML", "BODY"].includes(tag)) continue;
    const r = el.getBoundingClientRect();
    const text = label(el);
    // Cut off at the right edge (and not inside something that scrolls sideways on purpose).
    if (r.right > vw + 1 && r.left < vw && !inScroller(el) && text && el.children.length === 0) {
      const k = `cut:${text}`;
      if (!seen.has(k)) {
        problems.push(`cut off at the right edge: "${text}"`);
        seen.add(k);
      }
    }
    // Amounts, dates and short headings must stay on one line.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    if (!own || el.children.length > 1) continue;
    const full = el.textContent.trim().replace(/\s+/g, " ");
    const isMoney = /^[-−+]?\s*Rs\.?\s?[-−]?[\d,]+(\.\d+)?$/.test(full);
    const isDate = /^\d{1,2}-[A-Z][a-z]{2}-\d{4}$/.test(full);
    const isShortHeading = tag === "TH" && full.length <= 16;
    if ((isMoney || isDate || isShortHeading) && lines(el) > 1) {
      const k = `wrap:${full}`;
      if (!seen.has(k)) {
        problems.push(`broken over two lines: "${full}"`);
        seen.add(k);
      }
    }
  }
  return problems.slice(0, 12);
}

const browser = await launchBrowser();
async function sweep(name, client, pages) {
  const ctx = await browser.newContext();
  if (client) {
    const host = new URL(B).hostname;
    await ctx.addCookies(Object.entries(client.cookies).map(([n, v]) => ({ name: n, value: v, domain: host, path: "/" })));
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.dismiss());
  for (const { w, h } of WIDTHS) {
    mkdirSync(join(out, String(w)), { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    for (const [key, path] of pages) {
      await page.goto(B + path, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(400);
      const problems = await page.evaluate(findProblems);
      check(problems.length === 0, `${key} @${w}px${problems.length ? ": " + problems.join(" | ") : ""}`);
      await page.screenshot({ path: join(out, String(w), `${key}.png`), fullPage: true });
    }
  }
  check(errors.length === 0, `${name}: no page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
  await ctx.close();
}

await sweep("shop", owner, PAGES);
await sweep("admin", admin, ADMIN_PAGES);
await sweep("public", null, PUBLIC_PAGES);
await browser.close();
finishUi();
