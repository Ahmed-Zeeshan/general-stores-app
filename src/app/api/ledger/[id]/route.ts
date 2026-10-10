import { ApiError, handle, requireTenant } from "@/lib/api";
import { Branch, LedgerEntry, Party, User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** One khata entry with what a payment receipt needs (customer, balances, who received it). */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const entry = await LedgerEntry.findOne({ _id: id, tenant: tid }).lean();
  if (!entry) throw new ApiError(404, "Entry not found.");
  const [party, user, branch, reversedBy] = await Promise.all([
    Party.findOne({ _id: entry.party, tenant: tid }).select("type name phone address balance").lean(),
    entry.user ? User.findOne({ _id: entry.user, tenant: tid }).select("name").lean() : null,
    entry.branch ? Branch.findOne({ _id: entry.branch, tenant: tid }).select("name").lean() : null,
    entry.reversedBy ? User.findOne({ _id: entry.reversedBy, tenant: tid }).select("name").lean() : null,
  ]);
  return {
    ...entry,
    balanceBefore: Math.round((entry.balanceAfter - entry.amount) * 100) / 100,
    party,
    userName: user?.name ?? null,
    branchName: branch?.name ?? null,
    reversedByName: reversedBy?.name ?? null,
  };
});
