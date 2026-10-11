import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { OPERATORS, PACKAGE_KINDS } from "@/lib/constants";
import { MobilePackage } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  operator: z.enum(OPERATORS).optional(),
  name: z.string().trim().min(2).max(60).optional(),
  kind: z.enum(PACKAGE_KINDS).optional(),
  data: z.string().trim().max(30).optional(),
  minutes: z.string().trim().max(40).optional(),
  sms: z.string().trim().max(30).optional(),
  validityDays: z.coerce.number().int().min(0).max(3650).optional(),
  price: z.coerce.number().positive().optional(),
  commission: z.union([z.coerce.number().min(0), z.literal(""), z.null()]).optional(),
  code: z.string().trim().max(60).optional(),
  active: z.boolean().optional(),
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { tid } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const { commission, ...rest } = Body.parse(await req.json());
  const update: Record<string, unknown> = { $set: rest };
  if (commission !== undefined) {
    if (typeof commission === "number") (update.$set as Record<string, unknown>).commission = commission;
    else update.$unset = { commission: 1 };
  }
  const p = await MobilePackage.findOneAndUpdate({ _id: id, tenant: tid }, update, { new: true }).lean();
  if (!p) throw new ApiError(404, "Package not found.");
  return p;
});
