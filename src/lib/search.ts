import { escapeRegex } from "./api";
import type { BranchContext } from "./branches";
import { Device, InstallmentPlan, LedgerEntry, Party, Product, Purchase, Repair, Sale, SaleReturn, Shift, Tenant, UsedPurchase, WalletTxn } from "@/models";

export type SearchHit = { type: string; id: string; title: string; subtitle?: string; href: string };
export type SearchGroup = { type: string; label: string; hits: SearchHit[] };

const PER = 6;
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const money = (n: number) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n)}`;

/**
 * One search box for the whole shop: customers and suppliers (name, mobile), products (name, brand,
 * phone models, barcode), bills and returns (number, customer), phones (IMEI), repairs, installment
 * plans (also CNIC), used phones bought and Easyload / wallet entries. Digits match with or without
 * dashes, so 03001234567 finds 0300-1234567 and 3410112345671 finds 34101-1234567-1.
 */
export async function searchAll(ctx: BranchContext, raw: string): Promise<SearchGroup[]> {
  const { tid, user } = ctx;
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return [];
  const manage = user.role === "owner" || user.role === "manager";
  const tenant = (await Tenant.findById(tid).select("modules").lean()) as { modules?: Record<string, boolean> } | null;
  const m = tenant?.modules ?? {};

  const rx = new RegExp(escapeRegex(q), "i");
  const digits = q.replace(/\D/g, "");
  // 0300-1234567, 0300 1234567 and 03001234567 are the same number.
  const num = digits.length >= 4 && digits.length >= q.replace(/[\s-]/g, "").length ? new RegExp(digits.split("").join("[-\\s]?")) : null;
  const words = q.split(/\s+/).map((w) => new RegExp(escapeRegex(w), "i"));
  const exactNo = new RegExp(`^${escapeRegex(q)}`, "i");

  const [parties, products, sales, returns, devices, repairs, plans, used, wtx, purchases, receipts, shifts] = await Promise.all([
    Party.find({ tenant: tid, active: { $ne: false }, ...(manage ? {} : { type: "customer" }), $or: [{ name: rx }, ...(num ? [{ phone: num }] : [])] })
      .select("type name phone balance")
      .sort({ name: 1 })
      .limit(PER * 2)
      .lean(),
    Product.find({ tenant: tid, active: true, $or: [{ barcode: q }, { "packs.barcode": q }, { sku: q }, { $and: words.map((w) => ({ $or: [{ name: w }, { nameUrdu: w }, { brand: w }, { fits: w }] })) }] })
      .select("name salePrice brand fits trackSerial")
      .sort({ name: 1 })
      .limit(PER)
      .lean(),
    Sale.find({ tenant: tid, ...(user.role === "cashier" ? { branch: ctx.branchId } : {}), $or: [{ invoiceNo: exactNo }, { customerName: rx }] })
      .select("invoiceNo customerName total createdAt status")
      .sort({ createdAt: -1 })
      .limit(PER)
      .lean(),
    SaleReturn.find({ tenant: tid, returnNo: exactNo }).select("returnNo invoiceNo total createdAt").sort({ createdAt: -1 }).limit(3).lean(),
    m.phones && digits.length >= 4 ? Device.find({ tenant: tid, $or: [{ imei: new RegExp(digits) }, { imei2: new RegExp(digits) }] }).select("imei productName status color storage").sort({ createdAt: -1 }).limit(PER).lean() : [],
    m.repairs
      ? Repair.find({ tenant: tid, $or: [{ jobNo: exactNo }, { customerName: rx }, { deviceName: rx }, ...(num ? [{ customerPhone: num }] : []), ...(digits.length >= 4 ? [{ imei: new RegExp(digits) }] : [])] })
          .select("jobNo customerName deviceName status createdAt")
          .sort({ createdAt: -1 })
          .limit(PER)
          .lean()
      : [],
    m.installments
      ? InstallmentPlan.find({ tenant: tid, $or: [{ planNo: exactNo }, { invoiceNo: exactNo }, { customerName: rx }, { itemsText: rx }, ...(num ? [{ customerPhone: num }, { customerCnic: num }] : [])] })
          .select("planNo customerName status financed paid")
          .sort({ createdAt: -1 })
          .limit(PER)
          .lean()
      : [],
    m.phones && manage
      ? UsedPurchase.find({ tenant: tid, $or: [{ buyNo: exactNo }, { "seller.name": rx }, ...(num ? [{ "seller.cnic": num }, { "seller.phone": num }] : []), ...(digits.length >= 4 ? [{ imei: new RegExp(digits) }] : [])] })
          .select("buyNo productName seller.name price createdAt")
          .sort({ createdAt: -1 })
          .limit(PER)
          .lean()
      : [],
    m.wallets ? WalletTxn.find({ tenant: tid, $or: [{ txnNo: exactNo }, ...(num ? [{ customerNumber: num }] : []), ...(q.length >= 4 ? [{ ref: exactNo }] : [])] }).select("txnNo type amount customerNumber walletName createdAt").sort({ createdAt: -1 }).limit(PER).lean() : [],
    // Purchases (by number or the supplier's invoice no.), khata receipts / vouchers and drawer sessions, by number.
    manage ? Purchase.find({ tenant: tid, $or: [{ purchaseNo: exactNo }, ...(q.length >= 3 ? [{ supplierInvoice: exactNo }] : [])] }).select("purchaseNo supplierName total createdAt status").sort({ createdAt: -1 }).limit(PER).lean() : [],
    q.length >= 3 ? LedgerEntry.find({ tenant: tid, refType: "payment", refNo: exactNo }).select("refNo amount createdAt").sort({ createdAt: -1 }).limit(PER).lean() : [],
    manage && q.length >= 3 ? Shift.find({ tenant: tid, shiftNo: exactNo }).select("shiftNo branchName openedAt status").sort({ openedAt: -1 }).limit(3).lean() : [],
  ]);

  const groups: SearchGroup[] = [];
  const push = (type: string, label: string, hits: SearchHit[]) => hits.length && groups.push({ type, label, hits: hits.slice(0, PER) });
  push(
    "customer",
    "Customers",
    parties
      .filter((p) => p.type === "customer")
      .map((p) => ({ type: "customer", id: String(p._id), title: p.name, subtitle: [p.phone, p.balance > 0 ? `owes ${money(p.balance)}` : p.balance < 0 ? `advance ${money(-p.balance)}` : ""].filter(Boolean).join(" · "), href: `/customers/${p._id}` })),
  );
  push(
    "supplier",
    "Suppliers",
    parties.filter((p) => p.type === "supplier").map((p) => ({ type: "supplier", id: String(p._id), title: p.name, subtitle: [p.phone, p.balance > 0 ? `to pay ${money(p.balance)}` : ""].filter(Boolean).join(" · "), href: `/suppliers/${p._id}` })),
  );
  push(
    "product",
    "Products",
    products.map((p) => ({ type: "product", id: String(p._id), title: p.name, subtitle: [money(p.salePrice), p.brand, p.fits && `fits ${p.fits}`].filter(Boolean).join(" · "), href: p.trackSerial ? `/phones?product=${p._id}` : `/products?q=${encodeURIComponent(p.name)}` })),
  );
  push(
    "device",
    "Phones (IMEI)",
    devices.map((d) => ({ type: "device", id: String(d._id), title: `${d.productName} · ${d.imei}`, subtitle: [STATUS[d.status] ?? d.status, d.color, d.storage].filter(Boolean).join(" · "), href: `/phones?q=${d.imei}` })),
  );
  push(
    "sale",
    "Bills",
    [
      ...sales.map((s) => ({ type: "sale", id: String(s._id), title: s.invoiceNo, subtitle: [s.customerName ?? "Walk-in", money(s.total), day(s.createdAt), s.status !== "completed" ? s.status.replace("_", " ") : ""].filter(Boolean).join(" · "), href: `/sales?q=${s.invoiceNo}&from=${day(s.createdAt)}&to=${day(s.createdAt)}` })),
      ...returns.map((r) => ({ type: "return", id: String(r._id), title: r.returnNo, subtitle: `Return of ${r.invoiceNo} · ${money(r.total)} · ${day(r.createdAt)}`, href: `/receipt/return/${r._id}` })),
    ],
  );
  push(
    "purchase",
    "Purchases",
    purchases.map((p) => ({ type: "purchase", id: String(p._id), title: p.purchaseNo, subtitle: [p.supplierName, money(p.total), day(p.createdAt), p.status === "void" ? "cancelled" : ""].filter(Boolean).join(" · "), href: `/purchases?id=${p._id}` })),
  );
  push(
    "receipt",
    "Payment receipts",
    receipts.map((r) => ({ type: "receipt", id: String(r._id), title: r.refNo ?? "", subtitle: `${money(Math.abs(r.amount))} · ${day(r.createdAt)}`, href: `/receipt/payment/${r._id}` })),
  );
  push(
    "shift",
    "Cash drawer",
    shifts.map((x) => ({ type: "shift", id: String(x._id), title: x.shiftNo, subtitle: [x.branchName, day(x.openedAt), x.status === "open" ? "open now" : "closed"].filter(Boolean).join(" · "), href: `/receipt/shift/${x._id}` })),
  );
  push(
    "repair",
    "Repairs",
    repairs.map((r) => ({ type: "repair", id: String(r._id), title: `${r.jobNo} · ${r.deviceName}`, subtitle: `${r.customerName} · ${r.status.replace("_", " ")}`, href: `/repairs/${r._id}` })),
  );
  push(
    "installment",
    "Installments",
    plans.map((p) => ({ type: "installment", id: String(p._id), title: `${p.planNo} · ${p.customerName}`, subtitle: p.status === "active" ? `${money(Math.max(0, p.financed - p.paid))} left` : p.status === "completed" ? "Paid off" : "Closed", href: `/installments/${p._id}` })),
  );
  push(
    "used",
    "Used phones bought",
    used.map((u) => ({ type: "used", id: String(u._id), title: `${u.buyNo} · ${u.productName}`, subtitle: `${u.seller?.name ?? ""} · ${money(u.price)}`, href: `/used-phones?q=${u.buyNo}&from=${day(u.createdAt)}&to=${day(u.createdAt)}` })),
  );
  push(
    "wallet",
    "Easyload & wallets",
    wtx.map((t) => ({ type: "wallet", id: String(t._id), title: `${t.txnNo} · ${money(t.amount)}`, subtitle: [t.customerNumber, t.walletName, day(t.createdAt)].filter(Boolean).join(" · "), href: `/receipt/wallet/${t._id}` })),
  );
  return groups;
}

const STATUS: Record<string, string> = { in_stock: "In stock", sold: "Sold", returned: "Returned to supplier", removed: "Removed" };
