import { ApiError, handle, requireTenant } from "@/lib/api";
import { Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** The product's photo as an image (the sale screen loads it lazily and the browser keeps it). */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const p = await Product.findOne({ _id: id, tenant: tid }).select("+image").lean();
  const m = p?.image ? /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(p.image) : null;
  if (!m) throw new ApiError(404, "No photo.");
  return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=604800" } });
});
