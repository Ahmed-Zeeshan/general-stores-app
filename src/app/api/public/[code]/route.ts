import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { withState, type PlanLean } from "@/lib/installments";
import { round2 } from "@/lib/money";
import { readShareCode } from "@/lib/share";
import { InstallmentPlan, Repair, Sale, Tenant } from "@/models";

type Ctx = { params: Promise<{ code: string }> };

/**
 * What a customer sees from a WhatsApp link — no login. Only the customer's own copy: no costs,
 * profit, staff notes, lock codes or other customers. The signed code decides which record.
 */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { code } = await params;
  const ref = readShareCode(code);
  if (!ref) throw new ApiError(404, "This link is not valid.");
  const { kind, tid, id } = ref;
  const tenant = (await Tenant.findById(tid).select("shopName phone address status").lean()) as { shopName: string; phone?: string; address?: string; status?: string } | null;
  if (!tenant || tenant.status === "suspended") throw new ApiError(404, "This link is not valid.");
  const shop = { name: tenant.shopName, phone: tenant.phone, address: tenant.address };
  let data: unknown;
  if (kind === "sale") {
    const s = await Sale.findOne({ _id: id, tenant: tid }).lean();
    if (!s) throw new ApiError(404, "Bill not found.");
    data = {
      invoiceNo: s.invoiceNo,
      createdAt: s.createdAt,
      customerName: s.customerName,
      items: s.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, price: i.price, total: i.total, pack: i.pack, imeis: (i.serials ?? []).filter((x) => !x.returned).map((x) => x.imei), warrantyUntil: i.warrantyUntil, returnedQty: i.returnedQty })),
      subtotal: s.subtotal,
      discount: s.discount,
      tax: s.tax,
      total: s.total,
      paid: round2(Math.min(s.total, s.amountPaid ?? 0)),
      creditAmount: s.creditAmount ?? 0,
      installment: !!s.installment,
      status: s.status,
      fbrInvoiceNumber: s.fbrInvoiceNumber,
    };
  } else if (kind === "repair") {
    const r = await Repair.findOne({ _id: id, tenant: tid }).lean();
    if (!r) throw new ApiError(404, "Repair job not found.");
    data = {
      jobNo: r.jobNo,
      createdAt: r.createdAt,
      customerName: r.customerName,
      deviceName: r.deviceName,
      problem: r.problem,
      status: r.status,
      estimate: r.estimate,
      promisedAt: r.promisedAt,
      parts: (r.parts ?? []).map((p) => ({ name: p.name, qty: p.qty, price: p.price })),
      labour: r.labour,
      discount: r.discount,
      total: r.total,
      paid: r.paid,
      balance: round2(Math.max(0, (r.total ?? 0) - (r.paid ?? 0) - (r.creditAmount ?? 0))),
      deliveredAt: r.deliveredAt,
      warrantyUntil: r.warrantyUntil,
    };
  } else {
    const p = (await InstallmentPlan.findOne({ _id: id, tenant: tid }).lean()) as PlanLean | null;
    if (!p) throw new ApiError(404, "Installment plan not found.");
    const s = withState(p);
    data = {
      planNo: p.planNo,
      createdAt: p.createdAt,
      customerName: p.customerName,
      itemsText: p.itemsText,
      cashPrice: p.cashPrice,
      advance: p.advance,
      financed: p.financed,
      months: p.months,
      rows: s.rows,
      paid: p.paid,
      balance: s.balance,
      overdue: s.overdue,
      next: s.next,
      status: p.status,
    };
  }
  return NextResponse.json({ kind, shop, data }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
});
