import { z } from "zod";
import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { voidPurchase } from "@/lib/purchase-returns";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ reason: z.string().trim().max(200).optional() });

/** Cancels a purchase entered by mistake. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const body = Body.parse(await req.json().catch(() => ({})));
  return voidPurchase({ tid, purchaseId: id, reason: body.reason, user: { id: user.id, name: user.name } });
});
