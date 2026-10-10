import bcrypt from "bcryptjs";
import type { Types } from "mongoose";
import { Branch, Category, Tenant, User } from "@/models";
import { ApiError } from "./api";

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  karyana: ["Atta & Flour", "Rice & Daal", "Ghee & Oil", "Sugar & Salt", "Spices", "Tea & Beverages", "Snacks", "Soap & Detergent"],
  general: ["Grocery", "Beverages", "Snacks", "Personal Care", "Household", "Dairy", "Stationery"],
  bakery: ["Bread", "Cakes", "Biscuits & Rusk", "Sweets", "Patties & Savoury", "Dairy", "Beverages", "Baking Ingredients"],
  other: ["General"],
};

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function createTenantWithOwner(input: {
  shopName: string;
  shopType: "karyana" | "general" | "bakery" | "other";
  phone?: string;
  address?: string;
  maxUsers: number;
  maxBranches?: number;
  plan?: string;
  expiresAt?: Date | null;
  ownerName: string;
  username: string;
  password: string;
}) {
  if (await User.exists({ username: input.username })) {
    throw new ApiError(409, `Username "${input.username}" is already taken. Choose another.`);
  }
  const tenant = await Tenant.create({
    shopName: input.shopName,
    shopType: input.shopType,
    phone: input.phone,
    address: input.address,
    ownerName: input.ownerName,
    maxUsers: input.maxUsers,
    maxBranches: input.maxBranches ?? 1,
    plan: input.plan,
    expiresAt: input.expiresAt ?? undefined,
  });
  try {
    await User.create({
      tenant: tenant._id,
      name: input.ownerName,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      role: "owner",
    });
  } catch (err) {
    await Tenant.deleteOne({ _id: tenant._id });
    throw err;
  }
  await Category.insertMany(DEFAULT_CATEGORIES[input.shopType].map((name) => ({ tenant: tenant._id, name })));
  await Branch.create({ tenant: tenant._id, name: "Main Branch", isMain: true, address: input.address, phone: input.phone });
  return tenant;
}

/** Throws if the shop has already used all the user seats the super admin gave it. */
export async function assertSeatAvailable(tid: Types.ObjectId | string) {
  const [tenant, active] = await Promise.all([
    Tenant.findById(tid).select("maxUsers").lean(),
    User.countDocuments({ tenant: tid, active: true }),
  ]);
  const max = tenant?.maxUsers ?? 0;
  if (active >= max) {
    throw new ApiError(
      400,
      `Your shop can have ${max} active user${max === 1 ? "" : "s"}. Disable a user, or ask the administrator to increase the limit.`,
    );
  }
}
