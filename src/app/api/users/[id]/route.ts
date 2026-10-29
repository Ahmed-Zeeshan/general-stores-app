import { z } from "zod";
import { ApiError, forgetUser, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertSeatAvailable, hashPassword } from "@/lib/tenants";
import { Branch, User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(["owner", "manager", "cashier"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
  branch: z.string().regex(/^[a-f0-9]{24}$/i).optional().or(z.literal("")).or(z.null()),
  /** "" removes the PIN. */
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits").optional().or(z.literal("")),
  /** Empty = no limit. */
  maxDiscountPct: z.union([z.literal(""), z.null(), z.coerce.number().min(0).max(100)]).optional(),
  allowUdhaar: z.boolean().optional(),
  allowCashOut: z.boolean().optional(),
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { user: me, tid } = await requireTenant(["owner"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const target = await User.findOne({ _id: id, tenant: tid }).lean();
  if (!target) throw new ApiError(404, "User not found.");
  if (id === me.id && (body.active === false || (body.role && body.role !== "owner"))) {
    throw new ApiError(400, "You cannot disable or demote your own account.");
  }
  if (body.active === true && !target.active) await assertSeatAvailable(tid);

  if (body.branch && !(await Branch.exists({ _id: body.branch, tenant: tid, active: true }))) throw new ApiError(400, "Branch not found.");
  if (id === me.id && body.branch) throw new ApiError(400, "Keep your own account free to switch between branches.");
  const update: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (body.branch) update.branch = body.branch;
  else if (body.branch === "" || body.branch === null) unset.branch = 1;
  if (body.name) update.name = body.name;
  if (body.role) update.role = body.role;
  if (body.active !== undefined) update.active = body.active;
  // A new password also ends every login made with the old one.
  if (body.password) update.passwordHash = await hashPassword(body.password);
  if (body.pin) {
    update.pinHash = await hashPassword(body.pin);
    update.hasPin = true;
    update.pinFailures = 0;
  } else if (body.pin === "") {
    update.hasPin = false;
    unset.pinHash = 1;
  }
  if (typeof body.maxDiscountPct === "number") update.maxDiscountPct = body.maxDiscountPct;
  else if (body.maxDiscountPct === "" || body.maxDiscountPct === null) unset.maxDiscountPct = 1;
  if (body.allowUdhaar !== undefined) update.allowUdhaar = body.allowUdhaar;
  if (body.allowCashOut !== undefined) update.allowCashOut = body.allowCashOut;
  const updated = await User.findOneAndUpdate({ _id: id, tenant: tid }, { $set: update, $unset: unset, ...(body.password ? { $inc: { sessionVersion: 1 } } : {}) }, { new: true }).lean();
  forgetUser(id);
  const changes = [
    body.name && body.name !== target.name && `name → ${body.name}`,
    body.role && body.role !== target.role && `role ${target.role} → ${body.role}`,
    body.active !== undefined && body.active !== target.active && (body.active ? "enabled" : "disabled"),
    body.password && "password reset",
    body.pin !== undefined && (body.pin ? "PIN set" : "PIN removed"),
    body.maxDiscountPct !== undefined && String(body.maxDiscountPct ?? "") !== String(target.maxDiscountPct ?? "") && `discount limit ${body.maxDiscountPct === "" || body.maxDiscountPct === null ? "removed" : `${body.maxDiscountPct}%`}`,
    body.allowUdhaar !== undefined && body.allowUdhaar !== (target.allowUdhaar ?? true) && (body.allowUdhaar ? "may give udhaar" : "no udhaar"),
    (body.branch !== undefined && String(body.branch || "") !== String(target.branch ?? "")) && "branch changed",
  ].filter(Boolean);
  if (changes.length) {
    await logActivity({ tid, user: me }, { action: "user.update", summary: `Staff ${target.name}: ${changes.join(", ")}`, refType: "user", refId: target._id });
  }
  return updated;
});
