import { z } from "zod";
import { handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { Purchase } from "@/models";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { createPurchaseReturn } from "@/lib/purchase-returns";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** Lines by their position on the purchase. Omitted = everything not yet returned. */
  items: z
    .array(
      z.object({
        index: z.coerce.number().int().min(0),
        qty: z.coerce.number().positive("Quantity must be more than zero"),
        /** Phones (track IMEI): which phones go back. */
        serials: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(500).optional(),
      }),
    )
    .optional(),
  /** khata = reduce what we owe the supplier (default); cash = supplier paid the money back. */
  settlement: z.enum(["khata", "cash"]).optional(),
  reason: z.string().trim().max(200).optional(),
});

/** Goods sent back to the supplier. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid } = ctx;
  const { id } = await params;
  assertBranchAccess(ctx, (await Purchase.findOne({ _id: id, tenant: tid }).select("branch").lean())?.branch, "Purchase");
  const body = Body.parse(await req.json().catch(() => ({})));
  const ret = await createPurchaseReturn({ tid, purchaseId: id, lines: body.items, settlement: body.settlement, reason: body.reason, user: { id: user.id, name: user.name } });
  await logActivity(
    { tid, user },
    { action: "purchase.return", summary: `${ret.returnNo} from ${ret.purchaseNo}: Rs ${ret.total} back to ${ret.supplierName ?? "supplier"} (${ret.settlement === "khata" ? "less in khata" : "cash back"})`, refType: "purchase", refId: ret.purchase, refNo: ret.returnNo, amount: ret.total },
  );
  return ret;
});
