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

/** Repair job steps (in order) and their labels. */
export const REPAIR_STATUSES = ["received", "checking", "waiting_parts", "repairing", "ready", "delivered", "cancelled"] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];
export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  received: "Received",
  checking: "Checking",
  waiting_parts: "Waiting for parts",
  repairing: "Repairing",
  ready: "Ready to collect",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
export const REPAIR_ACCESSORIES = ["SIM", "Memory card", "Back cover", "Charger", "Battery", "Box"];

/** Mobile networks (Easyload and packages) and wallet / bank providers. */
export const OPERATORS = ["jazz", "zong", "telenor", "ufone", "onic"] as const;
export const OPERATOR_LABELS: Record<string, string> = { jazz: "Jazz", zong: "Zong", telenor: "Telenor", ufone: "Ufone", onic: "Onic" };
export const WALLET_PROVIDERS = ["jazz", "zong", "telenor", "ufone", "onic", "jazzcash", "easypaisa", "upaisa", "sadapay", "nayapay", "bank", "other"] as const;
export const PROVIDER_LABELS: Record<string, string> = {
  ...OPERATOR_LABELS,
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  upaisa: "UPaisa",
  sadapay: "SadaPay",
  nayapay: "NayaPay",
  bank: "Bank",
  other: "Other",
};
/** load = Easyload / packages SIM; wallet = JazzCash, Easypaisa… agent account; bank = bank account. */
export const WALLET_KINDS = ["load", "wallet", "bank"] as const;
export const WALLET_TXN_TYPES = ["load", "package", "cash_in", "cash_out", "bill", "float_in", "float_out", "commission", "adjust", "reversal"] as const;
export type WalletTxnType = (typeof WALLET_TXN_TYPES)[number];
export const WALLET_TXN_LABELS: Record<WalletTxnType, string> = {
  load: "Easyload",
  package: "Package",
  cash_in: "Cash in / send money",
  cash_out: "Cash out / withdraw",
  bill: "Bill payment",
  float_in: "Balance top-up",
  float_out: "Balance withdrawn",
  commission: "Commission received",
  adjust: "Balance correction",
  reversal: "Cancelled entry",
};
export const PACKAGE_KINDS = ["internet", "call", "sms", "hybrid"] as const;
export const PACKAGE_KIND_LABELS: Record<string, string> = { internet: "Internet", call: "Calls", sms: "SMS", hybrid: "All-in-one" };
