import { handle, requireAnyUser } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { Tenant } from "@/models";

export const GET = handle(async () => {
  const user = await requireAnyUser();
  if (user.role === "superadmin") return { user, settings: null };
  const ctx = await requireBranch();
  const settings = await Tenant.findById(ctx.tid).select("-adminNotes").lean();
  return {
    user,
    settings,
    branch: { _id: String(ctx.branchId), name: ctx.branch.name, address: ctx.branch.address, phone: ctx.branch.phone },
    branches: ctx.branches.map((b) => ({ _id: String(b._id), name: b.name })),
    branchLocked: ctx.locked,
  };
});
