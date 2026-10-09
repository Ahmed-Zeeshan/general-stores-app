import { ApiError, handle, requireUser } from "@/lib/api";
import { Sale } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireUser();
  const { id } = await params;
  const sale = await Sale.findById(id).lean();
  if (!sale) throw new ApiError(404, "Bill not found.");
  return sale;
});
