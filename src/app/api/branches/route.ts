import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { Branch, Tenant, User } from "@/models";

/** All branches (including closed ones for the owner), the current one, and the plan limit. */
export const GET = handle(async () => {
  const ctx = await requireBranch();
  const isOwner = ctx.user.role === "owner";
  const [all, tenant, users] = await Promise.all([
    Branch.find({ tenant: ctx.tid, ...(isOwner ? {} : { active: true }) }).sort({ isMain: -1, name: 1 }).lean(),
    Tenant.findById(ctx.tid).select("maxBranches").lean(),
    isOwner ? User.find({ tenant: ctx.tid, branch: { $exists: true } }).select("branch").lean() : Promise.resolve([]),
  ]);
  const staff = new Map<string, number>();
  for (const u of users) staff.set(String(u.branch), (staff.get(String(u.branch)) ?? 0) + 1);
  return {
    branches: all.map((b) => ({ ...b, staff: staff.get(String(b._id)) ?? 0 })),
    current: String(ctx.branchId),
    locked: ctx.locked,
    maxBranches: tenant?.maxBranches ?? 1,
    activeBranches: all.filter((b) => b.active).length,
  };
});

const Body = z.object({
  name: z.string().trim().min(2, "Branch name is required"),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export const POST = handle(async (req) => {
  const { tid } = await requireBranch(["owner"]);
  const body = Body.parse(await req.json());
  const [tenant, active] = await Promise.all([Tenant.findById(tid).select("maxBranches").lean(), Branch.countDocuments({ tenant: tid, active: true })]);
  const max = tenant?.maxBranches ?? 1;
  if (active >= max) {
    throw new ApiError(400, `Your plan allows ${max} branch${max === 1 ? "" : "es"}. Ask the administrator to increase the limit.`);
  }
  return Branch.create({ ...body, tenant: tid });
});
