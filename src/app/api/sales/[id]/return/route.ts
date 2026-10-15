import { z } from "zod";
import { handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { syncReturnToFbr } from "@/lib/fbr";
import { createReturn } from "@/lib/returns";
import { Sale, SaleReturn, Tenant } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** Items to return by their position on the bill. Omitted = everything not yet returned. */
  items: z
    .array(
      z.object({
        index: z.coerce.number().int().min(0),
        qty: z.coerce.number().positive("Quantity must be more than zero"),
        /** Phones (track IMEI): which of the phones on this line come back. */
        serials: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(500).optional(),
      }),
    )
    .optional(),
  /** How the money that is not udhaar is given back. */
  refundMethod: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank", "khata"]).optional(),
  reason: z.string().trim().max(200).optional(),
});

/** Returns all or some items of a bill. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid, branchId } = ctx;
  const { id } = await params;
  assertBranchAccess(ctx, (await Sale.findOne({ _id: id, tenant: tid }).select("branch").lean())?.branch, "Bill");
  const body = Body.parse(await req.json().catch(() => ({})));
  const ret = await createReturn({
    tid,
    saleId: id,
    lines: body.items,
    refundMethod: body.refundMethod,
    reason: body.reason,
    user: { id: user.id, name: user.name },
    fallbackBranch: branchId,
  });
  await logActivity(
    { tid, user, branchId },
    {
      action: "sale.return",
      summary: `${ret.returnNo} on bill ${ret.invoiceNo}: Rs ${ret.total} (${ret.items.map((i) => `${i.name} ×${i.qty}`).join(", ")})${ret.refund > 0 ? `, Rs ${ret.refund} ${ret.refundMethod === "khata" ? "to khata" : `refunded (${ret.refundMethod})`}` : ""}${body.reason ? ` — ${body.reason}` : ""}`,
      refType: "sale",
      refId: ret.sale,
      refNo: ret.returnNo,
      amount: ret.total,
    },
  );
  const tenant = await Tenant.findById(tid).select("fbrEnabled").lean();
  if (tenant?.fbrEnabled && ret.fbrStatus === "pending") await syncReturnToFbr(tid, ret._id);
  const [sale, saved] = await Promise.all([Sale.findOne({ _id: id, tenant: tid }).lean(), SaleReturn.findOne({ _id: ret._id, tenant: tid }).lean()]);
  return { ...sale, return: saved };
});

/** All returns of this bill. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const ctx = await requireBranch();
  const { tid } = ctx;
  const { id } = await params;
  return SaleReturn.find({ tenant: tid, sale: id }).sort({ createdAt: 1 }).lean();
});
