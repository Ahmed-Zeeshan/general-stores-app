import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { Wallet } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  number: z.string().trim().max(30).optional(),
  lowAlert: z.coerce.number().min(0).optional(),
  commissionPct: z.coerce.number().min(0).max(50).optional(),
  feePct: z.coerce.number().min(0).max(50).optional(),
  active: z.boolean().optional(),
});

/** Changes an account's details (the balance changes only through entries). */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const w = await Wallet.findOneAndUpdate({ _id: id, tenant: tid }, { $set: body }, { new: true }).lean();
  if (!w) throw new ApiError(404, "Account not found.");
  await logActivity({ tid, user, branchId }, { action: "wallet.update", summary: `${w.name}: ${Object.keys(body).join(", ")} changed`, refType: "wallet", refId: w._id });
  return w;
});
