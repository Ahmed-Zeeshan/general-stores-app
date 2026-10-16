import type { BranchContext } from "./branches";
import type { SessionUser } from "./session";
import { Tenant } from "@/models";

/** Everything the app needs to draw its menu and pages for this person (the /api/auth/me answer). */
export async function sessionData(user: SessionUser, ctx: BranchContext | null) {
  if (!ctx) return { user, settings: null };
  const settings = await Tenant.findById(ctx.tid).select("-adminNotes").lean();
  return {
    user,
    settings,
    branch: { _id: String(ctx.branchId), name: ctx.branch.name, address: ctx.branch.address, phone: ctx.branch.phone },
    branches: ctx.branches.map((b) => ({ _id: String(b._id), name: b.name })),
    branchLocked: ctx.locked,
  };
}
