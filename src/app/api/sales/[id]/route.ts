import { ApiError, handle, requireTenant } from "@/lib/api";
import { Sale } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const sale = await Sale.findOne({ _id: id, tenant: tid }).lean();
  if (!sale) throw new ApiError(404, "Bill not found.");
  return sale;
});
