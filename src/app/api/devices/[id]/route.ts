import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { DEVICE_CONDITIONS, PTA_STATUS } from "@/lib/constants";
import { checkNewUnits, cleanImei } from "@/lib/devices";
import { Device } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const ctx = await requireBranch();
  const { tid } = ctx;
  const { id } = await params;
  const d = await Device.findOne({ _id: id, tenant: tid }).lean();
  assertBranchAccess(ctx, d?.branch, "Phone");
  if (!d) throw new ApiError(404, "Phone not found.");
  return d;
});

const Body = z.object({
  imei: z.string().trim().min(1).max(40).optional(),
  imei2: z.string().trim().max(40).optional(),
  color: z.string().trim().max(30).optional(),
  storage: z.string().trim().max(30).optional(),
  condition: z.enum(DEVICE_CONDITIONS).optional(),
  pta: z.enum(PTA_STATUS).optional(),
  price: z.union([z.coerce.number().min(0), z.literal(""), z.null()]).optional(),
  notes: z.string().trim().max(200).optional(),
});

/** Corrects a phone's details. The IMEI can be corrected only while it is in stock. */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid, branchId } = ctx;
  const { id } = await params;
  const body = Body.parse(await req.json());
  const d = await Device.findOne({ _id: id, tenant: tid }).lean();
  assertBranchAccess(ctx, d?.branch, "Phone");
  if (!d) throw new ApiError(404, "Phone not found.");
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  const changes: string[] = [];
  const newImei = body.imei !== undefined ? cleanImei(body.imei) : d.imei;
  const newImei2 = body.imei2 !== undefined ? cleanImei(body.imei2) || undefined : d.imei2 ?? undefined;
  if (newImei !== d.imei || (newImei2 ?? null) !== (d.imei2 ?? null)) {
    if (d.status !== "in_stock") throw new ApiError(400, "The IMEI of a sold or returned phone cannot be changed.");
    const others = [newImei, ...(newImei2 ? [newImei2] : [])].filter((x) => x !== d.imei && x !== d.imei2);
    if (others.length) await checkNewUnits(tid, [{ imei: others[0], ...(others[1] ? { imei2: others[1] } : {}) }]);
    set.imei = newImei;
    if (newImei2) set.imei2 = newImei2;
    else unset.imei2 = 1;
    changes.push(`IMEI ${d.imei}${d.imei2 ? ` / ${d.imei2}` : ""} → ${newImei}${newImei2 ? ` / ${newImei2}` : ""}`);
  }
  for (const k of ["color", "storage", "condition", "pta", "notes"] as const) {
    if (body[k] !== undefined && (body[k] || undefined) !== (d[k] ?? undefined)) {
      if (body[k]) set[k] = body[k];
      else unset[k] = 1;
      changes.push(k);
    }
  }
  if (body.price !== undefined) {
    const price = typeof body.price === "number" && body.price > 0 ? body.price : undefined;
    if (price !== (d.price ?? undefined)) {
      if (price) set.price = price;
      else unset.price = 1;
      changes.push(`price ${d.price ?? "—"} → ${price ?? "—"}`);
    }
  }
  if (!changes.length) return d;
  try {
    await Device.updateOne(
      { _id: d._id, tenant: tid },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}), $push: { history: { action: "Details changed", note: changes.join(", "), userName: user.name, at: new Date() } } },
    );
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, `IMEI ${newImei} is already in stock.`);
    throw err;
  }
  await logActivity({ tid, user, branchId }, { action: "device.update", summary: `${d.productName} ${d.imei}: ${changes.join(", ")}`, refType: "device", refId: d._id });
  return Device.findOne({ _id: d._id, tenant: tid }).lean();
});
