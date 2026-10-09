import { handle, requireUser } from "@/lib/api";
import { Settings } from "@/models";

export const GET = handle(async () => {
  const user = await requireUser();
  const settings = await Settings.findOne({ key: "shop" }).lean();
  return { user, settings };
});
