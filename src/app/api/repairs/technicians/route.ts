import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { User } from "@/models";

/** Staff who can be given a repair job (names only). */
export const GET = handle(async () => {
  const { tid } = await requireBranch();
  return User.find({ tenant: tid, active: true }).select("name role").sort({ name: 1 }).lean();
});
