import { Types } from "mongoose";
import { ApiError, handle, isObjectId, requireSuperAdmin } from "@/lib/api";
import { backupResponse, tenantBackup } from "@/lib/backup";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireSuperAdmin();
  const { id } = await params;
  if (!isObjectId(id)) throw new ApiError(404, "Shop not found.");
  const backup = await tenantBackup(new Types.ObjectId(id));
  if (!backup.shop) throw new ApiError(404, "Shop not found.");
  return backupResponse(backup.shop.shopName, backup);
});
