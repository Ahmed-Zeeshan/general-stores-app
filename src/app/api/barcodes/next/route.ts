import { handle, requireTenant } from "@/lib/api";
import { nextBarcode } from "@/lib/barcode-server";

/** Reserves and returns a new in-store barcode (for the product form). */
export const POST = handle(async () => {
  const { tid } = await requireTenant(["owner", "manager"]);
  return { barcode: await nextBarcode(tid) };
});
