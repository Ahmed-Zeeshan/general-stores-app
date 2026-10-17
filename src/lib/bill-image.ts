import QRCode from "qrcode";
import { formatDate, PAYMENT_LABELS, UNIT_LABELS } from "./client";
import { formatPKR, formatQty } from "./money";

/**
 * A bill drawn as a picture (PNG) or a one-page PDF, to send on WhatsApp like big stores do: shop header,
 * bill details, an items table, totals, payment, FBR QR and the shop's footer. Drawn in the browser
 * (works offline, Urdu text shapes correctly) with no extra libraries.
 */
export type BillSale = {
  invoiceNo: string;
  createdAt: string;
  items: {
    name: string;
    qty: number;
    unit: string;
    price: number;
    discount: number;
    total: number;
    pack?: { name: string; size: number; count: number; price: number };
    promo?: { name: string; amount: number };
    serials?: { imei: string; imei2?: string; returned?: boolean }[];
    warrantyMonths?: number;
    warrantyUntil?: string;
  }[];
  promo?: { name: string; amount: number };
  pointsRedeemed?: number;
  pointsValue?: number;
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
  paymentMethod: string;
  payments?: { method: string; amount: number; ref?: string }[];
  amountPaid: number;
  change: number;
  creditAmount: number;
  customerName?: string;
  cashierName?: string;
  branchName?: string;
  status: string;
  returnedTotal?: number;
  fbrInvoiceNumber?: string;
  installment?: boolean;
};
export type BillShop = { shopName: string; phone?: string; address?: string; ntn?: string; strn?: string; receiptFooter?: string; branchName?: string };

const W = 1080;
const PAD = 64;
const C = {
  brand: "#059669",
  brandDark: "#047857",
  brandSoft: "#ecfdf5",
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  zebra: "#f8fafc",
  red: "#e11d48",
  redSoft: "#fff1f2",
  amber: "#b45309",
  amberSoft: "#fffbeb",
};
const SANS = `Inter, "Noto Nastaliq Urdu", "Noto Naskh Arabic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const font = (size: number, weight = 400) => `${weight} ${size}px ${SANS}`;
const money = (n: number) => formatPKR(n);

/** Splits text into lines that fit `width` (long words are cut). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = word;
      while (ctx.measureText(line).width > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** Draws the bill and returns the canvas (1080 px wide, as tall as the bill). */
export async function drawBill(sale: BillSale, shop: BillShop, opts: { link?: string | null } = {}): Promise<HTMLCanvasElement> {
  // Make sure the app's fonts are ready, or the first picture would use a fallback font.
  try {
    await Promise.all([document.fonts.load(font(40, 700)), document.fonts.load(font(28, 400)), document.fonts.load(font(28, 600))]);
  } catch {
    /* system font is fine */
  }
  const [fbrQr, linkQr] = await Promise.all([
    sale.fbrInvoiceNumber ? QRCode.toDataURL(sale.fbrInvoiceNumber, { margin: 0, width: 220, errorCorrectionLevel: "M" }).then(loadImage).catch(() => null) : null,
    opts.link ? QRCode.toDataURL(opts.link, { margin: 0, width: 220, errorCorrectionLevel: "M" }).then(loadImage).catch(() => null) : null,
  ]);

  // Draw on a tall sheet, then cut it to the height used.
  const estimate = 1500 + sale.items.length * 190 + (fbrQr || linkQr ? 320 : 0) + 600;
  const sheet = document.createElement("canvas");
  sheet.width = W;
  sheet.height = Math.min(30000, estimate);
  const ctx = sheet.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, sheet.height);
  const right = W - PAD;
  const inner = W - PAD * 2;
  let y = 0;

  // ---- Header band: initials badge, shop name, address, phone, NTN
  const headerLines: string[] = [];
  if (shop.branchName) headerLines.push(shop.branchName);
  if (shop.address) headerLines.push(shop.address);
  const contact = [shop.phone && `☎ ${shop.phone}`, shop.ntn && `NTN ${shop.ntn}`, shop.strn && `STRN ${shop.strn}`].filter(Boolean).join("   ·   ");
  ctx.font = font(28);
  const addrLines = headerLines.flatMap((l) => wrap(ctx, l, inner - 150));
  ctx.font = font(52, 800);
  const nameLines = wrap(ctx, shop.shopName || "Shop", inner - 150).slice(0, 2);
  const headH = 70 + nameLines.length * 62 + addrLines.length * 38 + (contact ? 42 : 0) + 46;
  const grad = ctx.createLinearGradient(0, 0, W, headH);
  grad.addColorStop(0, C.brand);
  grad.addColorStop(1, C.brandDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headH);
  // badge
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, PAD, 64, 112, 112, 28);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(44, 800);
  ctx.textAlign = "center";
  ctx.fillText(initials(shop.shopName || "Shop"), PAD + 56, 136);
  ctx.textAlign = "left";
  const tx = PAD + 144;
  y = 112;
  ctx.font = font(52, 800);
  for (const l of nameLines) {
    ctx.fillText(l, tx, y);
    y += 62;
  }
  y -= 10;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = font(28);
  for (const l of addrLines) {
    ctx.fillText(l, tx, y);
    y += 38;
  }
  if (contact) {
    ctx.font = font(26, 600);
    ctx.fillText(contact, tx, y + 4);
  }
  y = headH;

  // ---- Title row: "INVOICE" + number on the left, status stamp on the right
  y += 72;
  ctx.fillStyle = C.muted;
  ctx.font = font(24, 700);
  ctx.fillText(sale.installment ? "INSTALLMENT SALE" : "SALES INVOICE", PAD, y);
  y += 52;
  ctx.fillStyle = C.ink;
  ctx.font = font(46, 800);
  ctx.fillText(sale.invoiceNo, PAD, y);
  const paidFull = sale.creditAmount <= 0.004;
  const stamp =
    sale.status === "returned"
      ? { text: "RETURNED", fg: C.red, bg: C.redSoft }
      : sale.status === "partially_returned"
        ? { text: "PART RETURNED", fg: C.red, bg: C.redSoft }
        : sale.installment
          ? { text: "ON INSTALLMENTS", fg: C.amber, bg: C.amberSoft }
          : paidFull
            ? { text: "PAID", fg: C.brandDark, bg: C.brandSoft }
            : sale.amountPaid > 0
              ? { text: "PART PAID", fg: C.amber, bg: C.amberSoft }
              : { text: "UDHAAR", fg: C.amber, bg: C.amberSoft };
  ctx.font = font(28, 800);
  const sw = ctx.measureText(stamp.text).width + 56;
  ctx.fillStyle = stamp.bg;
  roundRect(ctx, right - sw, y - 46, sw, 58, 29);
  ctx.fill();
  ctx.strokeStyle = stamp.fg;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = stamp.fg;
  ctx.textAlign = "center";
  ctx.fillText(stamp.text, right - sw / 2, y - 7);
  ctx.textAlign = "left";

  // ---- Details grid: date, customer, cashier
  y += 44;
  const time = new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit" }).format(new Date(sale.createdAt));
  const details: [string, string][] = [["Date", `${formatDate(sale.createdAt)}\n${time}`]];
  if (sale.customerName) details.push(["Customer", sale.customerName]);
  if (sale.cashierName) details.push(["Served by", sale.cashierName]);
  const colW = inner / Math.max(2, details.length);
  // Values may take two lines (a long name, or the date with its time).
  ctx.font = font(28, 600);
  const valueLines = details.map(([, value]) => wrap(ctx, value, colW - 36).slice(0, 2));
  const boxH = 76 + Math.max(...valueLines.map((l) => l.length)) * 38;
  ctx.fillStyle = C.zebra;
  roundRect(ctx, PAD, y, inner, boxH, 20);
  ctx.fill();
  details.forEach(([label], i) => {
    const x = PAD + 28 + i * colW;
    ctx.fillStyle = C.muted;
    ctx.font = font(22, 600);
    ctx.fillText(label.toUpperCase(), x, y + 42);
    ctx.fillStyle = C.ink;
    ctx.font = font(28, 600);
    valueLines[i].forEach((l, k) => ctx.fillText(l, x, y + 84 + k * 38));
  });
  y += boxH + 48;

  // ---- Items table
  const colQty = PAD + inner * 0.56;
  const colRate = PAD + inner * 0.76;
  ctx.fillStyle = C.ink;
  roundRect(ctx, PAD, y, inner, 64, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(24, 700);
  ctx.fillText("#", PAD + 22, y + 42);
  ctx.fillText("ITEM", PAD + 72, y + 42);
  ctx.textAlign = "right";
  ctx.fillText("QTY", colQty + 40, y + 42);
  ctx.fillText("RATE", colRate + 30, y + 42);
  ctx.fillText("AMOUNT", right - 22, y + 42);
  ctx.textAlign = "left";
  y += 64;
  sale.items.forEach((it, idx) => {
    ctx.font = font(30, 600);
    const nameLines = wrap(ctx, it.name, colQty - (PAD + 72) - 90);
    const notes: { text: string; color: string }[] = [];
    if (it.pack) notes.push({ text: `${formatQty(it.pack.count)} ${it.pack.name} × ${formatQty(it.pack.size)} ${UNIT_LABELS[it.unit] ?? it.unit}`, color: C.muted });
    if (it.discount > 0) notes.push({ text: `Discount −${money(it.discount)}`, color: C.brandDark });
    if (it.promo && it.promo.amount > 0) notes.push({ text: `Offer: ${it.promo.name} −${money(it.promo.amount)}`, color: C.brandDark });
    for (const s of it.serials ?? []) notes.push({ text: `IMEI ${s.imei}${s.imei2 ? ` / ${s.imei2}` : ""}${s.returned ? " (returned)" : ""}`, color: C.muted });
    if (it.warrantyUntil) notes.push({ text: `Warranty ${it.warrantyMonths ?? ""} months · till ${formatDate(it.warrantyUntil)}`, color: C.muted });
    const rowH = 30 + nameLines.length * 40 + notes.length * 34 + 18;
    if (idx % 2 === 1) {
      ctx.fillStyle = C.zebra;
      ctx.fillRect(PAD, y, inner, rowH);
    }
    let ry = y + 50;
    ctx.fillStyle = C.muted;
    ctx.font = font(26, 600);
    ctx.fillText(String(idx + 1), PAD + 22, ry);
    ctx.fillStyle = C.ink;
    ctx.font = font(30, 600);
    for (const l of nameLines) {
      ctx.fillText(l, PAD + 72, ry);
      ry += 40;
    }
    ctx.font = font(24, 500);
    for (const n of notes) {
      ctx.fillStyle = n.color;
      ctx.fillText(wrap(ctx, n.text, colQty - (PAD + 72) - 20)[0], PAD + 72, ry - 4);
      ry += 34;
    }
    const qty = it.pack ? `${formatQty(it.pack.count)} ${it.pack.name}` : `${formatQty(it.qty)} ${UNIT_LABELS[it.unit] ?? it.unit}`;
    const rate = it.pack ? it.pack.price : it.price;
    ctx.textAlign = "right";
    ctx.fillStyle = C.text;
    ctx.font = font(28, 500);
    ctx.fillText(qty, colQty + 40, y + 50);
    ctx.fillText(formatPKR(rate, { symbol: false }), colRate + 30, y + 50);
    ctx.fillStyle = C.ink;
    ctx.font = font(30, 700);
    ctx.fillText(formatPKR(it.total, { symbol: false }), right - 22, y + 50);
    ctx.textAlign = "left";
    y += rowH;
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, y - 1, inner, 2);
  });

  // ---- Totals
  y += 36;
  const tl = PAD + inner * 0.42;
  const row = (label: string, value: string, opt: { color?: string; bold?: boolean } = {}) => {
    ctx.fillStyle = opt.color ?? C.text;
    ctx.font = font(28, opt.bold ? 700 : 500);
    ctx.fillText(label, tl, y);
    ctx.textAlign = "right";
    ctx.fillText(value, right - 22, y);
    ctx.textAlign = "left";
    y += 46;
  };
  row(`Subtotal (${sale.items.length} ${sale.items.length === 1 ? "item" : "items"})`, money(sale.subtotal));
  if (sale.promo && sale.promo.amount > 0) row(`Offer: ${sale.promo.name}`, `−${money(sale.promo.amount)}`, { color: C.brandDark });
  if ((sale.pointsValue ?? 0) > 0) row(`Points used (${sale.pointsRedeemed})`, `−${money(sale.pointsValue ?? 0)}`, { color: C.brandDark });
  const manual = sale.discount - (sale.promo?.amount ?? 0) - (sale.pointsValue ?? 0);
  if (manual > 0.004) row("Discount", `−${money(manual)}`, { color: C.brandDark });
  if (sale.tax > 0) row(`Sales tax ${sale.taxRate}%${Math.abs(sale.total - (sale.subtotal - sale.discount)) < 0.01 ? " (included)" : ""}`, money(sale.tax));
  y += 4;
  ctx.fillStyle = C.brand;
  roundRect(ctx, tl - 24, y - 4, right - tl + 24, 88, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(30, 700);
  ctx.fillText("TOTAL", tl, y + 54);
  ctx.textAlign = "right";
  ctx.font = font(44, 800);
  ctx.fillText(money(sale.total), right - 22, y + 58);
  ctx.textAlign = "left";
  y += 88 + 52;
  if (sale.payments?.length) {
    for (const p of sale.payments) row(`Paid · ${PAYMENT_LABELS[p.method] ?? p.method}${p.ref ? ` #${p.ref}` : ""}`, money(p.method === "cash" ? p.amount + sale.change : p.amount));
  } else if (sale.amountPaid + sale.change > 0) {
    row(`Paid · ${PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}`, money(sale.amountPaid + sale.change));
  }
  if (sale.change > 0) row("Change given", money(sale.change));
  if (sale.creditAmount > 0) row(sale.installment ? "On installments" : "Udhaar (added to khata)", money(sale.creditAmount), { color: C.amber, bold: true });
  if ((sale.returnedTotal ?? 0) > 0) row("Returned", `−${money(sale.returnedTotal!)}`, { color: C.red });

  // ---- QR codes: FBR invoice and the online bill
  const qrs = [fbrQr && { img: fbrQr, title: "FBR POS invoice", sub: sale.fbrInvoiceNumber! }, linkQr && { img: linkQr, title: "View this bill online", sub: "Scan with the phone camera" }].filter(Boolean) as { img: HTMLImageElement; title: string; sub: string }[];
  if (qrs.length) {
    y += 20;
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, y, inner, 2);
    y += 40;
    const boxW = inner / qrs.length;
    qrs.forEach((q, i) => {
      const cx = PAD + boxW * i + boxW / 2;
      ctx.drawImage(q.img, cx - 90, y, 180, 180);
      ctx.textAlign = "center";
      ctx.fillStyle = C.ink;
      ctx.font = font(26, 700);
      ctx.fillText(q.title, cx, y + 222);
      ctx.fillStyle = C.muted;
      ctx.font = font(22, 500);
      ctx.fillText(wrap(ctx, q.sub, boxW - 40)[0], cx, y + 256);
      ctx.textAlign = "left";
    });
    y += 280;
  }

  // ---- Footer
  y += 24;
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y, inner, 2);
  y += 58;
  ctx.textAlign = "center";
  ctx.fillStyle = C.ink;
  ctx.font = font(30, 600);
  for (const l of wrap(ctx, shop.receiptFooter || "Thank you for shopping with us!", inner).slice(0, 4)) {
    ctx.fillText(l, W / 2, y);
    y += 50;
  }
  ctx.fillStyle = C.muted;
  ctx.font = font(22, 500);
  ctx.fillText(`${shop.shopName}${shop.phone ? ` · ${shop.phone}` : ""}`, W / 2, y + 6);
  ctx.textAlign = "left";
  y += 48;
  ctx.fillStyle = C.brand;
  ctx.fillRect(0, y, W, 14);
  y += 14;

  const out = document.createElement("canvas");
  out.width = W;
  out.height = Math.min(y, sheet.height);
  out.getContext("2d")!.drawImage(sheet, 0, 0);
  return out;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the picture."))), type, quality));

export const billPng = (canvas: HTMLCanvasElement) => toBlob(canvas, "image/png");

/** One-page PDF holding the bill picture (JPEG inside, so the file stays small). */
export async function billPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
  const pageW = 420;
  const pageH = Math.round((canvas.height / canvas.width) * pageW * 100) / 100;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === "string" ? enc.encode(p) : p;
    parts.push(b);
    length += b.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  push("%PDF-1.4\n%âãÏÓ\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
