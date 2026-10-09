import { ApiError, handle, requireUser } from "@/lib/api";
import { moveStock, postLedger } from "@/lib/services";
import { Sale } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** Full return of a bill: puts stock back and reverses any udhaar. */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await requireUser(["owner", "manager"]);
  const { id } = await params;
  // Atomic status flip prevents returning the same bill twice.
  const sale = await Sale.findOneAndUpdate(
    { _id: id, status: "completed" },
    { status: "returned", returnedAt: new Date() },
    { new: true },
  );
  if (!sale) throw new ApiError(400, "Bill not found or already returned.");

  for (const item of sale.items) {
    if (item.product) {
      await moveStock({ productId: item.product, qty: item.qty, type: "return", refNo: sale.invoiceNo, userId: user.id });
    }
  }
  if (sale.customer && sale.creditAmount > 0) {
    await postLedger({
      partyId: sale.customer,
      kind: "return",
      amount: -sale.creditAmount,
      refType: "sale",
      refId: sale._id,
      refNo: sale.invoiceNo,
      note: `Return of bill ${sale.invoiceNo}`,
      userId: user.id,
    });
  }
  return sale.toObject();
});
