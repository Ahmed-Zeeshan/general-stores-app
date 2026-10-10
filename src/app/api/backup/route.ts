import { handle, requireTenant } from "@/lib/api";
import { backupResponse, tenantBackup } from "@/lib/backup";

export const GET = handle(async () => {
  const { tid } = await requireTenant(["owner"]);
  const backup = await tenantBackup(tid);
  return backupResponse(backup.shop?.shopName ?? "shop", backup);
});
