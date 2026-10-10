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
