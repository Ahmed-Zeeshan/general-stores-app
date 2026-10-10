import { z } from "zod";
import { addDays, handle, requireSuperAdmin } from "@/lib/api";
import { round2 } from "@/lib/money";
import { createTenantWithOwner, USERNAME_RE } from "@/lib/tenants";
import { Branch, Product, Sale, Tenant, User } from "@/models";

export const GET = handle(async () => {
  await requireSuperAdmin();
  const tenants = await Tenant.find().sort({ createdAt: -1 }).lean();
  const ids = tenants.map((t) => t._id);
  const since = addDays(new Date(), -30);
  const [users, sales, products, branches] = await Promise.all([
    User.aggregate([{ $match: { tenant: { $in: ids } } }, { $group: { _id: "$tenant", total: { $sum: 1 }, active: { $sum: { $cond: ["$active", 1, 0] } } } }]),
    Sale.aggregate([
      { $match: { tenant: { $in: ids }, status: "completed" } },
      {
        $group: {
          _id: "$tenant",
          last30: { $sum: { $cond: [{ $gte: ["$createdAt", since] }, "$total", 0] } },
          bills: { $sum: 1 },
          lastSaleAt: { $max: "$createdAt" },
        },
      },
    ]),
    Product.aggregate([{ $match: { tenant: { $in: ids }, active: true } }, { $group: { _id: "$tenant", count: { $sum: 1 } } }]),
    Branch.aggregate([{ $match: { tenant: { $in: ids }, active: true } }, { $group: { _id: "$tenant", count: { $sum: 1 } } }]),
  ]);
  const br = new Map(branches.map((x) => [String(x._id), x.count]));
  const u = new Map(users.map((x) => [String(x._id), x]));
  const s = new Map(sales.map((x) => [String(x._id), x]));
  const p = new Map(products.map((x) => [String(x._id), x]));
  return tenants.map((t) => {
    const id = String(t._id);
    return {
      _id: t._id,
      shopName: t.shopName,
      shopType: t.shopType,
      ownerName: t.ownerName,
      phone: t.phone,
      status: t.status,
      plan: t.plan,
      maxUsers: t.maxUsers,
      maxBranches: t.maxBranches ?? 1,
      branches: br.get(id) ?? 1,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
      users: u.get(id)?.total ?? 0,
      activeUsers: u.get(id)?.active ?? 0,
      products: p.get(id)?.count ?? 0,
      bills: s.get(id)?.bills ?? 0,
      sales30: round2(s.get(id)?.last30 ?? 0),
      lastSaleAt: s.get(id)?.lastSaleAt ?? null,
    };
  });
});

const Body = z.object({
  shopName: z.string().trim().min(2, "Shop name is required"),
  shopType: z.enum(["karyana", "general", "bakery", "other"]),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  maxUsers: z.coerce.number().int().min(1, "At least 1 user").max(1000),
  maxBranches: z.coerce.number().int().min(1, "At least 1 branch").max(200).default(1),
  plan: z.string().trim().optional(),
  expiresAt: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(`${v}T23:59:59`) : null)),
  ownerName: z.string().trim().min(2, "Owner name is required"),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE, "Username: use 3-30 letters or numbers, no spaces"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const POST = handle(async (req) => {
  await requireSuperAdmin();
  const tenant = await createTenantWithOwner(Body.parse(await req.json()));
  return tenant.toObject();
});
