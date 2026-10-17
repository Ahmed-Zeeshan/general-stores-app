/** Sales History → Correct leaves the old bill's lines here for New Bill to open. */
export const CORRECT_KEY = "dukaan:correct-bill";

export type CorrectionDraft = {
  sale: { _id: string; invoiceNo: string };
  returnNo: string;
  lines: { productId: string; name: string; qty: number; price?: number; pack?: string; discount?: number; phone?: boolean }[];
  customer: unknown;
  discount: number;
};
