import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { syncSaleToFbr } from "@/lib/fbr";
import { moveStock, postLedger } from "@/lib/services";
import { Sale, Tenant } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** Full return of a bill: puts stock back, reverses any udhaar and reports a credit note to FBR. */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  // Atomic status flip prevents returning the same bill twice.
  const sale = await Sale.findOneAndUpdate(
    { _id: id, tenant: tid, status: "completed" },
    { status: "returned", returnedAt: new Date() },
    { new: true },
  );
  if (!sale) throw new ApiError(400, "Bill not found or already returned.");

  for (const item of sale.items) {
    if (item.product) {
      // Stock goes back to the branch that sold it.
      await moveStock({ tid, branch: sale.branch ?? branchId, productId: item.product, qty: item.qty, type: "return", refNo: sale.invoiceNo, userId: user.id });
    }
  }
  if (sale.customer && sale.creditAmount > 0) {
    await postLedger({
      tid,
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

  const tenant = await Tenant.findById(tid).select("fbrEnabled").lean();
  if (tenant?.fbrEnabled && sale.fbrInvoiceNumber) {
    await Sale.updateOne({ _id: sale._id, tenant: tid }, { fbrStatus: "pending" });
    await syncSaleToFbr(tid, sale._id, "return");
  }
  return Sale.findOne({ _id: sale._id, tenant: tid }).lean();
});
