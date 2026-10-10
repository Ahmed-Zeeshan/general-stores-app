import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, handle, requireSuperAdmin } from "@/lib/api";
import { backupDir } from "@/lib/auto-backup";

/** Download one saved copy (.json.gz — the Restore screens accept it as it is). */
export const GET = handle(async (req) => {
  await requireSuperAdmin();
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder") ?? "";
  const name = url.searchParams.get("name") ?? "";
  // Only plain names from the listing: no paths.
  if (!/^[a-z0-9-]+-[a-f0-9]{24}$/.test(folder) || !/^[\d-]+_\d{4}\.json\.gz$/.test(name)) throw new ApiError(400, "Not a backup file.");
  let data: Buffer;
  try {
    data = await readFile(join(backupDir(), folder, name));
  } catch {
    throw new ApiError(404, "Backup file not found.");
  }
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${folder.replace(/-[a-f0-9]{24}$/, "")}-${name}"` },
  });
});
