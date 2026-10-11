import { z } from "zod";
import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { OPERATORS, PACKAGE_KINDS } from "@/lib/constants";
import { MobilePackage } from "@/models";

/** Internet / call / SMS packages (?operator=jazz, ?all=1 includes switched-off ones). */
export const GET = handle(async (req) => {
  const { tid } = await requireBranch();
  const url = new URL(req.url);
  const operator = url.searchParams.get("operator");
  return MobilePackage.find({ tenant: tid, ...(operator ? { operator } : {}), ...(url.searchParams.get("all") === "1" ? {} : { active: true }) })
    .sort({ operator: 1, price: 1 })
    .lean();
});

const Body = z.object({
  operator: z.enum(OPERATORS),
  name: z.string().trim().min(2, "Give the package a name").max(60),
  kind: z.enum(PACKAGE_KINDS).default("internet"),
  data: z.string().trim().max(30).optional(),
  minutes: z.string().trim().max(40).optional(),
  sms: z.string().trim().max(30).optional(),
  validityDays: z.coerce.number().int().min(0).max(3650).optional(),
  price: z.coerce.number().positive("Enter the price"),
  commission: z.union([z.coerce.number().min(0), z.literal(""), z.null()]).optional().transform((v) => (typeof v === "number" ? v : undefined)),
  code: z.string().trim().max(60).optional(),
});

export const POST = handle(async (req) => {
  const { tid } = await requireBranch(["owner", "manager"]);
  const body = Body.parse(await req.json());
  return (await MobilePackage.create({ ...body, tenant: tid })).toObject();
});
