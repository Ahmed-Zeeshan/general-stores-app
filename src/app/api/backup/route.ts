import { handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { backupResponse, tenantBackup } from "@/lib/backup";

export const GET = handle(async () => {
  const { tid, user } = await requireTenant(["owner"]);
  await logActivity({ tid, user }, { action: "backup.download", summary: "Downloaded a full backup of the shop" });
  const backup = await tenantBackup(tid);
  return backupResponse(backup.shop?.shopName ?? "shop", backup);
});
