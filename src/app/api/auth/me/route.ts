import { handle, requireAnyUser } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { sessionData } from "@/lib/session-data";

export const GET = handle(async () => {
  const user = await requireAnyUser();
  if (user.role === "superadmin") return sessionData(user, null);
  const ctx = await requireBranch();
  return sessionData(ctx.user, ctx);
});
