import { z } from "zod";
import { handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { Purchase } from "@/models";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { voidPurchase } from "@/lib/purchase-returns";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ reason: z.string().trim().max(200).optional() });

/** Cancels a purchase entered by mistake. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid } = ctx;
  const { id } = await params;
  assertBranchAccess(ctx, (await Purchase.findOne({ _id: id, tenant: tid }).select("branch").lean())?.branch, "Purchase");
  const body = Body.parse(await req.json().catch(() => ({})));
  const p = await voidPurchase({ tid, purchaseId: id, reason: body.reason, user: { id: user.id, name: user.name } });
  if (p) await logActivity({ tid, user }, { action: "purchase.cancel", summary: `Cancelled purchase ${p.purchaseNo} (Rs ${p.total})${body.reason ? ` — ${body.reason}` : ""}`, refType: "purchase", refId: p._id, refNo: p.purchaseNo, amount: p.total });
  return p;
});
