import { handle, requireAnyUser, requireTenant } from "@/lib/api";
import { Tenant } from "@/models";

export const GET = handle(async () => {
  const user = await requireAnyUser();
  if (user.role === "superadmin") return { user, settings: null };
  const { tid } = await requireTenant();
  const settings = await Tenant.findById(tid).select("-adminNotes").lean();
  return { user, settings };
});
