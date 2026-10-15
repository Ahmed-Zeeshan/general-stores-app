import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { cleanImei } from "@/lib/imei";
import { assertOpen, loadRepair, repairTotals, saveRepair } from "@/lib/repairs";
import { optionalId } from "@/lib/schemas";
import { User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const ctx = await requireBranch();
  const { tid } = ctx;
  const { id } = await params;
  const r = await loadRepair(tid, id);
  assertBranchAccess(ctx, r.branch, "Repair");
  return { ...r, ...repairTotals(r) };
});

const Body = z.object({
  deviceName: z.string().trim().min(2).max(80).optional(),
  imei: z.string().trim().max(40).optional(),
  color: z.string().trim().max(30).optional(),
  lockCode: z.string().trim().max(40).optional(),
  conditionNotes: z.string().trim().max(300).optional(),
  problem: z.string().trim().min(3).max(500).optional(),
  diagnosis: z.string().trim().max(500).optional(),
  estimate: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  promisedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().or(z.literal("")),
  technicianId: optionalId.or(z.literal("")),
  labour: z.coerce.number().min(0).max(10_000_000).optional(),
  discount: z.coerce.number().min(0).max(10_000_000).optional(),
  warrantyDays: z.union([z.coerce.number().int().min(0).max(365), z.literal("")]).optional(),
});

/** Updates the job card: diagnosis, charges, technician, promised date… (not after delivery). */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch();
  const { user, tid, branchId } = ctx;
  const { id } = await params;
  const body = Body.parse(await req.json());
  const r = await loadRepair(tid, id);
  assertBranchAccess(ctx, r.branch, "Repair");
  assertOpen(r);
  if (body.discount !== undefined && body.discount !== (r.discount ?? 0) && user.role === "cashier") throw new ApiError(403, "Only the owner or manager can give a discount.");
  // Lowering the charges works like a discount (and can turn an advance into money given back).
  const labourDown = body.labour !== undefined && body.labour < (r.labour ?? 0);
  if (labourDown && user.role === "cashier") throw new ApiError(403, "Only the owner or manager can lower the repair charges.");
  const set: Record<string, unknown> = {};
  for (const k of ["deviceName", "color", "lockCode", "conditionNotes", "problem", "diagnosis", "labour", "discount"] as const) if (body[k] !== undefined) set[k] = body[k];
  if (body.imei !== undefined) set.imei = body.imei ? cleanImei(body.imei) : undefined;
  if (body.estimate !== undefined) set.estimate = body.estimate === "" ? undefined : body.estimate;
  if (body.warrantyDays !== undefined) set.warrantyDays = body.warrantyDays === "" ? undefined : body.warrantyDays;
  if (body.promisedAt !== undefined) set.promisedAt = body.promisedAt ? new Date(`${body.promisedAt.slice(0, 10)}T18:00:00`) : undefined;
  if (body.technicianId !== undefined) {
    if (!body.technicianId) Object.assign(set, { technician: undefined, technicianName: undefined });
    else {
      const t = await User.findOne({ _id: body.technicianId, tenant: tid, active: true }).select("name").lean();
      if (!t) throw new ApiError(400, "Technician not found.");
      Object.assign(set, { technician: t._id, technicianName: t.name });
    }
  }
  const changes = Object.keys(set).filter((k) => JSON.stringify((r as Record<string, unknown>)[k] ?? null) !== JSON.stringify(set[k] ?? null));
  if (!changes.length) return { ...r, ...repairTotals(r) };
  const saved = await saveRepair(tid, r, { $set: set }, { note: `Changed: ${changes.join(", ")}`, userName: user.name });
  if (set.discount !== undefined && set.discount !== (r.discount ?? 0)) {
    await logActivity({ tid, user, branchId }, { action: "repair.discount", summary: `${r.jobNo}: discount Rs ${r.discount ?? 0} → Rs ${set.discount}`, refType: "repair", refId: r._id, refNo: r.jobNo, amount: Number(set.discount) });
  }
  if (labourDown) {
    await logActivity({ tid, user, branchId }, { action: "repair.labour", summary: `${r.jobNo}: charges lowered Rs ${r.labour ?? 0} → Rs ${body.labour}`, refType: "repair", refId: r._id, refNo: r.jobNo, amount: Number(body.labour) });
  }
  return { ...saved, ...repairTotals(saved) };
});
