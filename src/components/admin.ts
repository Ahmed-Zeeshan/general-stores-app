export type ShopRow = {
  _id: string;
  shopName: string;
  shopType: string;
  ownerName?: string;
  phone?: string;
  status: "active" | "suspended";
  plan?: string;
  maxUsers: number;
  expiresAt?: string;
  createdAt: string;
  users: number;
  activeUsers: number;
  products: number;
  bills: number;
  sales30: number;
  lastSaleAt?: string | null;
};

export const SHOP_TYPES: Record<string, string> = { karyana: "Karyana", general: "General Store", bakery: "Bakery", other: "Other" };

export function shopState(s: { status: string; expiresAt?: string | null }) {
  if (s.status !== "active") return { label: "Suspended", color: "red" as const };
  if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return { label: "Expired", color: "amber" as const };
  return { label: "Active", color: "green" as const };
}
