import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { todaysTasks } from "@/lib/tasks";

/** Today's to-do list for the bell: drawer, installments, repairs, balances, stock, udhaar, FBR. */
export const GET = handle(async () => todaysTasks(await requireBranch()));
