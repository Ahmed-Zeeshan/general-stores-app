import { z } from "zod";

/** What the Offers form sends. */
export const PromotionInput = z
  .object({
    name: z.string().trim().min(2, "Give the offer a name").max(60),
    kind: z.enum(["percent", "amount", "bxgy", "bill"]),
    value: z.coerce.number().min(0).max(1_000_000).default(0),
    billMode: z.enum(["percent", "amount"]).default("percent"),
    buyQty: z.coerce.number().int().min(1).max(1000).optional(),
    freeQty: z.coerce.number().int().min(1).max(1000).optional(),
    minAmount: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).default(0),
    appliesTo: z.enum(["all", "products", "categories"]).default("all"),
    products: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(500).default([]),
    categories: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100).default([]),
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)).or(z.null().transform(() => undefined)),
    endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)).or(z.null().transform(() => undefined)),
    active: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "percent" && !(p.value > 0 && p.value <= 100)) ctx.addIssue({ code: "custom", path: ["value"], message: "Percent must be between 1 and 100." });
    if (p.kind === "amount" && !(p.value > 0)) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the rupees off per item." });
    if (p.kind === "bxgy" && (!p.buyQty || !p.freeQty)) ctx.addIssue({ code: "custom", path: ["buyQty"], message: "Enter how many to buy and how many are free." });
    if (p.kind === "bill" && !(p.value > 0)) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the discount on the bill." });
    if (p.kind === "bill" && p.billMode === "percent" && p.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "Percent must be 100 or less." });
    if (p.kind !== "bill" && p.appliesTo === "products" && !p.products.length) ctx.addIssue({ code: "custom", path: ["products"], message: "Choose at least one product." });
    if (p.kind !== "bill" && p.appliesTo === "categories" && !p.categories.length) ctx.addIssue({ code: "custom", path: ["categories"], message: "Choose at least one category." });
    if (p.startsAt && p.endsAt && p.endsAt < p.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End date is before the start date." });
  });

export function promoDescription(p: z.infer<typeof PromotionInput>) {
  if (p.kind === "percent") return `${p.value}% off`;
  if (p.kind === "amount") return `Rs ${p.value} off each`;
  if (p.kind === "bxgy") return `buy ${p.buyQty} get ${p.freeQty} free`;
  return `${p.billMode === "amount" ? `Rs ${p.value}` : `${p.value}%`} off bills over Rs ${p.minAmount}`;
}
