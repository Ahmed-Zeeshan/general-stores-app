/** Constants shared by server models and client pages (must not import mongoose). */
export const UNITS = ["pcs", "kg", "g", "litre", "ml", "dozen", "pack", "box", "carton"] as const;

export const PAYMENT_METHODS = ["cash", "card", "jazzcash", "easypaisa", "bank", "credit"] as const;
/** Ways money is actually handed over (everything except udhaar). */
export const TENDER_METHODS = ["cash", "card", "jazzcash", "easypaisa", "bank"] as const;

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Gas",
  "Water",
  "Salaries",
  "Transport",
  "Repairs",
  "Packaging",
  "Tea & Food",
  "Other",
] as const;

/** Kinds of shop. "mobile" = mobile phone shop (phones by IMEI, repairs, Easyload / wallets, installments). */
export const SHOP_TYPES = ["karyana", "general", "bakery", "mobile", "other"] as const;
export type ShopType = (typeof SHOP_TYPES)[number];
export const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  karyana: "Karyana Store",
  general: "General Store",
  bakery: "Bakery",
  mobile: "Mobile Phone Shop",
  other: "Other",
};

/** Optional features a shop can switch on (Settings → Features). */
export const MODULES = ["phones", "repairs", "wallets", "installments"] as const;
export type ModuleKey = (typeof MODULES)[number];
export const MODULE_INFO: Record<ModuleKey, { label: string; hint: string }> = {
  phones: { label: "Mobile phones by IMEI", hint: "Each phone is bought, sold, returned and transferred by its IMEI; buy used phones from customers with CNIC; warranty on the receipt." },
  repairs: { label: "Repairs", hint: "Job cards for phone repairs: problem, estimate, advance, parts from stock, status, WhatsApp when ready." },
  wallets: { label: "Easyload & wallets", hint: "Easyload, JazzCash, Easypaisa and bank accounts: cash in / cash out, bill payments, float balance, fees and commission." },
  installments: { label: "Installments (qist)", hint: "Sell on monthly installments with advance, markup and a payment schedule; due-date reminders on WhatsApp." },
};
/** Features switched on automatically for a new shop of this type. */
export const DEFAULT_MODULES: Record<ShopType, ModuleKey[]> = {
  karyana: [],
  general: [],
  bakery: [],
  mobile: ["phones", "repairs", "wallets", "installments"],
  other: [],
};

/** Condition and PTA status of a phone. */
export const DEVICE_CONDITIONS = ["new", "used", "refurbished"] as const;
export const PTA_STATUS = ["approved", "non_pta", "unknown"] as const;
