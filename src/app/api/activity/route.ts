import { dateRange, escapeRegex, handle, requireTenant } from "@/lib/api";
import { ACTIVITY_GROUPS } from "@/lib/activity-groups";
import { ActivityLog, Branch, User } from "@/models";

/** Who did what (owner only). */
export const GET = handle(async (req) => {
  const { tid } = await requireTenant(["owner"]);
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 6);
  const query: Record<string, unknown> = { tenant: tid, createdAt: { $gte: from, $lte: to } };
  const user = url.searchParams.get("user");
  if (user && /^[a-f0-9]{24}$/i.test(user)) query.user = user;
  const group = url.searchParams.get("group");
  if (group && ACTIVITY_GROUPS[group]) query.action = { $in: ACTIVITY_GROUPS[group] };
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ summary: rx }, { refNo: rx }, { userName: rx }];
  }
  const [rows, users, branches] = await Promise.all([
    ActivityLog.find(query).sort({ createdAt: -1 }).limit(1000).lean(),
    User.find({ tenant: tid }).select("name role").sort({ name: 1 }).lean(),
    Branch.find({ tenant: tid }).select("name").lean(),
  ]);
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  return {
    rows: rows.map((r) => ({ ...r, branchName: r.branch ? branchName.get(String(r.branch)) : undefined })),
    users,
    truncated: rows.length === 1000,
  };
});
