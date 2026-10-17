import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { syncReturnToFbr } from "@/lib/fbr";
import { createReturn } from "@/lib/returns";
import { Party, Sale, Tenant } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ reason: z.string().trim().max(200).optional() });

/**
 * Correct a saved bill (owner / manager): the bill is returned in full — stock back, udhaar taken off,
 * the rest given back the way it was paid — and its lines come back so New Bill can open them, fix
 * them and save the corrected bill (linked to this one). Both bills stay on record.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid, branchId } = ctx;
  const { id } = await params;
  const body = Body.parse(await req.json().catch(() => ({})));
  const sale = await Sale.findOne({ _id: id, tenant: tid }).lean();
  if (!sale) throw new ApiError(404, "Bill not found.");
  assertBranchAccess(ctx, sale.branch, "Bill");
  if (sale.installment) throw new ApiError(400, "This bill is on installments. Close the installment plan instead (Installments → plan).");
  if (sale.status === "returned") throw new ApiError(400, "This bill has already been fully returned.");

  const ret = await createReturn({
    tid,
    saleId: id,
    reason: `Bill correction${body.reason ? ` — ${body.reason}` : ""}`,
    user: { id: user.id, name: user.name },
    fallbackBranch: branchId,
  });
  await logActivity(
    { tid, user, branchId },
    {
      action: "sale.return",
      summary: `${ret.returnNo}: bill ${ret.invoiceNo} returned in full to correct it (Rs ${ret.total})${ret.refund > 0 ? `, Rs ${ret.refund} back (${ret.refundMethod})` : ""}`,
      refType: "sale",
      refId: ret.sale,
      refNo: ret.returnNo,
      amount: ret.total,
    },
  );
  const tenant = await Tenant.findById(tid).select("fbrEnabled").lean();
  if (tenant?.fbrEnabled && ret.fbrStatus === "pending") await syncReturnToFbr(tid, ret._id);

  // What was still on the bill before this return, line by line, for New Bill to open again.
  const lines = sale.items
    .map((it) => {
      const left = Math.round((it.qty - (it.returnedQty ?? 0)) * 1000) / 1000;
      if (left <= 0) return null;
      if (it.serials?.length) return { productId: String(it.product), name: it.name, phone: true, qty: left };
      const size = it.pack?.name && it.pack.size ? it.pack.size : 0;
      return {
        productId: String(it.product),
        name: it.name,
        qty: size ? Math.round((left / size) * 1000) / 1000 : left,
        price: size ? it.pack!.price : it.price,
        ...(size ? { pack: it.pack!.name } : {}),
        discount: Math.round((it.discount ?? 0) * (left / it.qty) * 100) / 100,
      };
    })
    .filter(Boolean);
  const customer = sale.customer ? await Party.findOne({ _id: sale.customer, tenant: tid, type: "customer" }).lean() : null;
  const manual = Math.max(0, (sale.discount ?? 0) - (sale.promo?.amount ?? 0) - (sale.pointsValue ?? 0));
  return {
    sale: { _id: String(sale._id), invoiceNo: sale.invoiceNo },
    returnNo: ret.returnNo,
    refund: ret.refund,
    refundMethod: ret.refundMethod,
    lines,
    customer,
    discount: Math.round(manual * 100) / 100,
  };
});
