import { z } from "zod";
import { Types } from "mongoose";
import { ApiError, handle, isObjectId, requireSuperAdmin } from "@/lib/api";
import { restoreTenant } from "@/lib/backup";
import { Tenant } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ backup: z.unknown(), confirm: z.string() });

export const POST = handle<Ctx>(async (req, { params }) => {
  await requireSuperAdmin();
  const { id } = await params;
  if (!isObjectId(id)) throw new ApiError(404, "Shop not found.");
  const tenant = await Tenant.findById(id).select("shopName").lean();
  if (!tenant) throw new ApiError(404, "Shop not found.");
  const body = Body.parse(await req.json());
  if (body.confirm.trim().toLowerCase() !== tenant.shopName.trim().toLowerCase()) {
    throw new ApiError(400, "Type the shop name exactly to confirm the restore.");
  }
  return restoreTenant(new Types.ObjectId(id), body.backup);
});
