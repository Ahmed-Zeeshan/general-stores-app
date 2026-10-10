import { ApiError, handle, requireTenant } from "@/lib/api";
import { SaleReturn } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const ret = await SaleReturn.findOne({ _id: id, tenant: tid }).lean();
  if (!ret) throw new ApiError(404, "Return not found.");
  return ret;
});
