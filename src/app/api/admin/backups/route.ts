import { handle, requireSuperAdmin } from "@/lib/api";
import { backupDir, listBackups, readBackupStatus, runAutoBackup } from "@/lib/auto-backup";
import { Tenant } from "@/models";

/** Automatic backups on this computer: status and saved copies per shop. */
export const GET = handle(async () => {
  await requireSuperAdmin();
  const [status, folders, shops] = await Promise.all([readBackupStatus(), listBackups(), Tenant.find({}).select("shopName").lean()]);
  const names = new Map(shops.map((s) => [String(s._id), s.shopName]));
  return {
    dir: backupDir(),
    enabled: process.env.AUTO_BACKUP !== "off",
    time: process.env.AUTO_BACKUP_TIME || "22:30",
    keep: Number(process.env.AUTO_BACKUP_KEEP) || 30,
    status,
    shops: folders.map((f) => ({ ...f, shopName: names.get(f.tenantId) ?? "(deleted shop)" })),
  };
});

/** Back up every shop now. */
export const POST = handle(async () => {
  await requireSuperAdmin();
  return runAutoBackup();
});
