import { z } from "zod";
import { ApiError, dateRange, escapeRegex, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { cleanImei } from "@/lib/imei";
import { round2 } from "@/lib/money";
import { optionalId } from "@/lib/schemas";
import { nextNumber, Party, Repair, User } from "@/models";

/**
 * Repair jobs. ?status=open (default: everything not delivered/cancelled) | all | one status;
 * ?q job no / name / phone / IMEI / model; delivered and cancelled jobs are limited to ?from&to.
 */
export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";
  const query: Record<string, unknown> = { tenant: ctx.tid };
  const branch = ctx.user.role === "cashier" ? ctx.branchId : reportBranchFilter(ctx, url.searchParams.get("branch"));
  if (branch) query.branch = branch;
  if (status === "open") query.status = { $nin: ["delivered", "cancelled"] };
  else if (status !== "all") query.status = status;
  if (status === "all" || status === "delivered" || status === "cancelled") {
    const { from, to } = dateRange(url, 29);
    query.createdAt = { $gte: from, $lte: to };
  }
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ jobNo: rx }, { customerName: rx }, { customerPhone: rx }, { deviceName: rx }, { imei: cleanImei(q) }, { problem: rx }];
  }
  const [rows, counts] = await Promise.all([
    Repair.find(query).sort({ createdAt: -1 }).limit(1000).select("-history -parts").lean(),
    Repair.aggregate([{ $match: { tenant: ctx.tid, ...(branch ? { branch } : {}), status: { $nin: ["delivered", "cancelled"] } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  return { rows, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) };
});

const Body = z.object({
  customerId: optionalId,
  customerName: z.string().trim().min(2, "Write the customer's name").max(80),
  customerPhone: z.string().trim().regex(/^[0-9+\-\s]{10,16}$/, "Write the customer's mobile number"),
  deviceName: z.string().trim().min(2, "Write the phone model").max(80),
  imei: z.string().trim().max(40).optional(),
  color: z.string().trim().max(30).optional(),
  lockCode: z.string().trim().max(40).optional(),
  accessories: z.array(z.string().trim().max(30)).max(10).optional(),
  conditionNotes: z.string().trim().max(300).optional(),
  problem: z.string().trim().min(3, "Write what is wrong with the phone").max(500),
  estimate: z.coerce.number().min(0).optional(),
  promisedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().or(z.literal("").transform(() => undefined)),
  technicianId: optionalId,
  warrantyDays: z.coerce.number().int().min(0).max(365).optional(),
  advance: z.coerce.number().min(0).default(0),
  advanceMethod: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
  /** A warranty claim: the earlier job number. */
  warrantyOf: z.string().trim().max(20).optional(),
});

/** Books a phone in for repair (job card). */
export const POST = handle(async (req) => {
  const { user, tid, branchId, branch } = await requireBranch();
  const body = Body.parse(await req.json());
  let customer = null;
  if (body.customerId) {
    customer = await Party.findOne({ _id: body.customerId, tenant: tid, type: "customer" }).lean();
    if (!customer) throw new ApiError(400, "Customer not found.");
  }
  let technician = null;
  if (body.technicianId) {
    technician = await User.findOne({ _id: body.technicianId, tenant: tid, active: true }).select("name").lean();
    if (!technician) throw new ApiError(400, "Technician not found.");
  }
  if (body.warrantyOf) {
    const earlier = await Repair.findOne({ tenant: tid, jobNo: body.warrantyOf.toUpperCase() }).lean();
    if (!earlier) throw new ApiError(400, `Job ${body.warrantyOf} not found.`);
    if (!earlier.warrantyUntil || earlier.warrantyUntil < new Date()) throw new ApiError(400, `${earlier.jobNo} is not under repair warranty any more.`);
  }
  const jobNo = await nextNumber(tid, "repair", "JOB");
  const advance = round2(body.advance);
  const job = await Repair.create({
    tenant: tid,
    jobNo,
    branch: branchId,
    branchName: branch.name,
    customer: customer?._id,
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    deviceName: body.deviceName,
    imei: body.imei ? cleanImei(body.imei) : undefined,
    color: body.color,
    lockCode: body.lockCode,
    accessories: body.accessories,
    conditionNotes: body.conditionNotes,
    problem: body.problem,
    estimate: body.estimate,
    promisedAt: body.promisedAt ? new Date(`${body.promisedAt.slice(0, 10)}T18:00:00`) : undefined,
    technician: technician?._id,
    technicianName: technician?.name,
    warrantyDays: body.warrantyDays,
    warrantyOf: body.warrantyOf?.toUpperCase(),
    payments: advance > 0 ? [{ kind: "advance", amount: advance, method: body.advanceMethod, at: new Date(), userName: user.name, receiptNo: `${jobNo}-1` }] : [],
    paid: advance,
    history: [{ status: "received", note: body.warrantyOf ? `Warranty claim of ${body.warrantyOf.toUpperCase()}` : undefined, userName: user.name, at: new Date() }],
    user: user.id,
    userName: user.name,
  });
  await logActivity({ tid, user, branchId }, { action: "repair.create", summary: `${jobNo}: ${body.deviceName} of ${body.customerName} — ${body.problem}${advance ? `, advance Rs ${advance}` : ""}`, refType: "repair", refId: job._id, refNo: jobNo, amount: advance || undefined });
  return job.toObject();
});

