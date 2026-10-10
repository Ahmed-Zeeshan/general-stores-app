"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Boxes, Package, Pencil, Plus, Search, SlidersHorizontal, Tags, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Td, Th, Textarea } from "@/components/ui";
import { useCan, useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, formatDate, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";

type Category = { _id: string; name: string };
type Product = {
  _id: string;
  name: string;
  nameUrdu?: string;
  barcode?: string;
  sku?: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  lowStockAlert: number;
  expiryDate?: string;
  pctCode?: string;
  category?: Category | null;
};

const EMPTY = {
  name: "",
  nameUrdu: "",
  barcode: "",
  sku: "",
  category: "",
  unit: "pcs",
  costPrice: "",
  salePrice: "",
  lowStockAlert: "5",
  expiryDate: "",
  openingStock: "",
  pctCode: "",
};

export default function ProductsPageWrapper() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductsPage />
    </Suspense>
  );
}

function ProductsPage() {
  const toast = useToast();
  const can = useCan();
  const params = useSearchParams();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "expiring">((params.get("filter") as "low" | "expiring") ?? "all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);

  const load = useCallback(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cat) sp.set("category", cat);
    if (filter !== "all") sp.set("filter", filter);
    api<Product[]>(`/api/products?${sp}`).then(setProducts).catch((e) => toast.error(e.message));
  }, [q, cat, filter, toast]);

  const loadCats = useCallback(() => {
    api<Category[]>("/api/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(loadCats, [loadCats]);

  const stockValue = products?.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0) ?? 0;

  async function remove(p: Product) {
    if (!confirm(`Remove "${p.name}"? Old bills will still show it.`)) return;
    try {
      await api(`/api/products/${p._id}`, { method: "DELETE" });
      toast.success("Product removed");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Products & Stock"
        urdu="اشیاء اور اسٹاک"
        subtitle={products ? `${products.length} items${can.manage ? ` · Stock value ${formatPKR(stockValue)}` : ""}` : undefined}
        actions={
          can.manage && (
            <>
              <Button variant="outline" icon={<Tags className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>
                Categories
              </Button>
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
                Add product
              </Button>
            </>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or barcode" className="pl-10" />
          </div>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="lg:w-56">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "low", label: "Low stock" },
              { value: "expiring", label: "Expiring" },
            ]}
          />
        </div>

        {!products ? (
          <Spinner />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title={filter === "all" && !q ? "No products yet" : "Nothing found"}
            text={filter === "all" && !q ? "Add the items you sell. You can add stock and prices for each one." : "Try a different search or filter."}
            action={can.manage && filter === "all" && !q && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Add first product</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                {can.manage && <Th className="text-right">Cost</Th>}
                <Th className="text-right">Sale price</Th>
                <Th className="text-right">Stock</Th>
                <Th>Expiry</Th>
                {can.manage && <Th />}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const low = p.stock <= p.lowStockAlert;
                const expSoon = p.expiryDate && new Date(p.expiryDate).getTime() - Date.now() < 7 * 864e5;
                return (
                  <tr key={p._id} className="hover:bg-slate-50/60">
                    <Td>
                      <div className="font-semibold text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-400">
                        {p.nameUrdu && <span className="urdu mr-2">{p.nameUrdu}</span>}
                        {p.barcode}
                      </div>
                    </Td>
                    <Td className="text-slate-500">{p.category?.name ?? "—"}</Td>
                    {can.manage && <Td className="text-right text-slate-500">{formatPKR(p.costPrice)}</Td>}
                    <Td className="text-right font-semibold text-slate-900">
                      {formatPKR(p.salePrice)}
                      <span className="text-xs font-normal text-slate-400"> /{UNIT_LABELS[p.unit]}</span>
                    </Td>
                    <Td className="text-right">
                      <Badge color={p.stock <= 0 ? "red" : low ? "amber" : "green"}>
                        {formatQty(p.stock)} {UNIT_LABELS[p.unit]}
                      </Badge>
                    </Td>
                    <Td>{p.expiryDate ? <Badge color={expSoon ? "red" : "slate"}>{formatDate(p.expiryDate)}</Badge> : <span className="text-slate-300">—</span>}</Td>
                    {can.manage && (
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setAdjusting(p)}>
                            Stock
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label="Remove" className="hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ProductForm
        open={editing !== null}
        product={editing === "new" ? null : editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <StockModal
        product={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={() => {
          setAdjusting(null);
          load();
        }}
      />
      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={categories} onChanged={loadCats} />
    </div>
  );
}

function ProductForm({
  open,
  product,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { settings } = useSession();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            nameUrdu: product.nameUrdu ?? "",
            barcode: product.barcode ?? "",
            sku: product.sku ?? "",
            category: product.category?._id ?? "",
            unit: product.unit,
            costPrice: String(product.costPrice),
            salePrice: String(product.salePrice),
            lowStockAlert: String(product.lowStockAlert),
            expiryDate: product.expiryDate ? product.expiryDate.slice(0, 10) : "",
            openingStock: "",
            pctCode: product.pctCode ?? "",
          }
        : EMPTY,
    );
  }, [open, product]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const margin = Number(form.salePrice) - Number(form.costPrice);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, expiryDate: form.expiryDate || null };
      if (product) await api(`/api/products/${product._id}`, { method: "PUT", body });
      else await api("/api/products", { body });
      toast.success(product ? "Product updated" : "Product added");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Edit product" : "Add product"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="product-form" loading={saving}>{product ? "Save changes" : "Add product"}</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name *" className="sm:col-span-2">
          <Input autoFocus required value={form.name} onChange={set("name")} placeholder="e.g. Sugar, Dairy Milk 50g, Bread Large" />
        </Field>
        <Field label="Name in Urdu (optional)">
          <Input value={form.nameUrdu} onChange={set("nameUrdu")} dir="rtl" className="urdu" placeholder="چینی" />
        </Field>
        <Field label="Category">
          <Select value={form.category} onChange={set("category")}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sold by" hint="Kg / Litre items let you sell by weight or by rupees">
          <Select value={form.unit} onChange={set("unit")}>
            {Object.entries(UNIT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Barcode" hint="Scan it with your barcode scanner">
          <Input value={form.barcode} onChange={set("barcode")} placeholder="e.g. 8961014000123" />
        </Field>
        <Field label="Cost price (you buy at) *">
          <Input required type="number" inputMode="decimal" step="any" min="0" value={form.costPrice} onChange={set("costPrice")} placeholder="0" />
        </Field>
        <Field label="Sale price (you sell at) *" hint={form.salePrice && form.costPrice ? `Profit per ${UNIT_LABELS[form.unit]}: ${formatPKR(margin)}` : undefined} error={margin < 0 ? "Sale price is less than cost price" : undefined}>
          <Input required type="number" inputMode="decimal" step="any" min="0" value={form.salePrice} onChange={set("salePrice")} placeholder="0" />
        </Field>
        {!product && (
          <Field label="Stock you have now" hint="How many are in the shop today">
            <Input type="number" inputMode="decimal" step="any" min="0" value={form.openingStock} onChange={set("openingStock")} placeholder="0" />
          </Field>
        )}
        <Field label="Alert me when stock is below">
          <Input type="number" inputMode="decimal" step="any" min="0" value={form.lowStockAlert} onChange={set("lowStockAlert")} />
        </Field>
        <Field label="Expiry date (optional)" hint="Useful for bakery, dairy and medicines">
          <Input type="date" value={form.expiryDate} onChange={set("expiryDate")} />
        </Field>
        {settings?.fbrEnabled && (
          <Field label="FBR PCT code" hint={`Empty = shop default (${settings.fbrDefaultPct || "11001010"})`}>
            <Input value={form.pctCode} onChange={set("pctCode")} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function StockModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"add" | "remove" | "wastage" | "set">("add");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode("add");
    setQty("");
    setNote("");
  }, [product]);
  if (!product) return null;

  const n = Number(qty) || 0;
  const after = mode === "add" ? product.stock + n : mode === "set" ? n : product.stock - n;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/products/${product!._id}/stock`, { body: { mode, qty: n, note } });
      toast.success("Stock updated");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Stock: ${product.name}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <div className="text-sm text-slate-500">Current stock</div>
          <div className="text-3xl font-extrabold text-slate-900">
            {formatQty(product.stock)} <span className="text-base font-medium text-slate-500">{UNIT_LABELS[product.unit]}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["add", "Add stock"],
              ["remove", "Remove"],
              ["wastage", "Wastage / Expired"],
              ["set", "Set exact count"],
            ] as const
          ).map(([v, l]) => (
            <button
              type="button"
              key={v}
              onClick={() => setMode(v)}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold ${mode === v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <Field label={mode === "set" ? "Actual count in shop" : "Quantity"}>
          <Input autoFocus required type="number" inputMode="decimal" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="h-12 text-xl font-bold" />
        </Field>
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Damaged packets, monthly stock count" className="min-h-[60px]" />
        </Field>
        <p className="text-center text-sm text-slate-500">
          New stock will be <b className="text-slate-900">{formatQty(after)} {UNIT_LABELS[product.unit]}</b>
        </p>
        <Button type="submit" size="lg" className="w-full" loading={saving} icon={<Boxes className="h-5 w-5" />}>
          Update stock
        </Button>
      </form>
    </Modal>
  );
}

function CategoriesModal({ open, onClose, categories, onChanged }: { open: boolean; onClose: () => void; categories: Category[]; onChanged: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/categories", { body: { name } });
      setName("");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  async function remove(c: Category) {
    if (!confirm(`Delete category "${c.name}"? Products will stay, just without a category.`)) return;
    try {
      await api(`/api/categories/${c._id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Categories" size="sm">
      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
        <Button type="submit" icon={<Plus className="h-4 w-4" />}>Add</Button>
      </form>
      <ul className="divide-y divide-slate-100">
        {categories.map((c) => (
          <li key={c._id} className="flex items-center justify-between py-2.5">
            <span className="font-medium text-slate-700">{c.name}</span>
            <button onClick={() => remove(c)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
