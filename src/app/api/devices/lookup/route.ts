import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { cleanImei, imeiCheckOk } from "@/lib/devices";
import { Device } from "@/models";

/** Everything about one IMEI: every time it was bought, sold, returned or moved (newest first). */
export const GET = handle(async (req) => {
  const { tid } = await requireBranch();
  const imei = cleanImei(new URL(req.url).searchParams.get("imei") ?? "");
  if (imei.length < 4) return { imei, checkOk: true, records: [] };
  const records = await Device.find({ tenant: tid, $or: [{ imei }, { imei2: imei }] }).sort({ createdAt: -1 }).limit(50).lean();
  return { imei, checkOk: imeiCheckOk(imei), records };
});
