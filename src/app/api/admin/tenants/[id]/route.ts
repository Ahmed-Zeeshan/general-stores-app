import { z } from "zod";
import { ApiError, forgetTenant, handle, requireSuperAdmin } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { Branch, Tenant, User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireSuperAdmin();
  const { id } = await params;
  const tenant = await Tenant.findById(id).lean();
  if (!tenant) throw new ApiError(404, "Shop not found.");
  const [users, branches] = await Promise.all([
    User.find({ tenant: id }).sort({ createdAt: 1 }).lean(),
    Branch.find({ tenant: id }).sort({ isMain: -1, name: 1 }).lean(),
  ]);
  return { tenant, users, branches };
});

const Body = z.object({
  shopName: z.string().trim().min(2).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  maxUsers: z.coerce.number().int().min(1).max(1000).optional(),
  maxBranches: z.coerce.number().int().min(1).max(200).optional(),
  plan: z.string().trim().optional(),
  expiresAt: z
    .string()
    .optional()
    .nullable()
    // Left out = keep the plan end date; empty or null = no end date.
    .transform((v) => (v === undefined ? undefined : v ? new Date(`${v}T23:59:59`) : null)),
  adminNotes: z.string().trim().optional(),
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const admin = await requireSuperAdmin();
  const { id } = await params;
  const { expiresAt, ...body } = Body.parse(await req.json());
  const before = (await Tenant.findById(id).select("status maxUsers maxBranches expiresAt").lean()) as Record<string, unknown> | null;
  const update: Record<string, unknown> = { $set: body };
  if (expiresAt) (update.$set as Record<string, unknown>).expiresAt = expiresAt;
  else if (expiresAt === null) update.$unset = { expiresAt: 1 };
  const tenant = await Tenant.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!tenant) throw new ApiError(404, "Shop not found.");
  forgetTenant(id);
  // The shop owner can see what the administrator changed (notes stay private).
  const watched = ["status", "maxUsers", "maxBranches"] as const;
  const changes = watched.filter((k) => body[k] !== undefined && String(before?.[k]) !== String(body[k])).map((k) => `${k} ${before?.[k] ?? "—"} → ${body[k]}`);
  if (String(before?.expiresAt ?? "") !== String(tenant.expiresAt ?? "")) changes.push(`plan end ${tenant.expiresAt ? new Date(tenant.expiresAt).toLocaleDateString("en-PK") : "removed"}`);
  if (changes.length) {
    await logActivity({ tid: tenant._id, user: { id: admin.id, name: `${admin.name} (administrator)`, role: "superadmin" } }, { action: "admin.update", summary: `Administrator changed: ${changes.join(", ")}` });
  }
  return tenant;
});
