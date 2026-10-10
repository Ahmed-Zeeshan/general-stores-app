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
  category: optionalId,
  unit: z.enum(UNITS),
  costPrice: z.coerce.number().min(0, "Cost price cannot be negative"),
  salePrice: z.coerce.number().min(0, "Sale price cannot be negative"),
  lowStockAlert: z.coerce.number().min(0),
  expiryDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
  pctCode: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export { optionalId };
