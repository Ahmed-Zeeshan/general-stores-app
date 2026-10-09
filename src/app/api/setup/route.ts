import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { Category, Settings, User } from "@/models";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export const GET = handle(async () => {
  const count = await User.countDocuments();
  return { needsSetup: count === 0 };
});

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  karyana: ["Atta & Flour", "Rice & Daal", "Ghee & Oil", "Sugar & Salt", "Spices", "Tea & Beverages", "Snacks", "Soap & Detergent"],
  general: ["Grocery", "Beverages", "Snacks", "Personal Care", "Household", "Dairy", "Stationery"],
  bakery: ["Bread", "Cakes", "Biscuits & Rusk", "Sweets", "Patties & Savoury", "Dairy", "Beverages"],
  other: ["General"],
};

const Body = z.object({
  shopName: z.string().trim().min(2, "Shop name is required"),
  shopType: z.enum(["karyana", "general", "bakery", "other"]),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  ownerName: z.string().trim().min(2, "Your name is required"),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, "Use 3-30 letters or numbers, no spaces"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const POST = handle(async (req) => {
  if ((await User.countDocuments()) > 0) throw new ApiError(400, "Shop is already set up. Please log in.");
  const body = Body.parse(await req.json());

  await Settings.findOneAndUpdate(
    { key: "shop" },
    { key: "shop", shopName: body.shopName, shopType: body.shopType, phone: body.phone, address: body.address, ownerName: body.ownerName },
    { upsert: true, new: true },
  );
  const user = await User.create({
    name: body.ownerName,
    username: body.username,
    passwordHash: await bcrypt.hash(body.password, 10),
    role: "owner",
  });
  if ((await Category.countDocuments()) === 0) {
    await Category.insertMany(DEFAULT_CATEGORIES[body.shopType].map((name) => ({ name })));
  }

  const token = await signSession({ id: String(user._id), name: user.name, username: user.username, role: "owner" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});

