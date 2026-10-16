"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Barcode, Boxes, Camera, ListPlus, Star, Package, Pencil, Plus, Printer, Search, SlidersHorizontal, Smartphone, Tags, Trash2, Wand2 } from "lucide-react";
import { BarcodeSvg } from "@/components/barcode";
import { CameraButton, CameraScanner, useBarcodeScanner } from "@/components/barcode-scanner";
import { Badge, Button, Card, Count, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Td, Textarea, Th } from "@/components/ui";
import { useCan, useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { StarterItemsModal } from "@/components/starter-items";
import { compressImage } from "@/lib/image";
import { api, formatDate, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";
import { extraName } from "@/lib/product-search";

type Category = { _id: string; name: string };
type Product = {
  _id: string;
  name: string;
  nameUrdu?: string;
  barcode?: string;
  sku?: string;
  brand?: string;
  fits?: string;
  hasImage?: boolean;
  favourite?: boolean;
  updatedAt?: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  wholesalePrice?: number;
  packs?: { name: string; size: number; price?: number; wholesalePrice?: number; barcode?: string }[];
  stock: number;
  lowStockAlert: number;
  expiryDate?: string;
  trackExpiry?: boolean;
  shelfLifeDays?: number;
  trackSerial?: boolean;
  warrantyMonths?: number;
  pctCode?: string;
  category?: Category | null;
};

const EMPTY = {
  name: "",
  nameUrdu: "",
  barcode: "",
  sku: "",
  brand: "",
  fits: "",
  category: "",
  unit: "pcs",
  costPrice: "",
  salePrice: "",
  wholesalePrice: "",
  lowStockAlert: "5",
  expiryDate: "",
  openingStock: "",
  shelfLifeDays: "",
  warrantyMonths: "",
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
  const [starterOpen, setStarterOpen] = useState(false);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "expiring">((params.get("filter") as "low" | "expiring") ?? "all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const confirm = useConfirm();
  const { branch, branches, branchLocked } = useSession();
  const multiBranch = (branches?.length ?? 0) > 1;
  const [allBranches, setAllBranches] = useState(false);

  const load = useCallback(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cat) sp.set("category", cat);
    if (filter !== "all") sp.set("filter", filter);
    if (allBranches) sp.set("branch", "all");
    api<Product[]>(`/api/products?${sp}`).then(setProducts).catch((e) => toast.error(e.message));
  }, [q, cat, filter, allBranches, toast]);

  async function toggleFavourite(p: Product) {
    try {
      await api(`/api/products/${p._id}/favourite`, { body: { favourite: !p.favourite } });
      setProducts((list) => list && list.map((x) => (x._id === p._id ? { ...x, favourite: !p.favourite } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const loadCats = useCallback(() => {
    api<Category[]>("/api/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(loadCats, [loadCats]);

  // Scanning a product's barcode (USB scanner or camera) finds it in the list.
  useBarcodeScanner((code) => setQ(code), editing === null && adjusting === null && !catsOpen && !cameraOpen && !starterOpen);

  async function assignMissing() {
    const missing = products?.filter((p) => !p.barcode).length ?? 0;
    const ok = await confirm({
      title: "Create barcodes?",
      message: "Every product without a barcode gets its own in-store barcode, ready to print on labels.",
      tone: "info",
      icon: "info",
      details: missing ? [{ label: "Products without a barcode (this list)", value: missing, strong: true }] : undefined,
      points: ["Products that already have a barcode are not changed.", "Barcodes start with 20 (reserved for shops), so they never clash with company barcodes."],
      confirmLabel: "Create barcodes",
    });
    if (!ok) return;
    setAssigning(true);
    try {
      const r = await api<{ assigned: number }>("/api/barcodes/assign", { body: {} });
      toast.success(r.assigned ? `${r.assigned} barcode(s) created. Print labels to stick on the items.` : "Every product already has a barcode.");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  const stockValue = products?.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0) ?? 0;

  async function remove(p: Product) {
    const ok = await confirm({
      title: `Remove "${p.name}"?`,
      message: "It will no longer appear in New Bill, Products or Purchases.",
      tone: "danger",
      icon: "delete",
      details: [
        { label: "Barcode", value: p.barcode || "—" },
        { label: "Stock now", value: `${formatQty(p.stock)} ${UNIT_LABELS[p.unit]}` },
      ],
      points: ["Old bills, reports and stock history still show this item."],
      confirmLabel: "Remove product",
    });
    if (!ok) return;
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
        subtitle={
          products
            ? <><Count n={products.length} one="{n} item" many="{n} items" />{multiBranch ? ` · Stock at ${allBranches ? "all branches" : branch?.name}` : ""}{can.manage ? ` · Stock value ${formatPKR(stockValue)}` : ""}</>
            : undefined
        }
        actions={
          can.manage && (
            <>
              <Button variant="outline" icon={<Tags className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>
                Categories
              </Button>
              <Button variant="outline" icon={<Wand2 className="h-4 w-4" />} loading={assigning} onClick={assignMissing}>
                Create barcodes
              </Button>
              <Link href="/labels">
                <Button variant="outline" icon={<Printer className="h-4 w-4" />}>Print labels</Button>
              </Link>
              <Button variant="outline" icon={<ListPlus className="h-4 w-4" />} onClick={() => setStarterOpen(true)}>
                Ready-made items
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
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, phone model or scan barcode" className="pl-10" />
            </div>
            <CameraButton onClick={() => setCameraOpen(true)} />
          </div>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="lg:w-56">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          {multiBranch && can.manage && !branchLocked && (
            <Segmented
              value={allBranches ? "all" : "here"}
              onChange={(v) => setAllBranches(v === "all")}
              options={[
                { value: "here", label: "This branch" },
                { value: "all", label: "All branches" },
              ]}
            />
          )}
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
                      <div className="flex items-center gap-2">
                        {p.hasImage && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/products/${p._id}/image?v=${encodeURIComponent(p.updatedAt ?? "")}`} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg bg-slate-50 object-contain" />
                        )}
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        {can.manage ? (
                          <button
                            type="button"
                            onClick={() => toggleFavourite(p)}
                            aria-label={`${p.favourite ? "Unstar" : "Star"} ${p.name}`}
                            title={p.favourite ? "Remove from Favourites" : "Show first on the sale screen"}
                            className="rounded p-0.5 text-slate-300 hover:text-amber-500"
                          >
                            <Star className={p.favourite ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"} />
                          </button>
                        ) : (
                          p.favourite && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        )}
                      </div>
                      {(extraName(p.name, p.brand) || p.fits) && (
                        <div className="text-xs text-slate-500">{[extraName(p.name, p.brand), p.fits && `Fits ${p.fits}`].filter(Boolean).join(" · ")}</div>
                      )}
                      <div className="text-xs text-slate-400">
                        {extraName(p.name, p.nameUrdu) && <span className="urdu mr-2">{extraName(p.name, p.nameUrdu)}</span>}
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
                          {p.trackSerial ? (
                            <Link href={`/phones?product=${p._id}`} title="Phones of this model by IMEI">
                              <Button size="sm" variant="ghost" icon={<Smartphone className="h-4 w-4" />}>
                                IMEIs
                              </Button>
                            </Link>
                          ) : (
                            <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setAdjusting(p)}>
                              Stock
                            </Button>
                          )}
                          <Link href={`/labels?ids=${p._id}`} title="Print barcode labels">
                            <Button size="sm" variant="ghost" aria-label="Print labels">
                              <Barcode className="h-4 w-4" />
                            </Button>
                          </Link>
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
      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={(code) => setQ(code)} />
      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={categories} onChanged={loadCats} />
      <StarterItemsModal
        open={starterOpen}
        onClose={() => setStarterOpen(false)}
        onAdded={() => {
          setStarterOpen(false);
          load();
          loadCats();
        }}
      />
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
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [trackSerial, setTrackSerial] = useState(false);
  // Photo: undefined = unchanged, "" = removed, data URL = new photo.
  const [image, setImage] = useState<string | undefined>(undefined);
  const [favourite, setFavourite] = useState(false);
  const [saving, setSaving] = useState(false);
  const phonesOn = !!settings?.modules?.phones || !!product?.trackSerial;

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            nameUrdu: product.nameUrdu ?? "",
            barcode: product.barcode ?? "",
            sku: product.sku ?? "",
            brand: product.brand ?? "",
            fits: product.fits ?? "",
            category: product.category?._id ?? "",
            unit: product.unit,
            costPrice: String(product.costPrice),
            salePrice: String(product.salePrice),
            wholesalePrice: product.wholesalePrice ? String(product.wholesalePrice) : "",
            lowStockAlert: String(product.lowStockAlert),
            expiryDate: product.expiryDate ? product.expiryDate.slice(0, 10) : "",
            openingStock: "",
            pctCode: product.pctCode ?? "",
            shelfLifeDays: product.shelfLifeDays ? String(product.shelfLifeDays) : "",
            warrantyMonths: product.warrantyMonths ? String(product.warrantyMonths) : "",
          }
        : EMPTY,
    );
    setTrackExpiry(!!product?.trackExpiry);
    setTrackSerial(!!product?.trackSerial);
    setImage(undefined);
    setFavourite(!!product?.favourite);
    setPacks(
      (product?.packs ?? []).map((k) => ({
        name: k.name,
        size: String(k.size),
        price: k.price ? String(k.price) : "",
        wholesalePrice: k.wholesalePrice ? String(k.wholesalePrice) : "",
        barcode: k.barcode ?? "",
      })),
    );
  }, [open, product]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const [scanOpen, setScanOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const confirm = useConfirm();
  async function generate() {
    if (
      form.barcode &&
      !(await confirm({
        title: "Replace the barcode?",
        message: "Labels already stuck on this item will stop working with the new barcode.",
        tone: "warning",
        details: [{ label: "Current barcode", value: form.barcode }],
        confirmLabel: "Create new barcode",
      }))
    )
      return;
    setGenerating(true);
    try {
      const r = await api<{ barcode: string }>("/api/barcodes/next", { method: "POST" });
      setForm((f) => ({ ...f, barcode: r.barcode }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }
  const margin = Number(form.salePrice) - Number(form.costPrice);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        ...(image !== undefined ? { image } : {}),
        favourite,
        expiryDate: form.expiryDate || null,
        trackExpiry,
        ...(phonesOn ? { trackSerial } : {}),
        ...(trackSerial ? { unit: "pcs", openingStock: "" } : {}),
        packs: (trackSerial ? [] : packs)
          .filter((k) => k.name.trim() || k.size)
          .map((k) => ({ name: k.name.trim(), size: Number(k.size), price: k.price, wholesalePrice: k.wholesalePrice, barcode: k.barcode.trim() })),
      };
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
        <div className="flex items-center gap-3 sm:col-span-2">
          <PhotoPicker current={image === undefined ? (product?.hasImage ? `/api/products/${product._id}/image?v=${encodeURIComponent(product.updatedAt ?? "")}` : null) : image || null} onChange={setImage} />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={favourite} onChange={(e) => setFavourite(e.target.checked)} className="h-4 w-4 accent-brand-600" aria-label="Favourite" />
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> Favourite — show first on the sale screen
          </label>
        </div>
        <Field label="Brand (optional)">
          <Input value={form.brand} onChange={set("brand")} placeholder={phonesOn ? "e.g. Samsung, Anker, Faster, Audionic" : "e.g. Nestlé, Shan"} maxLength={60} aria-label="Brand" />
        </Field>
        {phonesOn && (
          <Field label="Fits phone models (accessories)" hint="Covers, protectors, batteries, chargers: searching a model finds this item">
            <Input value={form.fits} onChange={set("fits")} placeholder="e.g. Samsung A54, A55 · iPhone 13, 14" maxLength={300} aria-label="Fits phone models" />
          </Field>
        )}
        <Field label="Sold by" hint="Kg / Litre items let you sell by weight or by rupees">
          <Select value={form.unit} onChange={set("unit")}>
            {Object.entries(UNIT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <div>
          <Field label="Barcode" hint="Click the box and scan, use the camera, or create one">
            <div className="flex gap-2">
              <Input
                value={form.barcode}
                onChange={set("barcode")}
                // Scanners press Enter after the code: don't let that submit the form.
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="e.g. 8961014000123"
                className="min-w-0 flex-1"
              />
              <CameraButton onClick={() => setScanOpen(true)} />
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                title="Create a new barcode"
                aria-label="Create a new barcode"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-xs hover:bg-slate-50 hover:text-brand-700 disabled:opacity-50"
              >
                <Wand2 className="h-5 w-5" />
              </button>
            </div>
          </Field>
          {form.barcode && (
            <div className="mt-2 flex justify-center rounded-xl border border-slate-200 bg-white p-2">
              <BarcodeSvg value={form.barcode} height={36} width={1.4} fontSize={11} />
            </div>
          )}
          <CameraScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={(code) => setForm((f) => ({ ...f, barcode: code }))} />
        </div>
        <Field label="Cost price (you buy at) *">
          <Input required type="number" inputMode="decimal" step="any" min="0" value={form.costPrice} onChange={set("costPrice")} placeholder="0" />
        </Field>
        <Field label="Sale price (you sell at) *" hint={form.salePrice && form.costPrice ? `Profit per ${UNIT_LABELS[form.unit]}: ${formatPKR(margin)}` : undefined} error={margin < 0 ? "Sale price is less than cost price" : undefined}>
          <Input required type="number" inputMode="decimal" step="any" min="0" value={form.salePrice} onChange={set("salePrice")} placeholder="0" />
        </Field>
        <Field label="Wholesale price (optional)" hint={`For customers marked "wholesale". Empty = same as sale price.`}>
          <Input type="number" inputMode="decimal" step="any" min="0" value={form.wholesalePrice} onChange={set("wholesalePrice")} placeholder={form.salePrice || "0"} aria-label="Wholesale price" />
        </Field>
        {phonesOn && (
          <div className="space-y-3 sm:col-span-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={trackSerial}
                onChange={(e) => {
                  setTrackSerial(e.target.checked);
                  if (e.target.checked) setForm((f) => ({ ...f, unit: "pcs" }));
                }}
                className="mt-0.5 h-5 w-5 accent-brand-600"
                aria-label="Track by IMEI"
              />
              <span>
                <span className="block font-semibold text-slate-800">Track each piece by IMEI / serial number</span>
                <span className="text-sm text-slate-500">For mobile phones and tablets. Every phone is bought, sold, returned and moved by its IMEI, and the IMEI prints on the bill. After saving, add phones from Phones → Add phones or from a purchase.</span>
              </span>
            </label>
            {trackSerial && (
              <Field label="Warranty (months)" hint="Printed on the bill with the end date. Empty = no warranty.">
                <Input type="number" inputMode="numeric" min="0" max="120" value={form.warrantyMonths} onChange={set("warrantyMonths")} placeholder="e.g. 12" aria-label="Warranty months" />
              </Field>
            )}
          </div>
        )}
        {!trackSerial && <PacksEditor unit={UNIT_LABELS[form.unit] ?? form.unit} unitPrice={Number(form.salePrice) || 0} packs={packs} onChange={setPacks} />}
        {!product && !trackSerial && (
          <Field label="Stock you have now" hint="How many are in the shop today">
            <Input type="number" inputMode="decimal" step="any" min="0" value={form.openingStock} onChange={set("openingStock")} placeholder="0" />
          </Field>
        )}
        <Field label="Alert me when stock is below">
          <Input type="number" inputMode="decimal" step="any" min="0" value={form.lowStockAlert} onChange={set("lowStockAlert")} />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2">
          <input type="checkbox" checked={trackExpiry} onChange={(e) => setTrackExpiry(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" aria-label="Track expiry by batch" />
          <span>
            <span className="block font-semibold text-slate-800">Track expiry by batch</span>
            <span className="text-sm text-slate-500">Each delivery keeps its own expiry date; bills sell the earliest expiry first. For dairy, bakery, medicines, snacks.</span>
          </span>
        </label>
        {trackExpiry ? (
          <>
            <Field label="Shelf life (days, optional)" hint="Bakery: fills the expiry date automatically, e.g. bread 3 days">
              <Input type="number" inputMode="numeric" min="0" value={form.shelfLifeDays} onChange={set("shelfLifeDays")} placeholder="—" aria-label="Shelf life days" />
            </Field>
            {!product && (
              <Field label="Expiry of the stock you have now">
                <Input type="date" value={form.expiryDate} onChange={set("expiryDate")} aria-label="Opening stock expiry" />
              </Field>
            )}
          </>
        ) : (
          <Field label="Expiry date (optional)" hint="Useful for bakery, dairy and medicines">
            <Input type="date" value={form.expiryDate} onChange={set("expiryDate")} />
          </Field>
        )}
        {settings?.fbrEnabled && (
          <Field label="FBR PCT code" hint={`Empty = shop default (${settings.fbrDefaultPct || "11001010"})`}>
            <Input value={form.pctCode} onChange={set("pctCode")} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

type PackRow = { name: string; size: string; price: string; wholesalePrice: string; barcode: string };

/** Bigger units the product is also sold in: carton, dozen, box … each with its own price and barcode. */
function PacksEditor({ unit, unitPrice, packs, onChange }: { unit: string; unitPrice: number; packs: PackRow[]; onChange: (p: PackRow[]) => void }) {
  const update = (i: number, patch: Partial<PackRow>) => onChange(packs.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  return (
    <div className="rounded-2xl border border-slate-200 p-4 sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Packs / cartons (optional)</div>
          <div className="text-xs text-slate-500">Also sell this item as a carton, dozen or box. Stock is always counted in {unit}.</div>
        </div>
        {packs.length < 5 && (
          <Button type="button" size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...packs, { name: packs.length ? "" : "Carton", size: "", price: "", wholesalePrice: "", barcode: "" }])}>
            Add pack
          </Button>
        )}
      </div>
      {packs.map((k, i) => (
        <div key={i} className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1fr_0.8fr_1fr_1fr_1.3fr_auto]">
          <Input value={k.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Carton" aria-label="Pack name" className="h-10" />
          <Input type="number" inputMode="decimal" min="0" step="any" value={k.size} onChange={(e) => update(i, { size: e.target.value })} placeholder={`${unit} in it`} aria-label="Units in pack" className="h-10" />
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={k.price}
            onChange={(e) => update(i, { price: e.target.value })}
            placeholder={unitPrice && Number(k.size) ? String(Math.round(unitPrice * Number(k.size))) : "Price"}
            aria-label="Pack price"
            className="h-10"
          />
          <Input type="number" inputMode="decimal" min="0" step="any" value={k.wholesalePrice} onChange={(e) => update(i, { wholesalePrice: e.target.value })} placeholder="Wholesale" aria-label="Pack wholesale price" className="h-10" />
          <Input value={k.barcode} onChange={(e) => update(i, { barcode: e.target.value })} placeholder="Carton barcode" aria-label="Pack barcode" className="h-10" />
          <Button type="button" size="sm" variant="ghost" className="hover:text-rose-600" aria-label="Remove pack" icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange(packs.filter((_, j) => j !== i))} />
        </div>
      ))}
      {packs.length > 0 && <p className="mt-2 text-xs text-slate-500">Empty price = units × sale price. Scanning the carton barcode at the counter adds one carton.</p>}
    </div>
  );
}

function StockModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"add" | "remove" | "wastage" | "set">("add");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [saving, setSaving] = useState(false);
  const { branch } = useSession();
  const [detail, setDetail] = useState<{ product: { stock: number }; byBranch: { branch: string; name: string; qty: number }[] } | null>(null);

  useEffect(() => {
    setMode("add");
    setQty("");
    setNote("");
    setExpiry("");
    setBatchNo("");
    setDetail(null);
    if (product) api<typeof detail>(`/api/products/${product._id}`).then(setDetail).catch(() => {});
  }, [product]);
  if (!product) return null;

  // Adjustments apply to the branch you are working in.
  const here = detail?.product.stock ?? product.stock;
  const n = Number(qty) || 0;
  const after = mode === "add" ? here + n : mode === "set" ? n : here - n;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/products/${product!._id}/stock`, { body: { mode, qty: n, note, ...(product!.trackExpiry && after > here ? { expiryDate: expiry, batchNo } : {}) } });
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
          <div className="text-sm text-slate-500">Current stock{detail && detail.byBranch.length > 1 ? ` in ${branch?.name}` : ""}</div>
          <div className="text-3xl font-extrabold text-slate-900">
            {formatQty(here)} <span className="text-base font-medium text-slate-500">{UNIT_LABELS[product.unit]}</span>
          </div>
          {detail && detail.byBranch.length > 1 && (
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {detail.byBranch.map((b) => (
                <span key={b.branch}>
                  {b.name}: <b className="text-slate-700">{formatQty(b.qty)}</b>
                </span>
              ))}
            </div>
          )}
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
        {product.trackExpiry && after > here && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry of this stock" hint={product.shelfLifeDays ? `Empty = ${product.shelfLifeDays} days from today` : undefined}>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Batch expiry" />
            </Field>
            <Field label="Batch no. (optional)">
              <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} maxLength={40} />
            </Field>
          </div>
        )}
        {product.trackExpiry && after < here && <p className="text-xs text-slate-500">Taken from the lot that expires first.</p>}
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
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: `Delete category "${c.name}"?`,
      message: "Products in this category are kept; they will just have no category.",
      tone: "danger",
      icon: "delete",
      confirmLabel: "Delete category",
    });
    if (!ok) return;
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

/** Small product photo for the sale screen: take or choose a picture, made small before saving. */
function PhotoPicker({ current, onChange }: { current: string | null; onChange: (v: string) => void }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2">
      <label className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-brand-400" title="Photo for the sale screen">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="Product photo" className="h-full w-full object-contain" />
        ) : (
          <Camera className="h-6 w-6" />
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Product photo"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              onChange(await compressImage(f, 320));
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        />
      </label>
      {current && (
        <button type="button" onClick={() => onChange("")} className="text-xs font-semibold text-rose-600 hover:underline">
          Remove photo
        </button>
      )}
    </div>
  );
}
