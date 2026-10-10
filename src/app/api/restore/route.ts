import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { restoreTenant } from "@/lib/backup";
import { Tenant } from "@/models";

const Body = z.object({ backup: z.unknown(), confirm: z.string() });

/** Owner restores their own shop from a backup file. The shop name must be typed to confirm. */
export const POST = handle(async (req) => {
  const { tid } = await requireTenant(["owner"]);
  const body = Body.parse(await req.json());
  const tenant = await Tenant.findById(tid).select("shopName").lean();
  if (body.confirm.trim().toLowerCase() !== tenant?.shopName.trim().toLowerCase()) {
    throw new ApiError(400, "Type the shop name exactly to confirm the restore.");
  }
  return restoreTenant(tid, body.backup);
});
