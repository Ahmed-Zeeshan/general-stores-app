import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { backupDir, listBackups, readBackupStatus } from "@/lib/auto-backup";

/**
 * This shop's automatic (nightly) backups on the shop computer: status, the folder they are saved in,
 * and the latest copies to download (?file=…). Point BACKUP_DIR at a Google Drive / OneDrive folder
 * and every copy is also kept online.
 */
export const GET = handle(async (req) => {
  const { tid } = await requireTenant(["owner"]);
  const mine = (await listBackups()).find((f) => f.tenantId === String(tid));
  const file = new URL(req.url).searchParams.get("file");
  if (file) {
    if (!/^\d{4}-\d{2}-\d{2}_\d{4}\.json\.gz$/.test(file) || !mine?.files.some((f) => f.name === file)) throw new ApiError(404, "Backup not found.");
    const data = await readFile(join(backupDir(), mine.folder, file));
    return new Response(data, { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="backup-${file}"`, "Cache-Control": "no-store" } });
  }
  const status = await readBackupStatus();
  return {
    enabled: process.env.AUTO_BACKUP !== "off",
    time: process.env.AUTO_BACKUP_TIME || "22:30",
    keep: Number(process.env.AUTO_BACKUP_KEEP) || 30,
    dir: backupDir(),
    lastRunAt: status.lastRunAt ?? null,
    lastOk: status.lastOk ?? null,
    lastError: status.lastOk === false ? status.lastError : undefined,
    files: (mine?.files ?? []).slice(0, 10),
  };
});
