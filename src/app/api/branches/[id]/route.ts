import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { Branch, StockLevel, Tenant, User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(2).optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid, user } = await requireBranch(["owner"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const branch = await Branch.findOne({ _id: id, tenant: tid }).lean();
  if (!branch) throw new ApiError(404, "Branch not found.");

  if (body.active === false && branch.active) {
    if (branch.isMain) throw new ApiError(400, "The main branch cannot be closed.");
    if (await User.exists({ tenant: tid, branch: id, active: true })) {
      throw new ApiError(400, "Staff are still assigned to this branch. Move them to another branch first.");
    }
    if (await StockLevel.exists({ tenant: tid, branch: id, qty: { $ne: 0 } })) {
      throw new ApiError(400, "This branch still has stock. Transfer it to another branch (or set it to zero) first.");
    }
  }
  if (body.active === true && !branch.active) {
    const [tenant, active] = await Promise.all([Tenant.findById(tid).select("maxBranches").lean(), Branch.countDocuments({ tenant: tid, active: true })]);
    if (active >= (tenant?.maxBranches ?? 1)) throw new ApiError(400, "Branch limit reached. Ask the administrator to increase it.");
  }
  const saved = await Branch.findOneAndUpdate({ _id: id, tenant: tid }, body, { new: true }).lean();
  if (body.active !== undefined && body.active !== branch.active) {
    await logActivity({ tid, user }, { action: "branch.update", summary: `${body.active ? "Re-opened" : "Closed"} branch ${branch.name}`, refType: "branch", refId: branch._id });
  }
  return saved;
});
