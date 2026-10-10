import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { connectDB } from "./db";
import { tenantBackup } from "./backup";
import { Tenant } from "@/models";

/**
 * Nightly copy of every shop to disk (BACKUP_DIR, default ./backups), one gzip file per shop per
 * day, keeping the newest AUTO_BACKUP_KEEP (default 30). Copy this folder to a USB drive or
 * Google Drive now and then — a backup on the same disk does not survive a broken disk.
 */
export const backupDir = () => resolve(process.env.BACKUP_DIR || "backups");
const keep = () => Math.max(1, Number(process.env.AUTO_BACKUP_KEEP) || 30);
/** Local time of day to run, "HH:MM" (default 22:30). */
const runAt = () => (/^\d{1,2}:\d{2}$/.test(process.env.AUTO_BACKUP_TIME ?? "") ? process.env.AUTO_BACKUP_TIME! : "22:30");

export type BackupStatus = { lastRunAt?: string; lastOk?: boolean; lastError?: string; shops?: number; files?: number };
const statusFile = () => join(backupDir(), "last-run.json");

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shop";
const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

export async function readBackupStatus(): Promise<BackupStatus> {
  try {
    return JSON.parse(await readFile(statusFile(), "utf8")) as BackupStatus;
  } catch {
    return {};
  }
}

/** Backs up every shop now. Never throws; the result is also written to last-run.json. */
export async function runAutoBackup(now = new Date()) {
  const status: BackupStatus = { lastRunAt: now.toISOString(), lastOk: true, shops: 0, files: 0 };
  try {
    await connectDB();
    const shops = await Tenant.find({}).select("shopName").lean();
    for (const shop of shops) {
      const dir = join(backupDir(), `${slug(shop.shopName)}-${String(shop._id)}`);
      await mkdir(dir, { recursive: true });
      const data = await tenantBackup(shop._id);
      await writeFile(join(dir, `${stamp(now)}.json.gz`), gzipSync(JSON.stringify(data)));
      status.shops! += 1;
      // Keep only the newest copies.
      const files = (await readdir(dir)).filter((f) => f.endsWith(".json.gz")).sort();
      for (const old of files.slice(0, Math.max(0, files.length - keep()))) await rm(join(dir, old), { force: true });
      status.files! += Math.min(files.length, keep());
    }
  } catch (err) {
    status.lastOk = false;
    status.lastError = (err as Error).message;
    console.error("automatic backup failed", err);
  }
  try {
    await mkdir(backupDir(), { recursive: true });
    await writeFile(statusFile(), JSON.stringify(status, null, 2));
  } catch {
    /* nothing more we can do */
  }
  return status;
}

/** The saved copies, newest first, per shop. */
export async function listBackups() {
  const root = backupDir();
  const out: { folder: string; tenantId: string; files: { name: string; size: number; at: string }[] }[] = [];
  let folders: string[] = [];
  try {
    folders = await readdir(root);
  } catch {
    return out;
  }
  for (const folder of folders) {
    const m = folder.match(/-([a-f0-9]{24})$/);
    if (!m) continue;
    const names = (await readdir(join(root, folder))).filter((f) => f.endsWith(".json.gz")).sort().reverse();
    const files = await Promise.all(names.map(async (name) => ({ name, size: (await stat(join(root, folder, name))).size, at: name.replace(".json.gz", "") })));
    out.push({ folder, tenantId: m[1], files });
  }
  return out;
}

/** Starts the nightly schedule once per server process (production only). */
export function startAutoBackup() {
  const g = globalThis as unknown as { __dukaanBackupTimer?: NodeJS.Timeout };
  if (g.__dukaanBackupTimer || process.env.AUTO_BACKUP === "off") return;
  let running = false;
  const tick = async () => {
    if (running) return;
    const now = new Date();
    const [h, m] = runAt().split(":").map(Number);
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const last = (await readBackupStatus()).lastRunAt;
    // Run once a day after the set time, or straight away if the last copy is over a day old.
    const lastAt = last ? new Date(last) : null;
    const doneToday = lastAt && lastAt >= due;
    const stale = !lastAt || now.getTime() - lastAt.getTime() > 26 * 3600 * 1000;
    if ((now >= due && !doneToday) || stale) {
      running = true;
      await runAutoBackup(now);
      running = false;
    }
  };
  g.__dukaanBackupTimer = setInterval(() => void tick(), 10 * 60 * 1000);
  g.__dukaanBackupTimer.unref?.();
  setTimeout(() => void tick(), 60 * 1000).unref?.();
}
