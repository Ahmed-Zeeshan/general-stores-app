import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { searchAll } from "@/lib/search";

/** Search box for the whole shop (?q=name, mobile, CNIC, IMEI, bill / job / plan number…). */
export const GET = handle(async (req) => searchAll(await requireBranch(), new URL(req.url).searchParams.get("q") ?? ""));
