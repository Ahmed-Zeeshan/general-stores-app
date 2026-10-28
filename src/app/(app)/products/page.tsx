"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Barcode, Boxes, Camera, ChevronLeft, ChevronRight, Download, History, ListOrdered, ListPlus, Minus, MoreHorizontal, Star, Package, PackageX, Pencil, Plus, Printer, Search, SlidersHorizontal, Smartphone, Tags, Trash2, TrendingDown, TrendingUp, Wand2, X } from "lucide-react";
import { BarcodeSvg } from "@/components/barcode";
import { CameraButton, CameraScanner, useBarcodeScanner } from "@/components/barcode-scanner";
import { Badge, Button, Card, cn, Count, EmptyState, Field, Input, Menu, MenuItem, Modal, PageHeader, Segmented, Select, Spinner, StatTile, Textarea } from "@/components/ui";
import { toCsv } from "@/lib/csv";
import { useCan, useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { StarterItemsModal } from "@/components/starter-items";
import { PriceHistoryModal } from "@/components/price-history";
import { StockHistoryModal } from "@/components/stock-history";
import { BulkPriceModal } from "@/components/bulk-prices";
import { compressImage } from "@/lib/image";
import { api, formatDate, todayISO, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";
import { extraName } from "@/lib/product-search";
import { useT } from "@/lib/i18n";

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
  totalStock?: number;
  lowStockAlert: number;
  expiryDate?: string;
  trackExpiry?: boolean;
  shelfLifeDays?: number;
  trackSerial?: boolean;
  warrantyMonths?: number;
  pctCode?: string;
  category?: Category | null;
  /** Units sold in the last 30 days at this branch; when it last sold (from the server). */
  sold30?: number;
  lastSoldAt?: string | null;
};

type SortKey = "name" | "category" | "costPrice" | "salePrice" | "margin" | "stock" | "sold30" | "lastSoldAt";
type Filter = "all" | "low" | "out" | "dead" | "expiring";
const DEFAULT_PAGE_SIZE = 50;
const ALL_PAGE_SIZE = 100000;
/** Not sold for this many days (and still in stock) = dead stock. */
const DEAD_DAYS = 60;

/** Profit margin on the sale price (%). Null when there is no cost or sale price to compare. */
function marginPct(p: { costPrice: number; salePrice: number }): number | null {
  if (!p.salePrice || p.costPrice == null) return null;
  return ((p.salePrice - p.costPrice) / p.salePrice) * 100;
}

/** Days since the product last sold; null = never sold in the window (treated as dead stock). */
function daysSinceSold(p: Product): number | null {
  if (!p.lastSoldAt) return null;
  return Math.floor((Date.now() - new Date(p.lastSoldAt).getTime()) / 864e5);
}

function isDead(p: Product): boolean {
  if (p.trackSerial) return false;
  if (p.stock <= 0) return false;
  const d = daysSinceSold(p);
  return d === null || d >= DEAD_DAYS;
}

const QUICK_UNITS = ["pcs", "dozen", "pack", "box", "carton"];

/** A column heading you can click to sort by; shows the direction and highlights when active. */
function SortTh({ label, k, sort, onSort, align = "left", grow = false }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; align?: "left" | "right"; grow?: boolean }) {
  const t = useT();
  const active = sort.key === k;
  return (
    <th className={cn("whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500", align === "right" && "text-right", grow && "w-full")}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-slate-800", active && "text-slate-800", align === "right" && "w-full flex-row-reverse")}>
        {t(label)}
        {active ? sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

/** A price you edit by clicking it: type a new amount, Enter or click away to save, Esc to cancel. */
function InlinePrice({ value, unitLabel, onSave }: { value: number; unitLabel: string; onSave: (v: number) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  function commit() {
    setEditing(false);
    const n = Number(text);
    if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
  }
  if (editing)
    return (
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 rounded-lg border border-brand-400 px-2 py-1 text-right text-sm focus:outline-hidden"
      />
    );
  return (
    <button
      type="button"
      onClick={() => {
        setText(String(value));
        setEditing(true);
      }}
      title={t("Click to change the price")}
      className="group inline-flex items-center gap-1 font-semibold text-slate-900 hover:text-brand-700"
    >
      {formatPKR(value)}
      <span className="text-xs font-normal text-slate-400"> /{unitLabel}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
    </button>
  );
}

/** The small line under "Sold (30d)": when it last sold, or a calm "no sales yet" / violet "Dead" flag. */
function movementLabel(p: Product, dsold: number | null, dead: boolean, t: ReturnType<typeof useT>): React.ReactNode {
  if (p.trackSerial) return <span className="text-slate-300">—</span>;
  if (dsold === null) return <span className="text-slate-400">{t("no sales yet")}</span>;
  if (dead) return <span className="font-medium text-violet-600">{t("Dead · {n}d", { n: dsold })}</span>;
  if (dsold === 0) return <span className="text-emerald-600">{t("sold today")}</span>;
  return <span className="text-slate-400">{t("{n}d ago", { n: dsold })}</span>;
}

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
  const t = useT();
  const can = useCan();
  const params = useSearchParams();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [starterOpen, setStarterOpen] = useState(false);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState("");
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) ?? "all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  // Stock card of one item; ?id=<product> opens it (links from the activity log and elsewhere).
  const [stockOf, setStockOf] = useState<string | null>(params.get("id"));
  const [bulkOpen, setBulkOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const confirm = useConfirm();
  const { branch, branches, branchLocked } = useSession();
  const multiBranch = (branches?.length ?? 0) > 1;
  const [allBranches, setAllBranches] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState("");

  // Filtering, sorting and paging all happen on the device from one full fetch, so the stat strip
  // counts and the "dead stock" / "out of stock" filters stay accurate for the current search.
  const load = useCallback(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cat) sp.set("category", cat);
    if (allBranches) sp.set("branch", "all");
    api<Product[]>(`/api/products?${sp}`).then(setProducts).catch((e) => toast.error(e.message));
  }, [q, cat, allBranches, toast]);

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
      title: t("Create barcodes?"),
      message: t("Every product without a barcode gets its own in-store barcode, ready to print on labels."),
      tone: "info",
      icon: "info",
      details: missing ? [{ label: t("Products without a barcode (this list)"), value: missing, strong: true }] : undefined,
      points: [t("Products that already have a barcode are not changed."), t("Barcodes start with 20 (reserved for shops), so they never clash with company barcodes.")],
      confirmLabel: "Create barcodes",
    });
    if (!ok) return;
    setAssigning(true);
    try {
      const r = await api<{ assigned: number }>("/api/barcodes/assign", { body: {} });
      toast.success(r.assigned ? t("{n} barcode(s) created. Print labels to stick on the items.", { n: r.assigned }) : t("Every product already has a barcode."));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  const stockValue = products?.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0) ?? 0;
  const retailValue = products?.reduce((s, p) => s + Math.max(0, p.stock) * p.salePrice, 0) ?? 0;

  const counts = useMemo(() => {
    const list = products ?? [];
    return {
      total: list.length,
      low: list.filter((p) => p.stock > 0 && p.stock <= p.lowStockAlert).length,
      out: list.filter((p) => p.stock <= 0).length,
      dead: list.filter(isDead).length,
    };
  }, [products]);

  const visible = useMemo(() => {
    if (!products) return [];
    let rows = products;
    if (filter === "low") rows = rows.filter((p) => p.stock > 0 && p.stock <= p.lowStockAlert);
    else if (filter === "out") rows = rows.filter((p) => p.stock <= 0);
    else if (filter === "dead") rows = rows.filter(isDead);
    else if (filter === "expiring") rows = rows.filter((p) => p.expiryDate && new Date(p.expiryDate).getTime() - Date.now() < 7 * 864e5);
    const { key, dir } = sort;
    const val = (p: Product): number | string => {
      switch (key) {
        case "name": return p.name.toLowerCase();
        case "category": return (p.category?.name ?? "").toLowerCase();
        case "costPrice": return p.costPrice;
        case "salePrice": return p.salePrice;
        case "margin": return marginPct(p) ?? -Infinity;
        case "stock": return p.stock;
        case "sold30": return p.sold30 ?? 0;
        case "lastSoldAt": return p.lastSoldAt ? new Date(p.lastSoldAt).getTime() : 0;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir;
      return (av - bv) * dir;
    });
  }, [products, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);

  // Back to the first page / clear picks whenever the view changes under us.
  useEffect(() => setPage(1), [filter, sort, q, cat, allBranches, pageSize]);
  useEffect(() => setSelected(new Set()), [q, cat, allBranches]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: key === "name" || key === "category" ? 1 : -1 }));
  }
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p._id));
  function toggleSelectPage() {
    setSelected((s) => {
      const n = new Set(s);
      if (allOnPageSelected) pageRows.forEach((p) => n.delete(p._id));
      else pageRows.forEach((p) => n.add(p._id));
      return n;
    });
  }

  async function saveField(p: Product, body: { salePrice?: number; costPrice?: number }) {
    try {
      const updated = await api<Product>(`/api/products/${p._id}`, { method: "PATCH", body });
      setProducts((list) => list && list.map((x) => (x._id === p._id ? { ...x, ...updated } : x)));
      toast.success(t("Saved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function quickStock(p: Product, delta: number) {
    try {
      await api(`/api/products/${p._id}/stock`, { body: { mode: delta > 0 ? "add" : "remove", qty: Math.abs(delta), note: t("Quick adjust") } });
      setProducts((list) => list && list.map((x) => (x._id === p._id ? { ...x, stock: x.stock + delta } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    const ok = await confirm({
      title: t("Remove {n} products?", { n: ids.length }),
      message: t("They will no longer appear in New Bill, Products or Purchases."),
      tone: "danger",
      icon: "delete",
      points: [t("Old bills, reports and stock history still show these items.")],
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await Promise.all(ids.map((id) => api(`/api/products/${id}`, { method: "DELETE" })));
      toast.success(t("{n} product(s) removed", { n: ids.length }));
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function applyBulkCategory() {
    if (!bulkCat) return;
    const ids = [...selected];
    try {
      await Promise.all(ids.map((id) => api(`/api/products/${id}`, { method: "PATCH", body: { category: bulkCat === "none" ? null : bulkCat } })));
      toast.success(t("Category changed for {n} item(s)", { n: ids.length }));
      setBulkCat("");
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function exportCsv() {
    const headers = ["Name", "Barcode", "Category", "Unit", ...(can.manage ? ["Cost"] : []), "Sale price", ...(can.manage ? ["Margin %"] : []), "Stock", "Sold (30d)", "Last sold", "Expiry"];
    const rows = visible.map((p) => [
      p.name,
      p.barcode ?? "",
      p.category?.name ?? "",
      UNIT_LABELS[p.unit],
      ...(can.manage ? [p.costPrice] : []),
      p.salePrice,
      ...(can.manage ? [marginPct(p) == null ? "" : Math.round(marginPct(p)!)] : []),
      formatQty(p.stock),
      p.sold30 ?? 0,
      p.lastSoldAt ? formatDate(p.lastSoldAt) : "",
      p.expiryDate ? formatDate(p.expiryDate) : "",
    ]);
    const url = URL.createObjectURL(new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `products-${todayISO()}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  /** A printable "walk the shelves and tick the count" sheet: product, system qty, blank counted box. */
  function printSheet() {
    const shopName = branch?.name ?? "";
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const body = visible
      .map((p) => `<tr><td>${esc(p.name)}${p.barcode ? `<div class="b">${esc(p.barcode)}</div>` : ""}</td><td>${esc(p.category?.name ?? "")}</td><td class="r">${formatQty(p.stock)} ${esc(UNIT_LABELS[p.unit])}</td><td class="box"></td></tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stock count ${todayISO()}</title><style>
      body{font-family:system-ui,Arial,sans-serif;margin:24px;color:#0f172a}
      h1{font-size:18px;margin:0 0 2px} .sub{color:#64748b;font-size:12px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
      th{background:#f1f5f9} .r{text-align:right;white-space:nowrap} .box{width:90px} .b{color:#94a3b8;font-size:10px}
      @media print{body{margin:10mm}}
    </style></head><body>
      <h1>Stock count sheet${shopName ? ` — ${esc(shopName)}` : ""}</h1>
      <div class="sub">${todayISO()} · ${visible.length} items${filter !== "all" ? ` · filter: ${filter}` : ""}</div>
      <table><thead><tr><th>Product</th><th>Category</th><th class="r">System qty</th><th>Counted</th></tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error(t("Allow pop-ups to print the stock sheet."));
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  async function remove(p: Product) {
    const ok = await confirm({
      title: t('Remove "{name}"?', { name: p.name }),
      message: t("It will no longer appear in New Bill, Products or Purchases."),
      tone: "danger",
      icon: "delete",
      details: [
        { label: t("Barcode"), value: p.barcode || "—" },
        { label: t("Stock now"), value: `${formatQty(p.stock)} ${UNIT_LABELS[p.unit]}` },
      ],
      points: [t("Old bills, reports and stock history still show this item.")],
      confirmLabel: "Remove product",
    });
    if (!ok) return;
    try {
      await api(`/api/products/${p._id}`, { method: "DELETE" });
      toast.success(t("Product removed"));
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
            ? <><Count n={products.length} one="{n} item" many="{n} items" />{multiBranch ? ` · ${t("Stock at {branch}", { branch: allBranches ? t("all branches") : (branch?.name ?? "") })}` : ""}</>
            : undefined
        }
        actions={can.manage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Add product</Button>}
      />

      {can.manage && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" icon={<TrendingUp className="h-4 w-4" />} onClick={() => setBulkOpen(true)}>Update prices</Button>
          <Button variant="outline" icon={<Tags className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>Categories</Button>
          <Link href="/labels"><Button variant="outline" icon={<Barcode className="h-4 w-4" />}>Print labels</Button></Link>
          <Button variant="outline" icon={<Wand2 className="h-4 w-4" />} loading={assigning} onClick={assignMissing}>Create barcodes</Button>
          <Button variant="outline" icon={<ListPlus className="h-4 w-4" />} onClick={() => setStarterOpen(true)}>Ready-made items</Button>
          <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!products?.length}>Export to Excel</Button>
          <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={printSheet} disabled={!products?.length}>Count sheet</Button>
        </div>
      )}

      {products && products.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Products" value={counts.total} icon={<Package className="h-4 w-4" />} tone="slate" active={filter === "all"} onClick={() => setFilter("all")} />
          {can.manage && <StatTile label="Stock value" value={formatPKR(retailValue)} icon={<TrendingUp className="h-4 w-4" />} tone="green" hint={t("Cost {amount}", { amount: formatPKR(stockValue) })} />}
          <StatTile label="Low stock" value={counts.low} icon={<TrendingDown className="h-4 w-4" />} tone="amber" active={filter === "low"} onClick={() => setFilter("low")} />
          <StatTile label="Out of stock" value={counts.out} icon={<PackageX className="h-4 w-4" />} tone="rose" active={filter === "out"} onClick={() => setFilter("out")} />
          <StatTile label="Dead stock" value={counts.dead} icon={<Boxes className="h-4 w-4" />} tone="violet" active={filter === "dead"} onClick={() => setFilter("dead")} hint={t("No sale {n}d+", { n: DEAD_DAYS })} />
        </div>
      )}

      <Card>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search name, brand, phone model or scan barcode")} className="pl-10" />
            </div>
            <CameraButton onClick={() => setCameraOpen(true)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full sm:w-48">
              <option value="">{t("All categories")}</option>
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
                { value: "out", label: "Out of stock" },
                { value: "dead", label: "Dead stock" },
                { value: "expiring", label: "Expiring" },
              ]}
            />
            <div className="flex items-center gap-1 sm:ml-auto">
              <Select value={sort.key} onChange={(e) => setSort((s) => ({ key: e.target.value as SortKey, dir: s.dir }))} className="w-40">
                <option value="name">{t("Sort: Name")}</option>
                <option value="category">{t("Sort: Category")}</option>
                {can.manage && <option value="costPrice">{t("Sort: Cost")}</option>}
                <option value="salePrice">{t("Sort: Sale price")}</option>
                {can.manage && <option value="margin">{t("Sort: Margin")}</option>}
                <option value="stock">{t("Sort: Stock")}</option>
                <option value="sold30">{t("Sort: Sold (30d)")}</option>
                <option value="lastSoldAt">{t("Sort: Last sold")}</option>
              </Select>
              <Button variant="outline" aria-label="Sort direction" onClick={() => setSort((s) => ({ key: s.key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 }))} icon={sort.dir === 1 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />} />
            </div>
          </div>
        </div>

        {!products ? (
          <Spinner />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="No products yet"
            text="Add the items you sell. You can add stock and prices for each one."
            action={can.manage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Add first product</Button>}
          />
        ) : (
          <>
            {can.manage && selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-brand-50/60 p-3">
                <span className="text-sm font-semibold text-slate-700">{t("{n} selected", { n: selected.size })}</span>
                <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setSelected(new Set())}>Clear</Button>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <Link href={`/labels?ids=${[...selected].join(",")}`}>
                  <Button size="sm" variant="outline" icon={<Barcode className="h-4 w-4" />}>Print labels</Button>
                </Link>
                <Select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} className="h-9 w-44">
                  <option value="">{t("Change category…")}</option>
                  <option value="none">{t("No category")}</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </Select>
                {bulkCat && <Button size="sm" onClick={applyBulkCategory}>Apply</Button>}
                <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={bulkDelete}>Remove</Button>
              </div>
            )}
            {visible.length === 0 ? (
              <EmptyState icon={<Package className="h-8 w-8" />} title="Nothing found" text="Try a different search or filter." />
            ) : (
              <>
                {/* Desktop: data table */}
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {can.manage && (
                          <th className="w-10 border-b border-slate-200 bg-slate-50 px-4 py-3">
                            <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectPage} aria-label="Select all on this page" className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
                          </th>
                        )}
                        <SortTh label="Product" k="name" sort={sort} onSort={toggleSort} grow />
                        {can.manage && <SortTh label="Cost" k="costPrice" sort={sort} onSort={toggleSort} align="right" />}
                        <SortTh label="Sale price" k="salePrice" sort={sort} onSort={toggleSort} align="right" />
                        <SortTh label="Stock" k="stock" sort={sort} onSort={toggleSort} align="right" />
                        <SortTh label="Sold (30d)" k="sold30" sort={sort} onSort={toggleSort} align="right" />
                        {can.manage && <th className="border-b border-slate-200 bg-slate-50 px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((p) => {
                        const low = p.stock > 0 && p.stock <= p.lowStockAlert;
                        const expSoon = p.expiryDate && new Date(p.expiryDate).getTime() - Date.now() < 7 * 864e5;
                        const m = can.manage ? marginPct(p) : null;
                        const mc = m == null ? "" : m <= 0 ? "text-rose-600" : m < 15 ? "text-amber-600" : "text-emerald-600";
                        const dsold = daysSinceSold(p);
                        const dead = isDead(p);
                        const canQuick = can.manage && !p.trackSerial && QUICK_UNITS.includes(p.unit);
                        const sub = [p.category?.name, extraName(p.name, p.brand), p.fits && t("Fits {models}", { models: p.fits })].filter(Boolean).join(" · ");
                        return (
                          <tr key={p._id} className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/60", selected.has(p._id) && "bg-brand-50/40")}>
                            {can.manage && (
                              <td className="px-4 py-3 align-top">
                                <input type="checkbox" checked={selected.has(p._id)} onChange={() => toggleSelect(p._id)} aria-label={`Select ${p.name}`} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" />
                              </td>
                            )}
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-start gap-2.5">
                                {p.hasImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={`/api/products/${p._id}/image?v=${encodeURIComponent(p.updatedAt ?? "")}`} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border border-slate-100 bg-slate-50 object-contain" />
                                ) : (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-800">{p.name}</span>
                                    {can.manage ? (
                                      <button type="button" onClick={() => toggleFavourite(p)} aria-label={`${p.favourite ? "Unstar" : "Star"} ${p.name}`} title={p.favourite ? t("Remove from Favourites") : t("Show first on the sale screen")} className="rounded p-0.5 text-slate-300 hover:text-amber-500">
                                        <Star className={p.favourite ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"} />
                                      </button>
                                    ) : (
                                      p.favourite && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                    )}
                                  </div>
                                  {sub && <div className="text-xs text-slate-500">{sub}</div>}
                                  {(extraName(p.name, p.nameUrdu) || p.barcode) && (
                                    <div className="text-xs text-slate-400">
                                      {extraName(p.name, p.nameUrdu) && <span className="urdu mr-2">{extraName(p.name, p.nameUrdu)}</span>}
                                      {p.barcode}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            {can.manage && <td className="whitespace-nowrap px-4 py-3 text-right align-top tabular-nums text-slate-500">{formatPKR(p.costPrice)}</td>}
                            <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                              {can.manage && !p.trackSerial ? (
                                <InlinePrice value={p.salePrice} unitLabel={UNIT_LABELS[p.unit]} onSave={(v) => saveField(p, { salePrice: v })} />
                              ) : (
                                <span className="font-semibold tabular-nums text-slate-900">
                                  {formatPKR(p.salePrice)}
                                  <span className="text-xs font-normal text-slate-400"> /{UNIT_LABELS[p.unit]}</span>
                                </span>
                              )}
                              {can.manage && m != null && <div className={cn("text-xs font-medium tabular-nums", mc)}>{Math.round(m)}% {t("margin")}</div>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                              <div className="inline-flex items-center justify-end gap-1">
                                {canQuick && (
                                  <button type="button" onClick={() => quickStock(p, -1)} disabled={p.stock <= 0} aria-label="Remove one" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30">
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <Badge color={p.stock <= 0 ? "red" : low ? "amber" : "green"}>
                                  {formatQty(p.stock)} {UNIT_LABELS[p.unit]}
                                </Badge>
                                {canQuick && (
                                  <button type="button" onClick={() => quickStock(p, 1)} aria-label="Add one" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {p.expiryDate && (
                                <div className="mt-1 text-xs">
                                  <Badge color={expSoon ? "red" : "slate"}>{t("Exp")} {formatDate(p.expiryDate)}</Badge>
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                              <div className="font-medium tabular-nums text-slate-700">{formatQty(p.sold30 ?? 0)}</div>
                              <div className="text-xs">{movementLabel(p, dsold, dead, t)}</div>
                            </td>
                            {can.manage && (
                              <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                                <div className="flex justify-end gap-1">
                                  {p.trackSerial ? (
                                    <Link href={`/phones?product=${p._id}`} title={t("Phones of this model by IMEI")}>
                                      <Button size="sm" variant="ghost" icon={<Smartphone className="h-4 w-4" />}>IMEIs</Button>
                                    </Link>
                                  ) : (
                                    <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setAdjusting(p)}>Stock</Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                                  <Menu align="right" trigger={<Button size="sm" variant="ghost" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
                                    <MenuItem icon={<Barcode className="h-4 w-4" />} href={`/labels?ids=${p._id}`}>Print labels</MenuItem>
                                    <MenuItem icon={<History className="h-4 w-4" />} onClick={() => setHistoryOf(p._id)}>Price history</MenuItem>
                                    <MenuItem icon={<ListOrdered className="h-4 w-4" />} onClick={() => setStockOf(p._id)}>Stock history</MenuItem>
                                    <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => remove(p)}>Remove</MenuItem>
                                  </Menu>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile / tablet: cards */}
                <ul className="divide-y divide-slate-100 xl:hidden">
                  {pageRows.map((p) => {
                    const low = p.stock > 0 && p.stock <= p.lowStockAlert;
                    const m = can.manage ? marginPct(p) : null;
                    const mc = m == null ? "" : m <= 0 ? "text-rose-600" : m < 15 ? "text-amber-600" : "text-emerald-600";
                    const dsold = daysSinceSold(p);
                    const dead = isDead(p);
                    const canQuick = can.manage && !p.trackSerial && QUICK_UNITS.includes(p.unit);
                    const sub = [p.category?.name, extraName(p.name, p.brand)].filter(Boolean).join(" · ");
                    return (
                      <li key={p._id} className={cn("p-4", selected.has(p._id) && "bg-brand-50/40")}>
                        <div className="flex items-start gap-3">
                          {can.manage && <input type="checkbox" checked={selected.has(p._id)} onChange={() => toggleSelect(p._id)} aria-label={`Select ${p.name}`} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600" />}
                          {p.hasImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/products/${p._id}/image?v=${encodeURIComponent(p.updatedAt ?? "")}`} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg border border-slate-100 bg-slate-50 object-contain" />
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                              <Package className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-semibold text-slate-800">{p.name}</span>
                                  {can.manage ? (
                                    <button type="button" onClick={() => toggleFavourite(p)} aria-label={`${p.favourite ? "Unstar" : "Star"} ${p.name}`} className="shrink-0 rounded p-0.5 text-slate-300 hover:text-amber-500">
                                      <Star className={p.favourite ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"} />
                                    </button>
                                  ) : (
                                    p.favourite && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
                                  )}
                                </div>
                                {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
                              </div>
                              {can.manage && (
                                <Menu align="right" trigger={<Button size="sm" variant="ghost" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
                                  <MenuItem icon={<Barcode className="h-4 w-4" />} href={`/labels?ids=${p._id}`}>Print labels</MenuItem>
                                  <MenuItem icon={<History className="h-4 w-4" />} onClick={() => setHistoryOf(p._id)}>Price history</MenuItem>
                                  <MenuItem icon={<ListOrdered className="h-4 w-4" />} onClick={() => setStockOf(p._id)}>Stock history</MenuItem>
                                  <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => remove(p)}>Remove</MenuItem>
                                </Menu>
                              )}
                            </div>
                            <div className="mt-2 flex items-end justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-bold tabular-nums text-slate-900">
                                  {formatPKR(p.salePrice)}
                                  <span className="text-xs font-normal text-slate-400"> /{UNIT_LABELS[p.unit]}</span>
                                </div>
                                {can.manage && m != null && <div className={cn("text-xs font-medium tabular-nums", mc)}>{Math.round(m)}% {t("margin")} · {t("cost")} {formatPKR(p.costPrice)}</div>}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="inline-flex items-center gap-1">
                                  {canQuick && <button type="button" onClick={() => quickStock(p, -1)} disabled={p.stock <= 0} aria-label="Remove one" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>}
                                  <Badge color={p.stock <= 0 ? "red" : low ? "amber" : "green"}>{formatQty(p.stock)} {UNIT_LABELS[p.unit]}</Badge>
                                  {canQuick && <button type="button" onClick={() => quickStock(p, 1)} aria-label="Add one" className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><Plus className="h-3.5 w-3.5" /></button>}
                                </div>
                                <div className="mt-0.5 text-xs">{movementLabel(p, dsold, dead, t)}</div>
                              </div>
                            </div>
                            {can.manage && (
                              <div className="mt-3 flex gap-2">
                                {p.trackSerial ? (
                                  <Link href={`/phones?product=${p._id}`} className="flex-1">
                                    <Button size="sm" variant="outline" className="w-full" icon={<Smartphone className="h-4 w-4" />}>IMEIs</Button>
                                  </Link>
                                ) : (
                                  <Button size="sm" variant="outline" className="flex-1" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setAdjusting(p)}>Stock</Button>
                                )}
                                <Button size="sm" variant="outline" className="flex-1" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(p)}>Edit</Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {visible.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-3 text-sm">
                <span className="font-medium text-slate-700">
                  {t("Showing {a}–{b} of {n} products", { a: (page - 1) * pageSize + 1, b: Math.min(page * pageSize, visible.length), n: visible.length })}
                  {visible.length !== (products?.length ?? 0) && <span className="font-normal text-slate-400"> {t("(filtered from {n})", { n: products?.length ?? 0 })}</span>}
                </span>
                <div className="flex flex-wrap items-center gap-4 text-slate-500">
                  <label className="flex items-center gap-1.5">
                    {t("Per page")}
                    <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} className="h-9 w-24">
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value={String(ALL_PAGE_SIZE)}>{t("All")}</option>
                    </Select>
                  </label>
                  {pageCount > 1 && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" icon={<ChevronLeft className="h-4 w-4" />} disabled={page <= 1} onClick={() => setPage((pg) => Math.max(1, pg - 1))}>Prev</Button>
                      <span className="tabular-nums text-slate-600">{t("Page {a} / {b}", { a: page, b: pageCount })}</span>
                      <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((pg) => Math.min(pageCount, pg + 1))}>{t("Next")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <PriceHistoryModal productId={historyOf} onClose={() => setHistoryOf(null)} />
      <StockHistoryModal productId={stockOf} onClose={() => setStockOf(null)} />
      <BulkPriceModal
        open={bulkOpen}
        categories={categories}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          load();
        }}
      />

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
  const t = useT();
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
        title: t("Replace the barcode?"),
        message: t("Labels already stuck on this item will stop working with the new barcode."),
        tone: "warning",
        details: [{ label: t("Current barcode"), value: form.barcode }],
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
      toast.success(product ? t("Product updated") : t("Product added"));
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
          <Input autoFocus required value={form.name} onChange={set("name")} placeholder={t("e.g. Sugar, Dairy Milk 50g, Bread Large")} />
        </Field>
        <Field label="Name in Urdu (optional)">
          <Input value={form.nameUrdu} onChange={set("nameUrdu")} dir="rtl" className="urdu" placeholder="چینی" />
        </Field>
        <Field label="Category">
          <Select value={form.category} onChange={set("category")}>
            <option value="">{t("No category")}</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <PhotoPicker current={image === undefined ? (product?.hasImage ? `/api/products/${product._id}/image?v=${encodeURIComponent(product.updatedAt ?? "")}` : null) : image || null} onChange={setImage} />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={favourite} onChange={(e) => setFavourite(e.target.checked)} className="h-4 w-4 accent-brand-600" aria-label="Favourite" />
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {t("Favourite — show first on the sale screen")}
          </label>
        </div>
        <Field label="Brand (optional)">
          <Input value={form.brand} onChange={set("brand")} placeholder={phonesOn ? t("e.g. Samsung, Anker, Faster, Audionic") : t("e.g. Nestlé, Shan")} maxLength={60} aria-label="Brand" />
        </Field>
        {phonesOn && (
          <Field label="Fits phone models (accessories)" hint="Covers, protectors, batteries, chargers: searching a model finds this item">
            <Input value={form.fits} onChange={set("fits")} placeholder={t("e.g. Samsung A54, A55 · iPhone 13, 14")} maxLength={300} aria-label="Fits phone models" />
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
                title={t("Create a new barcode")}
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
        <Field label="Sale price (you sell at) *" hint={form.salePrice && form.costPrice ? t("Profit per {unit}: {amount}", { unit: UNIT_LABELS[form.unit], amount: formatPKR(margin) }) : undefined} error={margin < 0 ? t("Sale price is less than cost price") : undefined}>
          <Input required type="number" inputMode="decimal" step="any" min="0" value={form.salePrice} onChange={set("salePrice")} placeholder="0" />
        </Field>
        <Field label="Wholesale price (optional)" hint={'For customers marked "wholesale". Empty = same as sale price.'}>
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
                <span className="block font-semibold text-slate-800">{t("Track each piece by IMEI / serial number")}</span>
                <span className="text-sm text-slate-500">{t("For mobile phones and tablets. Every phone is bought, sold, returned and moved by its IMEI, and the IMEI prints on the bill. After saving, add phones from Phones → Add phones or from a purchase.")}</span>
              </span>
            </label>
            {trackSerial && (
              <Field label="Warranty (months)" hint="Printed on the bill with the end date. Empty = no warranty.">
                <Input type="number" inputMode="numeric" min="0" max="120" value={form.warrantyMonths} onChange={set("warrantyMonths")} placeholder={t("e.g. {n}", { n: 12 })} aria-label="Warranty months" />
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
            <span className="block font-semibold text-slate-800">{t("Track expiry by batch")}</span>
            <span className="text-sm text-slate-500">{t("Each delivery keeps its own expiry date; bills sell the earliest expiry first. For dairy, bakery, medicines, snacks.")}</span>
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
          <Field label="FBR PCT code" hint={t("Empty = shop default ({code})", { code: settings.fbrDefaultPct || "11001010" })}>
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
  const t = useT();
  const update = (i: number, patch: Partial<PackRow>) => onChange(packs.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  return (
    <div className="rounded-2xl border border-slate-200 p-4 sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">{t("Packs / cartons (optional)")}</div>
          <div className="text-xs text-slate-500">{t("Also sell this item as a carton, dozen or box. Stock is always counted in {unit}.", { unit })}</div>
        </div>
        {packs.length < 5 && (
          <Button type="button" size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...packs, { name: packs.length ? "" : "Carton", size: "", price: "", wholesalePrice: "", barcode: "" }])}>
            Add pack
          </Button>
        )}
      </div>
      {packs.map((k, i) => (
        <div key={i} className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1fr_0.8fr_1fr_1fr_1.3fr_auto]">
          <Input value={k.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={t("Carton")} aria-label="Pack name" className="h-10" />
          <Input type="number" inputMode="decimal" min="0" step="any" value={k.size} onChange={(e) => update(i, { size: e.target.value })} placeholder={t("{unit} in it", { unit })} aria-label="Units in pack" className="h-10" />
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={k.price}
            onChange={(e) => update(i, { price: e.target.value })}
            placeholder={unitPrice && Number(k.size) ? String(Math.round(unitPrice * Number(k.size))) : t("Price")}
            aria-label="Pack price"
            className="h-10"
          />
          <Input type="number" inputMode="decimal" min="0" step="any" value={k.wholesalePrice} onChange={(e) => update(i, { wholesalePrice: e.target.value })} placeholder={t("Wholesale")} aria-label="Pack wholesale price" className="h-10" />
          <Input value={k.barcode} onChange={(e) => update(i, { barcode: e.target.value })} placeholder={t("Carton barcode")} aria-label="Pack barcode" className="h-10" />
          <Button type="button" size="sm" variant="ghost" className="hover:text-rose-600" aria-label="Remove pack" icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange(packs.filter((_, j) => j !== i))} />
        </div>
      ))}
      {packs.length > 0 && <p className="mt-2 text-xs text-slate-500">{t("Empty price = units × sale price. Scanning the carton barcode at the counter adds one carton.")}</p>}
    </div>
  );
}

function StockModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const t = useT();
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
      toast.success(t("Stock updated"));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("Stock: {name}", { name: product.name })} size="sm">
      <form onSubmit={save} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <div className="text-sm text-slate-500">{detail && detail.byBranch.length > 1 ? t("Current stock in {branch}", { branch: branch?.name ?? "" }) : t("Current stock")}</div>
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
              {t(l)}
            </button>
          ))}
        </div>
        <Field label={mode === "set" ? "Actual count in shop" : "Quantity"}>
          <Input autoFocus required type="number" inputMode="decimal" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="h-12 text-xl font-bold" />
        </Field>
        {product.trackExpiry && after > here && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry of this stock" hint={product.shelfLifeDays ? t("Empty = {n} days from today", { n: product.shelfLifeDays }) : undefined}>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Batch expiry" />
            </Field>
            <Field label="Batch no. (optional)">
              <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} maxLength={40} />
            </Field>
          </div>
        )}
        {product.trackExpiry && after < here && <p className="text-xs text-slate-500">{t("Taken from the lot that expires first.")}</p>}
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. Damaged packets, monthly stock count")} className="min-h-[60px]" />
        </Field>
        <p className="text-center text-sm text-slate-500">
          {t("New stock will be")} <b className="text-slate-900">{formatQty(after)} {UNIT_LABELS[product.unit]}</b>
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
  const t = useT();
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
      title: t('Delete category "{name}"?', { name: c.name }),
      message: t("Products in this category are kept; they will just have no category."),
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
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("New category name")} />
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
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <label className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-brand-400" title={t("Photo for the sale screen")}>
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
          {t("Remove photo")}
        </button>
      )}
    </div>
  );
}
