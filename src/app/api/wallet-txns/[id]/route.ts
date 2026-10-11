import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { WalletTxn } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireBranch();
  const { id } = await params;
  const t = await WalletTxn.findOne({ _id: id, tenant: tid }).lean();
  if (!t) throw new ApiError(404, "Entry not found.");
  return t;
});
