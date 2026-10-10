"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  BookOpen,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  CreditCard,
  HandCoins,
  Landmark,
  Minus,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Badge, Button, Field, Input, Modal, Segmented, Spinner, cn } from "@/components/ui";
import { CustomerPicker, type PartyLite } from "@/components/customer-picker";
import { CameraButton, CameraScanner, beep, useBarcodeScanner } from "@/components/barcode-scanner";
import { useCan, useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { ReceivePaymentModal } from "@/components/receive-payment";
import { api, LOOSE_UNITS, NetworkError, UNIT_LABELS } from "@/lib/client";
import {
  addToOutbox,
  cache,
  getOutbox,
  newClientId,
  onOutboxChange,
  printOfflineReceipt,
  removeFromOutbox,
  retryOutbox,
  syncOutbox,
  type OutboxBill,
} from "@/lib/offline";
import { formatPKR, formatQty, round2 } from "@/lib/money";

type Product = {
  _id: string;
  name: string;
  nameUrdu?: string;
  barcode?: string;
  sku?: string;
  unit: string;
  salePrice: number;
  stock: number;
  category?: { _id: string; name: string } | null;
};
type Category = { _id: string; name: string };
type CartItem = { product: Product; qty: number; price: number; discount: number };

const METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "jazzcash", label: "JazzCash", icon: Smartphone },
  { value: "easypaisa", label: "Easypaisa", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "bank", label: "Bank", icon: Landmark },
  { value: "credit", label: "Udhaar", icon: BookOpen },
] as const;

export default function PosPage() {
  const toast = useToast();
  const { settings, user, branch } = useSession();
  const can = useCan();
  const searchRef = useRef<HTMLInputElement>(null);
  const tenantId = user.tenantId ?? "";
  const productsKey = `${tenantId}:${branch?._id ?? ""}:products`;
  const [usingSaved, setUsingSaved] = useState(false);
  const [offlineDone, setOfflineDone] = useState<OutboxBill | null>(null);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [outbox, setOutbox] = useState<OutboxBill[]>([]);
  useEffect(() => {
    const refresh = () => setOutbox(getOutbox(tenantId));
    refresh();
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("outbox") === "1") setOutboxOpen(true);
    return onOutboxChange(refresh);
  }, [tenantId]);

  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<PartyLite | null>(null);
  const [billDiscount, setBillDiscount] = useState("");
  const [pickCustomer, setPickCustomer] = useState(false);
  const [looseFor, setLooseFor] = useState<Product | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [done, setDone] = useState<{ _id: string; invoiceNo: string; total: number; change: number } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const loadProducts = useCallback(() => {
    api<Product[]>("/api/products?limit=5000")
      .then((list) => {
        setProducts(list);
        setUsingSaved(false);
        cache.set(productsKey, list);
      })
      .catch((e) => {
        // Offline: bill from the product list saved on this device.
        const saved = cache.get<Product[] | null>(productsKey, null);
        if (e instanceof NetworkError && saved) {
          setProducts(saved);
          setUsingSaved(true);
        } else toast.error(e.message);
      });
  }, [toast, productsKey]);

  useEffect(() => {
    loadProducts();
    api<Category[]>("/api/categories")
      .then((c) => {
        setCategories(c);
        cache.set(`${tenantId}:categories`, c);
      })
      .catch(() => setCategories(cache.get<Category[]>(`${tenantId}:categories`, [])));
  }, [loadProducts, tenantId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F8") {
        e.preventDefault();
        setReceiveOpen(true);
      }
      if (e.key === "F9" && cart.length) {
        e.preventDefault();
        setPayOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category?._id !== cat) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.nameUrdu?.includes(term) || p.barcode === term || p.sku?.toLowerCase() === term;
    });
  }, [products, q, cat]);

  function addToCart(p: Product, qty = 1) {
    setCart((c) => {
      const existing = c.find((i) => i.product._id === p._id);
      if (existing) return c.map((i) => (i.product._id === p._id ? { ...i, qty: round2(i.qty + qty) } : i));
      return [...c, { product: p, qty, price: p.salePrice, discount: 0 }];
    });
  }

  function onPick(p: Product) {
    if (LOOSE_UNITS.has(p.unit)) setLooseFor(p);
    else addToCart(p);
  }

  /** A barcode from a USB scanner or the camera: add the matching product to the bill. */
  function addByCode(raw: string) {
    const code = raw.trim();
    if (!products || !code) return;
    const p = products.find((x) => x.barcode === code || (x.sku && x.sku.toLowerCase() === code.toLowerCase()));
    if (p) {
      onPick(p);
      setQ("");
    } else {
      toast.error(`No product has barcode ${code}. Add it in Products first.`);
    }
  }
  // Scanner works anywhere on this screen, except while a pop-up window is open.
  useBarcodeScanner(addByCode, !payOpen && !looseFor && !pickCustomer && !done && !offlineDone && !cameraOpen && !receiveOpen);

  function onSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const term = q.trim();
    if (!term || !products) return;
    const exact = products.find((p) => p.barcode === term || p.sku?.toLowerCase() === term.toLowerCase());
    const pick = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (pick) {
      if (exact) beep();
      onPick(pick);
      setQ("");
    } else if (filtered.length === 0) {
      toast.error(`No product found for "${term}"`);
    }
  }

  const updateItem = (id: string, patch: Partial<CartItem>) =>
    setCart((c) => c.map((i) => (i.product._id === id ? { ...i, ...patch } : i)));
  const removeItem = (id: string) => setCart((c) => c.filter((i) => i.product._id !== id));

  const subtotal = round2(cart.reduce((s, i) => s + round2(i.qty * i.price) - i.discount, 0));
  const discount = Math.min(Number(billDiscount) || 0, subtotal);
  const afterDiscount = round2(subtotal - discount);
  const taxRate = settings?.taxEnabled ? settings.taxRate : 0;
  const inclusive = settings?.pricesIncludeTax ?? true;
  const tax = taxRate ? round2(inclusive ? (afterDiscount * taxRate) / (100 + taxRate) : (afterDiscount * taxRate) / 100) : 0;
  const total = inclusive ? afterDiscount : round2(afterDiscount + tax);
  const itemCount = cart.length;

  function resetBill() {
    setCart([]);
    setCustomer(null);
    setBillDiscount("");
    setQ("");
    searchRef.current?.focus();
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-var(--banner-h,0px))] lg:flex-row">
      {/* Products */}
      <section className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:overflow-hidden">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Bill <span className="urdu ml-2 text-base text-slate-400">نیا بل</span></h1>
            <p className="hidden text-xs text-slate-500 sm:block">Tip: scan a barcode or type and press Enter · F2 = search · F9 = pay · F8 = receive udhaar</p>
          </div>
          <div className="flex items-center gap-2">
            {usingSaved && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                <CloudOff className="h-4 w-4" /> Offline mode
              </span>
            )}
            {outbox.length > 0 && (
              <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setOutboxOpen(true)}>
                {outbox.length} waiting
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<HandCoins className="h-4 w-4 text-brand-600" />} onClick={() => setReceiveOpen(true)} title="Customer pays old udhaar (F8)">
              <span className="hidden sm:inline">Receive udhaar</span>
              <span className="sm:hidden">Udhaar</span>
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
          <ScanBarcode className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchEnter}
            placeholder="Scan barcode or search product…"
            className="h-14 pl-12 text-lg"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Clear search">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
          <div className="[&>button]:h-14 [&>button]:w-14">
            <CameraButton onClick={() => setCameraOpen(true)} />
          </div>
        </div>

        <div className="scrollbar-thin -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <CatChip active={!cat} onClick={() => setCat("")}>All</CatChip>
          {categories.map((c) => (
            <CatChip key={c._id} active={cat === c._id} onClick={() => setCat(c._id)}>
              {c.name}
            </CatChip>
          ))}
        </div>

        <div className="scrollbar-thin mt-4 flex-1 overflow-y-auto">
          {!products ? (
            <Spinner />
          ) : products.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
              <p className="font-semibold text-slate-700">No products yet</p>
              <p className="mt-1 text-sm text-slate-500">Add your items first, then you can make bills.</p>
              {can.manage && (
                <Link href="/products" className="mt-4 inline-block">
                  <Button>Add products</Button>
                </Link>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-slate-500">No matching products.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.slice(0, 200).map((p) => {
                const inCart = cart.find((i) => i.product._id === p._id);
                return (
                  <button
                    key={p._id}
                    onClick={() => onPick(p)}
                    className={cn(
                      "relative flex flex-col rounded-2xl border bg-white p-3.5 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md active:translate-y-0",
                      inCart ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200",
                    )}
                  >
                    {inCart && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                        {formatQty(inCart.qty)}
                      </span>
                    )}
                    <span className="line-clamp-2 min-h-10 font-semibold leading-tight text-slate-800">{p.name}</span>
                    {p.nameUrdu && <span className="urdu truncate text-xs text-slate-400">{p.nameUrdu}</span>}
                    <span className="mt-2 text-lg font-bold text-brand-700">
                      {formatPKR(p.salePrice)}
                      <span className="text-xs font-medium text-slate-400">/{UNIT_LABELS[p.unit]}</span>
                    </span>
                    <span className={cn("text-xs font-medium", p.stock <= 0 ? "text-rose-600" : "text-slate-500")}>
                      Stock: {formatQty(p.stock)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Cart */}
      <aside className="flex w-full flex-col border-t border-slate-200 bg-white lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <ShoppingCart className="h-5 w-5 text-brand-600" /> Bill items
            {itemCount > 0 && <Badge color="green">{itemCount}</Badge>}
          </h2>
          {cart.length > 0 && (
            <button onClick={resetBill} className="text-sm font-semibold text-rose-600 hover:text-rose-700">
              Clear all
            </button>
          )}
        </div>

        <button
          onClick={() => setPickCustomer(true)}
          className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50/40"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{customer ? customer.name : "Walk-in customer"}</div>
            <div className="text-xs text-slate-500">
              {customer ? (customer.balance > 0 ? `Old udhaar: ${formatPKR(customer.balance)}` : "No old udhaar") : "Tap to choose a customer (needed for udhaar)"}
            </div>
          </div>
          {customer && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setCustomer(null);
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </button>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-3 lg:min-h-0">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center text-slate-400">
              <Search className="mb-3 h-10 w-10" />
              <p className="text-sm">Tap a product or scan a barcode to add it to the bill.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {cart.map((item) => {
                const loose = LOOSE_UNITS.has(item.product.unit);
                const line = round2(item.qty * item.price - item.discount);
                return (
                  <li key={item.product._id} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-800">{item.product.name}</div>
                        <div className="text-xs text-slate-500">
                          {formatPKR(item.price)} / {UNIT_LABELS[item.product.unit]}
                        </div>
                      </div>
                      <button onClick={() => removeItem(item.product._id)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                        <button
                          className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-brand-700"
                          onClick={() => (item.qty <= (loose ? 0.25 : 1) ? removeItem(item.product._id) : updateItem(item.product._id, { qty: round2(item.qty - (loose ? 0.25 : 1)) }))}
                          aria-label="Decrease"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.qty}
                          onChange={(e) => updateItem(item.product._id, { qty: Math.max(0, Number(e.target.value)) })}
                          className="h-9 w-16 border-x border-slate-200 text-center font-semibold focus:outline-hidden"
                        />
                        <button
                          className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-brand-700"
                          onClick={() => updateItem(item.product._id, { qty: round2(item.qty + (loose ? 0.25 : 1)) })}
                          aria-label="Increase"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      {can.manage && (
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={item.price}
                          onChange={(e) => updateItem(item.product._id, { price: Math.max(0, Number(e.target.value)) })}
                          title="Price (owner/manager can change)"
                          className="h-9 w-20 rounded-xl border border-slate-200 px-2 text-right text-sm focus:border-brand-500 focus:outline-hidden"
                        />
                      )}
                      <span className="min-w-[80px] text-right font-bold text-slate-900">{formatPKR(line)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white px-5 py-4">
          <div className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatPKR(subtotal)} />
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Discount</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={billDiscount}
                onChange={(e) => setBillDiscount(e.target.value)}
                placeholder="0"
                className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-right focus:border-brand-500 focus:outline-hidden"
              />
            </div>
            {taxRate > 0 && <Row label={`Sales tax ${taxRate}%${inclusive ? " (included)" : ""}`} value={formatPKR(tax)} />}
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-dashed border-slate-200 pt-3">
            <span className="text-base font-semibold text-slate-600">Total</span>
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">{formatPKR(total)}</span>
          </div>
          <Button size="xl" className="mt-4 w-full" disabled={!cart.length || cart.some((i) => i.qty <= 0)} onClick={() => setPayOpen(true)}>
            Take Payment
          </Button>
        </div>
      </aside>

      <LooseQtyModal
        product={looseFor}
        onClose={() => setLooseFor(null)}
        onAdd={(qty) => {
          if (looseFor) addToCart(looseFor, qty);
          setLooseFor(null);
          searchRef.current?.focus();
        }}
      />

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={total}
        customer={customer}
        onChooseCustomer={() => setPickCustomer(true)}
        payload={{
          items: cart.map((i) => ({ productId: i.product._id, qty: i.qty, price: i.price, discount: i.discount })),
          discount,
          customerId: customer?._id,
        }}
        onDone={(sale) => {
          setPayOpen(false);
          setDone(sale);
          resetBill();
          loadProducts();
        }}
        onOffline={(bill) => {
          const full: OutboxBill = {
            ...bill,
            branchId: branch?._id,
            branchName: branch?.name,
            customerName: customer?.name,
            lines: cart.map((i) => ({ name: i.product.name, qty: i.qty, unit: UNIT_LABELS[i.product.unit], price: i.price, total: round2(i.qty * i.price - i.discount) })),
          };
          addToOutbox(tenantId, full);
          // Show the reduced stock on this device until the bill reaches the server.
          if (products) {
            const sold = new Map(cart.map((i) => [i.product._id, i.qty]));
            const next = products.map((p) => (sold.has(p._id) ? { ...p, stock: round2(p.stock - sold.get(p._id)!) } : p));
            setProducts(next);
            cache.set(productsKey, next);
          }
          setPayOpen(false);
          setOfflineDone(full);
          resetBill();
        }}
      />

      <CustomerPicker
        open={pickCustomer}
        onClose={() => setPickCustomer(false)}
        onPick={(p) => {
          setCustomer(p);
          setPickCustomer(false);
        }}
      />

      <Modal open={!!offlineDone} onClose={() => setOfflineDone(null)} title="Bill saved on this device" size="sm">
        {offlineDone && (
          <div className="text-center">
            <CloudOff className="mx-auto h-14 w-14 text-amber-500" />
            <p className="mt-3 text-sm text-slate-500">No connection right now. The bill is saved on this device and will be sent automatically.</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{formatPKR(offlineDone.total)}</p>
            {offlineDone.change > 0 && (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">Give change back</p>
                <p className="text-3xl font-extrabold text-amber-900">{formatPKR(offlineDone.change)}</p>
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                icon={<Printer className="h-5 w-5" />}
                onClick={() => printOfflineReceipt({ shopName: settings?.shopName ?? "", branchName: offlineDone.branchName, bill: offlineDone, footer: settings?.receiptFooter })}
              >
                Print
              </Button>
              <Button size="lg" onClick={() => setOfflineDone(null)}>
                Next bill
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ReceivePaymentModal open={receiveOpen} onClose={() => setReceiveOpen(false)} />

      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={addByCode} continuous title="Scan items" />

      <OutboxModal open={outboxOpen} onClose={() => setOutboxOpen(false)} tenantId={tenantId} bills={outbox} onSynced={loadProducts} />

      <Modal open={!!done} onClose={() => setDone(null)} title="Bill saved" size="sm">
        {done && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-brand-500" />
            <p className="mt-3 text-sm text-slate-500">{done.invoiceNo}</p>
            <p className="text-3xl font-extrabold text-slate-900">{formatPKR(done.total)}</p>
            {done.change > 0 && (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">Give change back</p>
                <p className="text-3xl font-extrabold text-amber-900">{formatPKR(done.change)}</p>
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" icon={<Printer className="h-5 w-5" />} onClick={() => window.open(`/receipt/${done._id}?print=1`, "_blank")}>
                Print
              </Button>
              <Button size="lg" onClick={() => setDone(null)}>
                Next bill
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
        active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function LooseQtyModal({ product, onClose, onAdd }: { product: Product | null; onClose: () => void; onAdd: (qty: number) => void }) {
  const [mode, setMode] = useState<"qty" | "amount">("qty");
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue("");
    setMode("qty");
  }, [product]);
  if (!product) return null;
  const unit = UNIT_LABELS[product.unit];
  const n = Number(value) || 0;
  const qty = mode === "qty" ? n : product.salePrice > 0 ? Math.round((n / product.salePrice) * 1000) / 1000 : 0;
  const presets = product.unit === "kg" || product.unit === "litre" ? [0.25, 0.5, 1, 2, 5] : [100, 250, 500, 1000];
  const amountPresets = [50, 100, 200, 500, 1000];

  return (
    <Modal open onClose={onClose} title={product.name} size="sm">
      <p className="mb-4 text-sm text-slate-500">
        Price: <b className="text-slate-800">{formatPKR(product.salePrice)}</b> per {unit}
      </p>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setValue("");
        }}
        options={[
          { value: "qty", label: `By ${unit}` },
          { value: "amount", label: "By Rupees" },
        ]}
      />
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (qty > 0) onAdd(qty);
        }}
      >
        <Field label={mode === "qty" ? `How many ${unit}?` : "Customer wants how many rupees of it?"}>
          <Input autoFocus type="number" inputMode="decimal" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} className="h-14 text-2xl font-bold" />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          {(mode === "qty" ? presets : amountPresets).map((p) => (
            <button type="button" key={p} onClick={() => setValue(String(p))} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">
              {mode === "qty" ? `${p} ${unit}` : `Rs ${p}`}
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-xl bg-brand-50 p-3 text-center text-sm text-brand-900">
          {formatQty(qty)} {unit} = <b>{formatPKR(round2(qty * product.salePrice))}</b>
        </div>
        <Button type="submit" size="lg" className="mt-4 w-full" disabled={qty <= 0}>
          Add to bill
        </Button>
      </form>
    </Modal>
  );
}

const TENDERS = METHODS.filter((m) => m.value !== "credit");

function PaymentModal({
  open,
  onClose,
  total,
  customer,
  onChooseCustomer,
  payload,
  onDone,
  onOffline,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  customer: PartyLite | null;
  onChooseCustomer: () => void;
  payload: { items: unknown[]; discount: number; customerId?: string };
  onDone: (sale: { _id: string; invoiceNo: string; total: number; change: number }) => void;
  onOffline: (bill: Omit<OutboxBill, "lines">) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"single" | "split">("single");
  const [method, setMethod] = useState<string>("cash");
  const [received, setReceived] = useState("");
  const [ref, setRef] = useState("");
  const [split, setSplit] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // One id per bill, reused if Confirm is pressed again, so a bill can never be saved twice.
  const clientId = useRef(newClientId());

  useEffect(() => {
    if (open) {
      setMode("single");
      setMethod("cash");
      setReceived("");
      setRef("");
      setSplit({});
      clientId.current = newClientId();
    }
  }, [open]);

  // --- single method
  const receivedNum = method === "credit" ? Number(received) || 0 : received === "" ? total : Number(received) || 0;
  // --- split: only cash may be more than what is left (change); other methods must fit in the bill
  const amt = (m: string) => Math.max(0, Number(split[m]) || 0);
  const nonCash = round2(TENDERS.filter((m) => m.value !== "cash").reduce((a, m) => a + amt(m.value), 0));
  const cashGiven = amt("cash");
  const splitTooMuch = nonCash > total + 0.001;
  const splitPaid = round2(Math.min(total, nonCash + cashGiven));

  const paidNow = mode === "split" ? splitPaid : Math.min(total, receivedNum);
  const change = mode === "split" ? round2(Math.max(0, cashGiven - Math.max(0, total - nonCash))) : round2(Math.max(0, receivedNum - total));
  const remaining = round2(Math.max(0, total - paidNow));
  const quick = Array.from(new Set([total, ...[500, 1000, 5000].filter((n) => n > total), Math.ceil(total / 100) * 100])).sort((a, b) => a - b).slice(0, 4);
  const usedMethods = TENDERS.filter((m) => amt(m.value) > 0);

  function fillRest(m: string) {
    const others = round2(TENDERS.filter((t) => t.value !== m).reduce((a, t) => a + amt(t.value), 0));
    setSplit({ ...split, [m]: String(round2(Math.max(0, total - others))) });
  }

  async function confirm() {
    setSaving(true);
    const body =
      mode === "split"
        ? usedMethods.length
          ? { ...payload, payments: usedMethods.map((m) => ({ method: m.value, amount: amt(m.value) })), clientId: clientId.current }
          : { ...payload, paymentMethod: "credit", amountPaid: 0, clientId: clientId.current }
        : { ...payload, paymentMethod: method, amountPaid: receivedNum, ...(ref.trim() && method !== "cash" && method !== "credit" ? { paymentRef: ref.trim() } : {}), clientId: clientId.current };
    try {
      const sale = await api<{ _id: string; invoiceNo: string; total: number; change: number }>("/api/sales", { body });
      onDone(sale);
    } catch (err) {
      if (err instanceof NetworkError) {
        onOffline({ clientId: clientId.current, soldAt: new Date().toISOString(), payload: body, total, change, status: "pending" });
      } else toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Take payment" size="md">
      <div className="mb-4 rounded-2xl bg-slate-900 p-5 text-center text-white">
        <div className="text-sm text-slate-300">Total to pay</div>
        <div className="text-4xl font-extrabold tracking-tight">{formatPKR(total)}</div>
      </div>

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "single", label: "One method" },
          { value: "split", label: "Split payment" },
        ]}
      />

      {mode === "single" ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  setMethod(m.value);
                  setReceived("");
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-sm font-semibold transition",
                  method === m.value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                <m.icon className="h-5 w-5" />
                {m.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <Field label={method === "credit" ? "Paid now (optional)" : "Amount received"} hint={method === "cash" ? "Leave empty if customer gives exact amount" : undefined}>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={method === "credit" ? "0" : String(total)}
                className="h-14 text-2xl font-bold"
              />
            </Field>
            {method === "cash" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {quick.map((n) => (
                  <button key={n} onClick={() => setReceived(String(n))} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                    {formatPKR(n)}
                  </button>
                ))}
              </div>
            )}
            {method !== "cash" && method !== "credit" && (
              <Field label="Transaction ID (optional)" className="mt-3" hint="From the customer's JazzCash / Easypaisa / bank message or card slip">
                <Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} aria-label="Transaction ID" />
              </Field>
            )}
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-2">
          {TENDERS.map((m) => (
            <div key={m.value} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", amt(m.value) > 0 ? "border-brand-300 bg-brand-50/50" : "border-slate-200")}>
              <m.icon className="h-5 w-5 shrink-0 text-slate-500" />
              <span className="w-24 shrink-0 text-sm font-semibold text-slate-700">{m.label}</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={split[m.value] ?? ""}
                onChange={(e) => setSplit({ ...split, [m.value]: e.target.value })}
                placeholder="0"
                aria-label={`${m.label} amount`}
                className="h-11 min-w-0 flex-1 text-lg font-bold"
              />
              <button type="button" onClick={() => fillRest(m.value)} className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                Rest
              </button>
            </div>
          ))}
          <div className="flex justify-between px-1 pt-1 text-sm">
            <span className="text-slate-500">Paid</span>
            <b className="text-slate-900">{formatPKR(nonCash + cashGiven)}</b>
          </div>
          {splitTooMuch && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              JazzCash / Easypaisa / card / bank add up to more than the bill. Only cash can be more (change is given back).
            </p>
          )}
        </div>
      )}

      {change > 0 && !splitTooMuch && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
          <span className="font-semibold text-amber-800">Change to return</span>
          <span className="text-2xl font-extrabold text-amber-900">{formatPKR(change)}</span>
        </div>
      )}
      {remaining > 0 && !splitTooMuch && (
        <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sky-800">Goes to udhaar</span>
            <span className="text-2xl font-extrabold text-sky-900">{formatPKR(remaining)}</span>
          </div>
          {customer ? (
            <p className="mt-1 text-xs text-sky-700">Will be added to {customer.name}&apos;s khata.</p>
          ) : (
            <button onClick={onChooseCustomer} className="mt-2 text-sm font-semibold text-sky-700 underline">
              Choose a customer for udhaar
            </button>
          )}
        </div>
      )}

      <Button
        size="xl"
        className="mt-6 w-full"
        loading={saving}
        disabled={(remaining > 0 && !customer) || splitTooMuch || (mode === "split" && !usedMethods.length && !customer)}
        onClick={confirm}
        icon={<CheckCircle2 className="h-6 w-6" />}
      >
        Confirm & Save Bill
      </Button>
    </Modal>
  );
}

function OutboxModal({ open, onClose, tenantId, bills, onSynced }: { open: boolean; onClose: () => void; tenantId: string; bills: OutboxBill[]; onSynced: () => void }) {
  const toast = useToast();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  async function sendNow() {
    setBusy(true);
    const r = await syncOutbox(tenantId);
    setBusy(false);
    if (r.offline) toast.error("Still no connection. Bills will be sent automatically when it is back.");
    else if (r.sent) {
      toast.success(`${r.sent} bill(s) sent`);
      onSynced();
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Bills waiting to be sent" size="md">
      {bills.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">All bills have been sent.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {bills.map((b) => (
              <li key={b.clientId} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">
                      {formatPKR(b.total)} <span className="text-xs font-normal text-slate-400">· {new Date(b.soldAt).toLocaleString("en-PK")}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {b.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")}
                      {b.customerName && ` · ${b.customerName}`}
                    </div>
                    {b.status === "failed" && <div className="mt-1 text-xs font-medium text-rose-600">Not saved: {b.error}</div>}
                  </div>
                  {b.status === "failed" ? (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" onClick={() => retryOutbox(tenantId, b.clientId)}>Retry</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="hover:text-rose-600"
                        onClick={async () => {
                          const ok = await ask({
                            title: "Discard this offline bill?",
                            message: "It was never saved on the server and will be lost.",
                            tone: "danger",
                            icon: "delete",
                            details: [
                              { label: "Made at", value: new Date(b.soldAt).toLocaleString("en-PK") },
                              { label: "Reason not saved", value: b.error ?? "—" },
                              { label: "Amount", value: formatPKR(b.total), strong: true },
                            ],
                            confirmLabel: "Discard bill",
                          });
                          if (ok) removeFromOutbox(tenantId, b.clientId);
                        }}
                      >
                        Discard
                      </Button>
                    </div>
                  ) : (
                    <Badge color="amber">Waiting</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full" loading={busy} icon={<RefreshCw className="h-4 w-4" />} onClick={sendNow}>
            Send now
          </Button>
        </>
      )}
    </Modal>
  );
}
