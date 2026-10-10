import { ApiError, handle, requireTenant } from "@/lib/api";
import { statement } from "@/lib/udhaar";

type Ctx = { params: Promise<{ id: string }> };

/** Khata statement. Defaults to the last 90 days. */
export const GET = handle<Ctx>(async (req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : new Date();
  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : new Date(to.getTime() - 89 * 864e5);
  from.setHours(0, 0, 0, 0);
  const result = await statement(tid, id, from, to);
  if (!result) throw new ApiError(404, "Not found.");
  return result;
});
