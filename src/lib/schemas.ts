import { z } from "zod";
import { UNITS } from "@/lib/constants";

const optionalId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .optional()
  .or(z.literal("").transform(() => undefined))
  .or(z.null().transform(() => undefined));

export const ProductInput = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  nameUrdu: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  brand: z.string().trim().max(60).optional(),
  /** Photo as a JPEG / PNG / WebP data URL (made small in the browser); "" removes it, missing keeps it. */
  image: z
    .string()
    .max(150_000, "The photo is too large.")
    .refine((v) => v === "" || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Not a photo.")
    .optional(),
  favourite: z.boolean().optional(),
  fits: z.string().trim().max(300).optional(),
  category: optionalId,
  unit: z.enum(UNITS),
  costPrice: z.coerce.number().min(0, "Cost price cannot be negative"),
  salePrice: z.coerce.number().min(0, "Sale price cannot be negative"),
  wholesalePrice: z
    .union([z.coerce.number().min(0, "Wholesale price cannot be negative"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (typeof v === "number" && v > 0 ? v : null)),
  packs: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Give the pack a name, e.g. Carton").max(30),
        size: z.coerce.number().positive("Units in the pack must be more than zero"),
        price: z.union([z.coerce.number().min(0), z.literal(""), z.null()]).optional().transform((v) => (typeof v === "number" && v > 0 ? v : undefined)),
        wholesalePrice: z.union([z.coerce.number().min(0), z.literal(""), z.null()]).optional().transform((v) => (typeof v === "number" && v > 0 ? v : undefined)),
        barcode: z.string().trim().max(64).optional().transform((v) => v || undefined),
      }),
    )
    .max(5, "At most 5 pack sizes")
    .optional()
    .superRefine((packs, ctx) => {
      const names = new Set<string>();
      for (const p of packs ?? []) {
        const k = p.name.toLowerCase();
        if (names.has(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Pack name "${p.name}" is used twice.` });
        names.add(k);
      }
    }),
  lowStockAlert: z.coerce.number().min(0),
  expiryDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
  pctCode: z.string().trim().optional(),
  active: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  shelfLifeDays: z
    .union([z.coerce.number().int().min(0).max(3650), z.literal(""), z.null()])
    .optional()
    .transform((v) => (typeof v === "number" && v > 0 ? v : null)),
  /** Mobile phones: every piece has its own IMEI / serial number. */
  trackSerial: z.boolean().optional(),
  warrantyMonths: z
    .union([z.coerce.number().int().min(0).max(120), z.literal(""), z.null()])
    .optional()
    .transform((v) => (typeof v === "number" && v > 0 ? v : null)),
});

export { optionalId };
