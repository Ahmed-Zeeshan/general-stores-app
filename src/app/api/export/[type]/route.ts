import { ApiError, dateRange, handle, requireTenant } from "@/lib/api";
import { withCategories } from "@/lib/categories";
import { csvResponse, toCsv } from "@/lib/csv";
import { Expense, Party, Product, Sale } from "@/models";

type Ctx = { params: Promise<{ type: string }> };

const day = () => new Date().toISOString().slice(0, 10);

export const GET = handle<Ctx>(async (req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { type } = await params;
  const url = new URL(req.url);

  if (type === "products") {
    const products = await withCategories(tid, await Product.find({ tenant: tid, active: true }).sort({ name: 1 }).lean());
    return csvResponse(
      `products-${day()}.csv`,
      toCsv(
        ["name", "nameUrdu", "barcode", "category", "unit", "costPrice", "salePrice", "stock", "lowStockAlert", "expiryDate", "pctCode"],
        products.map((p) => [p.name, p.nameUrdu, p.barcode, p.category?.name, p.unit, p.costPrice, p.salePrice, p.stock, p.lowStockAlert, p.expiryDate ? new Date(p.expiryDate).toISOString().slice(0, 10) : "", p.pctCode]),
      ),
    );
  }
  if (type === "customers" || type === "suppliers") {
    const parties = await Party.find({ tenant: tid, type: type === "customers" ? "customer" : "supplier", active: true }).sort({ name: 1 }).lean();
    return csvResponse(
      `${type}-${day()}.csv`,
      toCsv(["name", "phone", "address", "balance", "creditLimit", "notes"], parties.map((p) => [p.name, p.phone, p.address, p.balance, p.creditLimit, p.notes])),
    );
  }
  if (type === "sales") {
    const { from, to } = dateRange(url, 29);
    const sales = await Sale.find({ tenant: tid, createdAt: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean();
    return csvResponse(
      `sales-${day()}.csv`,
      toCsv(
        ["invoiceNo", "date", "status", "customer", "cashier", "items", "subtotal", "discount", "tax", "total", "cost", "paymentMethod", "paid", "udhaar", "fbrInvoiceNumber"],
        sales.map((s) => [s.invoiceNo, s.createdAt, s.status, s.customerName, s.cashierName, s.items.length, s.subtotal, s.discount, s.tax, s.total, s.costTotal, s.paymentMethod, s.amountPaid, s.creditAmount, s.fbrInvoiceNumber]),
      ),
    );
  }
  if (type === "expenses") {
    const { from, to } = dateRange(url, 29);
    const list = await Expense.find({ tenant: tid, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
    return csvResponse(`expenses-${day()}.csv`, toCsv(["date", "category", "amount", "note"], list.map((e) => [e.date, e.category, e.amount, e.note])));
  }
  throw new ApiError(404, "Unknown export.");
});
