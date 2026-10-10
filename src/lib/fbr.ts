import type { Types } from "mongoose";
import { Product, Sale, Tenant } from "@/models";
import { round2 } from "./money";

/**
 * FBR (Federal Board of Revenue) POS integration for Tier-1 retailers.
 *
 * Every bill is reported to FBR's IMS "PostData" API; FBR answers with a fiscal invoice number
 * that must be printed on the receipt together with a QR code. If FBR is unreachable the bill is
 * still saved and marked "pending" so it can be re-sent later (Settings → FBR → Send pending).
 *
 * Endpoints and field names follow FBR's POS integration guide. Confirm them with your FBR
 * integration contact before going live; both URLs can be overridden with environment variables.
 */
export const FBR_URLS = {
  sandbox: process.env.FBR_SANDBOX_URL || "https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData",
  live: process.env.FBR_LIVE_URL || "https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData",
};

/** FBR payment modes: 1 Cash, 2 Card, 3 Gift voucher, 4 Loyalty card, 5 Mixed, 6 Cheque. */
function paymentMode(method: string, creditAmount: number, amountPaid: number) {
  if (creditAmount > 0 && amountPaid > 0) return 5;
  if (method === "card" || method === "jazzcash" || method === "easypaisa" || method === "bank") return 2;
  return 1;
}

type SaleLike = {
  invoiceNo: string;
  createdAt: Date;
  items: { product?: Types.ObjectId | null; name: string; qty: number; total: number; discount: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  creditAmount: number;
  customerName?: string | null;
  fbrInvoiceNumber?: string | null;
};

function fbrDate(d: Date) {
  // FBR expects local date-time "yyyy-MM-dd HH:mm:ss".
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function buildFbrInvoice(
  sale: SaleLike,
  opts: { posId: string; defaultPct: string; inclusive: boolean; pctByProduct: Map<string, string>; type: "sale" | "return" },
) {
  const rate = sale.taxRate || 0;
  const items = sale.items.map((i) => {
    // Spread the bill discount over the items in proportion to their value.
    const share = sale.subtotal > 0 ? (sale.discount * i.total) / sale.subtotal : 0;
    const net = i.total - share;
    const saleValue = rate && opts.inclusive ? net / (1 + rate / 100) : net;
    const taxCharged = saleValue * (rate / 100);
    return {
      ItemCode: i.product ? String(i.product) : i.name,
      ItemName: i.name,
      Quantity: i.qty,
      PCTCode: (i.product && opts.pctByProduct.get(String(i.product))) || opts.defaultPct,
      TaxRate: rate,
      SaleValue: round2(saleValue),
      TotalAmount: round2(saleValue + taxCharged),
      TaxCharged: round2(taxCharged),
      Discount: round2(i.discount + share),
      FurtherTax: 0,
      InvoiceType: opts.type === "sale" ? 1 : 3,
      RefUSIN: opts.type === "return" ? sale.invoiceNo : null,
    };
  });
  return {
    InvoiceNumber: "",
    POSID: Number(opts.posId),
    USIN: opts.type === "sale" ? sale.invoiceNo : `${sale.invoiceNo}-R`,
    DateTime: fbrDate(new Date()),
    BuyerName: sale.customerName ?? "",
    BuyerNTN: "",
    BuyerCNIC: "",
    BuyerPhoneNumber: "",
    TotalBillAmount: round2(sale.total),
    TotalQuantity: round2(sale.items.reduce((s, i) => s + i.qty, 0)),
    TotalSaleValue: round2(items.reduce((s, i) => s + i.SaleValue, 0)),
    TotalTaxCharged: round2(sale.tax),
    Discount: round2(sale.discount),
    FurtherTax: 0,
    PaymentMode: paymentMode(sale.paymentMethod, sale.creditAmount, sale.amountPaid),
    RefUSIN: opts.type === "return" ? sale.fbrInvoiceNumber ?? sale.invoiceNo : null,
    InvoiceType: opts.type === "sale" ? 1 : 3,
    Items: items,
  };
}

async function postInvoice(url: string, token: string, payload: unknown): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as { InvoiceNumber?: string; Code?: string; Response?: string; Errors?: string } | null;
  if (!res.ok || !data?.InvoiceNumber || (data.Code && data.Code !== "100")) {
    throw new Error(data?.Errors || data?.Response || `FBR returned HTTP ${res.status}`);
  }
  return data.InvoiceNumber;
}

/** Reports one bill (or its return) to FBR and stores the result on the sale. Never throws. */
export async function syncSaleToFbr(tid: Types.ObjectId, saleId: Types.ObjectId | string, type: "sale" | "return" = "sale") {
  const tenant = await Tenant.findById(tid).select("+fbrToken fbrEnabled fbrMode fbrPosId fbrDefaultPct pricesIncludeTax").lean();
  if (!tenant?.fbrEnabled) return null;
  const sale = await Sale.findOne({ _id: saleId, tenant: tid }).lean();
  if (!sale) return null;

  if (!tenant.fbrPosId || !tenant.fbrToken) {
    await Sale.updateOne({ _id: sale._id, tenant: tid }, { fbrStatus: "pending", fbrError: "FBR POS ID or token is missing in Settings." });
    return null;
  }

  const productIds = sale.items.map((i) => i.product).filter(Boolean);
  const products = await Product.find({ tenant: tid, _id: { $in: productIds } }).select("pctCode").lean();
  const pctByProduct = new Map(products.filter((p) => p.pctCode).map((p) => [String(p._id), p.pctCode as string]));

  const payload = buildFbrInvoice(sale as unknown as SaleLike, {
    posId: tenant.fbrPosId,
    defaultPct: tenant.fbrDefaultPct || "11001010",
    inclusive: tenant.pricesIncludeTax ?? true,
    pctByProduct,
    type,
  });

  try {
    const number = await postInvoice(FBR_URLS[tenant.fbrMode === "live" ? "live" : "sandbox"], tenant.fbrToken, payload);
    const set = type === "sale" ? { fbrInvoiceNumber: number, fbrStatus: "synced" } : { fbrReturnInvoiceNumber: number, fbrStatus: "synced" };
    await Sale.updateOne({ _id: sale._id, tenant: tid }, { $set: { ...set, fbrError: null }, $inc: { fbrAttempts: 1 } });
    return number;
  } catch (err) {
    const message = (err as Error).name === "TimeoutError" ? "FBR did not respond in time" : (err as Error).message;
    await Sale.updateOne({ _id: sale._id, tenant: tid }, { $set: { fbrStatus: "pending", fbrError: message }, $inc: { fbrAttempts: 1 } });
    return null;
  }
}
