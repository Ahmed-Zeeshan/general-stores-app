"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  CreditCard,
  HandCoins,
  Landmark,
  Minus,
  PauseCircle,
  Plus,
  PlayCircle,
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
import { useLang, useT } from "@/lib/i18n";
import { ReceivePaymentModal } from "@/components/receive-payment";
import { DevicePicker, DeviceTags, type DeviceRow } from "@/components/devices";
import { InstallmentSaleModal } from "@/components/installments";
import { cleanImei } from "@/lib/imei";
import { api, formatDate, LOOSE_UNITS, NetworkError, UNIT_LABELS } from "@/lib/client";
import {
  addToOutbox,
  cache,
  getHeld,
  getOutbox,
  MAX_HELD,
  newClientId,
  onHeldChange,
  onOutboxChange,
  printOfflineReceipt,
  removeFromOutbox,
  retryOutbox,
  saveHeld,
  syncOutbox,
  type HeldBill,
  type OutboxBill,
} from "@/lib/offline";
import { formatPKR, formatQty, round2 } from "@/lib/money";
import { sellPrice, type PackLike } from "@/lib/pricing";
import { applyPromotions, type PromoLike } from "@/lib/promotions";
import { getPrintPrefs, printInFrame, receiptUrl, setPrintPrefs } from "@/lib/print";

type Product = {
  _id: string;
  name: string;
  nameUrdu?: string;
  barcode?: string;
  sku?: string;
  unit: string;
  salePrice: number;
  wholesalePrice?: number;
  packs?: PackLike[];
  stock: number;
  trackSerial?: boolean;
  warrantyMonths?: number;
  category?: { _id: string; name: string } | null;
};
type Category = { _id: string; name: string };
/** One bill line. `qty` counts packs when `pack` is set; `custom` = price changed by hand; `device` = the phone sold (IMEI). */
type CartItem = { key: string; product: Product; qty: number; price: number; discount: number; pack?: PackLike | null; custom?: boolean; device?: DeviceRow };
const lineKey = (p: Product, pack?: PackLike | null) => (pack ? `${p._id}:${pack.name}` : p._id);
type Held = HeldBill<CartItem, PartyLite>;

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
  const t = useT();
  const { lang } = useLang();
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
  const [phoneFor, setPhoneFor] = useState<Product | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [qistOpen, setQistOpen] = useState(false);
  const [qistDone, setQistDone] = useState<{ planId: string; planNo: string; invoiceNo: string; financed: number; months: number; perMonth: number; firstDue: string } | null>(null);
  const [done, setDone] = useState<{ _id: string; invoiceNo: string; total: number; change: number; creditAmount?: number; printed?: boolean } | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  useEffect(() => setAutoPrint(getPrintPrefs().auto), []);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ shift: unknown }>("/api/shifts/current")
      .then((r) => setDrawerOpen(!!r.shift))
      .catch(() => setDrawerOpen(null));
  }, [branch?._id]);
  const ask = useConfirm();
  // Latest "hold" action for the keyboard shortcut.
  const holdRef = useRef<() => void>(() => {});
  const [held, setHeld] = useState<Held[]>([]);
  const branchId = branch?._id ?? "";
  useEffect(() => {
    if (!tenantId) return;
    const refresh = () => setHeld(getHeld<CartItem, PartyLite>(tenantId, branchId));
    refresh();
    return onHeldChange(refresh);
  }, [tenantId, branchId]);

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

  const [promos, setPromos] = useState<PromoLike[]>([]);
  const [usePoints, setUsePoints] = useState(false);
  // A different customer starts without points applied.
  useEffect(() => setUsePoints(false), [customer?._id]);
  useEffect(() => {
    // Offers are applied on the server too; here they show the customer the same total. Saved for offline use.
    api<PromoLike[]>("/api/promotions")
      .then((list) => {
        setPromos(list);
        cache.set(`${tenantId}:promotions`, list);
      })
      .catch(() => setPromos(cache.get<PromoLike[]>(`${tenantId}:promotions`, [])));
  }, [tenantId]);

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
      if (e.key === "F4") {
        e.preventDefault();
        holdRef.current();
      }
      if (e.key === "F6") {
        e.preventDefault();
        setHeldOpen(true);
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
      return p.name.toLowerCase().includes(term) || p.nameUrdu?.includes(term) || p.barcode === term || p.sku?.toLowerCase() === term || !!p.packs?.some((k) => k.barcode === term);
    });
  }, [products, q, cat]);

  const wholesale = customer?.priceLevel === "wholesale";
  function addToCart(p: Product, qty = 1, pack: PackLike | null = null) {
    const key = lineKey(p, pack);
    setCart((c) => {
      const existing = c.find((i) => i.key === key);
      if (existing) return c.map((i) => (i.key === key ? { ...i, qty: round2(i.qty + qty) } : i));
      return [...c, { key, product: p, qty, price: sellPrice(p, pack, wholesale), discount: 0, pack }];
    });
  }
  // A wholesale customer gets wholesale prices (lines whose price was typed by hand stay as they are).
  useEffect(() => {
    setCart((c) => c.map((i) => (i.custom || i.device?.price ? i : { ...i, price: sellPrice(i.product, i.pack, wholesale) })));
  }, [wholesale]);

  /** Switch a line between the loose unit and a pack size (merging with an existing line). */
  function changeUnit(item: CartItem, packName: string) {
    const pack = item.product.packs?.find((k) => k.name === packName) ?? null;
    const key = lineKey(item.product, pack);
    if (key === item.key) return;
    setCart((c) => {
      const other = c.find((i) => i.key === key);
      if (other) return c.filter((i) => i.key !== item.key).map((i) => (i.key === key ? { ...i, qty: round2(i.qty + item.qty) } : i));
      return c.map((i) => (i.key === item.key ? { ...i, key, pack, custom: false, price: sellPrice(i.product, pack, wholesale) } : i));
    });
  }

  /** Product or pack with this barcode / SKU. */
  function findByCode(code: string): { p: Product; pack: PackLike | null } | null {
    for (const p of products ?? []) {
      if (p.barcode === code || (p.sku && p.sku.toLowerCase() === code.toLowerCase())) return { p, pack: null };
      const pack = p.packs?.find((k) => k.barcode === code);
      if (pack) return { p, pack };
    }
    return null;
  }

  /** A phone chosen by IMEI: one line per phone. */
  function addPhone(p: Product, d: DeviceRow) {
    const key = `dev:${d._id}`;
    if (cart.some((i) => i.key === key)) {
      toast.error(`IMEI ${d.imei} is already on this bill.`);
      return;
    }
    beep();
    setCart((c) => [...c, { key, product: p, qty: 1, price: d.price ?? sellPrice(p, null, wholesale), discount: 0, device: d }]);
  }

  function onPick(p: Product) {
    if (p.trackSerial) setPhoneFor(p);
    else if (LOOSE_UNITS.has(p.unit)) setLooseFor(p);
    else addToCart(p);
  }

  /** A scanned code that is not a product barcode may be a phone's IMEI. */
  async function addByImei(code: string) {
    const imei = cleanImei(code);
    if (imei.length < 8) return false;
    try {
      const found = await api<DeviceRow[]>(`/api/devices?q=${encodeURIComponent(imei)}`);
      const d = found.find((x) => x.imei === imei || x.imei2 === imei);
      const p = d && products?.find((x) => x._id === d.product);
      if (d && p) {
        addPhone(p, d);
        return true;
      }
    } catch {
      /* offline: not a phone we can check */
    }
    return false;
  }

  /** A barcode from a USB scanner or the camera: add the matching product to the bill. */
  function addByCode(raw: string) {
    const code = raw.trim();
    if (!products || !code) return;
    const hit = findByCode(code);
    if (hit) {
      if (hit.pack) addToCart(hit.p, 1, hit.pack);
      else onPick(hit.p);
      setQ("");
    } else {
      addByImei(code).then((found) => {
        if (found) setQ("");
        else toast.error(`No product has barcode ${code}, and no phone in stock here has this IMEI.`);
      });
    }
  }
  // Scanner works anywhere on this screen, except while a pop-up window is open.
  useBarcodeScanner(addByCode, !payOpen && !looseFor && !phoneFor && !pickCustomer && !done && !offlineDone && !cameraOpen && !receiveOpen && !heldOpen);

  function onSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const term = q.trim();
    if (!term || !products) return;
    const exact = findByCode(term);
    if (exact?.pack) {
      beep();
      addToCart(exact.p, 1, exact.pack);
      setQ("");
      return;
    }
    const pick = exact?.p ?? (filtered.length === 1 ? filtered[0] : null);
    if (pick) {
      if (exact) beep();
      onPick(pick);
      setQ("");
    } else if (filtered.length === 0) {
      addByImei(term).then((found) => {
        if (found) setQ("");
        else toast.error(`No product found for "${term}"`);
      });
    }
  }

  const updateItem = (key: string, patch: Partial<CartItem>) => setCart((c) => c.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeItem = (key: string) => setCart((c) => c.filter((i) => i.key !== key));

  const offers = useMemo(
    () =>
      applyPromotions(
        cart.map((i) => ({
          productId: i.product._id,
          categoryId: i.product.category?._id ?? null,
          qty: i.pack ? i.qty * i.pack.size : i.qty,
          unitPrice: i.pack ? i.price / i.pack.size : i.price,
          gross: round2(i.qty * i.price),
          manualDiscount: i.discount,
          isPack: !!i.pack,
          customPrice: !!i.custom,
        })),
        promos,
        { wholesale },
      ),
    [cart, promos, wholesale],
  );
  const subtotal = round2(cart.reduce((s, i, idx) => s + round2(i.qty * i.price) - i.discount - (offers.lines[idx]?.discount ?? 0), 0));
  const billOffer = offers.bill ? Math.min(offers.bill.discount, subtotal) : 0;
  const manualDiscount = Math.min(Number(billDiscount) || 0, subtotal);
  // Loyalty points the customer can spend now (same rules as the server).
  const loyalty = settings?.loyaltyEnabled ? { per: settings.loyaltyPointValue ?? 1, min: settings.loyaltyMinRedeem ?? 0 } : null;
  const canRedeem = !!(loyalty && customer && (customer.points ?? 0) >= loyalty.min && (customer.points ?? 0) > 0);
  const pointsLeftRoom = loyalty && loyalty.per > 0 ? Math.floor(Math.max(0, subtotal - Math.min(subtotal, manualDiscount + billOffer)) / loyalty.per) : 0;
  const redeemPoints = usePoints && canRedeem ? Math.min(customer!.points ?? 0, pointsLeftRoom) : 0;
  const pointsValue = loyalty ? round2(redeemPoints * loyalty.per) : 0;
  const discount = Math.min(round2(manualDiscount + billOffer + pointsValue), subtotal);
  const afterDiscount = round2(subtotal - discount);
  const taxRate = settings?.taxEnabled ? settings.taxRate : 0;
  const inclusive = settings?.pricesIncludeTax ?? true;
  const tax = taxRate ? round2(inclusive ? (afterDiscount * taxRate) / (100 + taxRate) : (afterDiscount * taxRate) / 100) : 0;
  const total = inclusive ? afterDiscount : round2(afterDiscount + tax);
  const itemCount = cart.length;

  const billPayload = {
    items: cart.map((i) => ({
      productId: i.product._id,
      qty: i.qty,
      ...(i.custom ? { price: i.price } : {}),
      discount: i.discount,
      ...(i.pack ? { pack: i.pack.name } : {}),
      ...(i.device ? { serials: [i.device._id] } : {}),
    })),
    discount: manualDiscount,
    customerId: customer?._id,
    ...(redeemPoints > 0 ? { redeemPoints } : {}),
  };

  function resetBill() {
    setCart([]);
    setCustomer(null);
    setUsePoints(false);
    setBillDiscount("");
    setQ("");
    searchRef.current?.focus();
  }

  /** Puts the current bill aside (on this device) so the next customer can be served. */
  function holdBill(silent = false) {
    if (!cart.length) return false;
    const list = getHeld<CartItem, PartyLite>(tenantId, branchId);
    if (list.length >= MAX_HELD) {
      toast.error(`You already have ${MAX_HELD} bills on hold. Finish or delete some first.`);
      return false;
    }
    const entry: Held = {
      id: newClientId(),
      at: new Date().toISOString(),
      label: customer?.name ?? `Walk-in · ${new Date().toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" })}`,
      items: cart,
      customer,
      discount: billDiscount,
      total,
      userName: user.name,
    };
    saveHeld(tenantId, branchId, [...list, entry]);
    resetBill();
    if (!silent) toast.success(t('Bill on hold ({amount}). Open it again from "Held bills".', { amount: formatPKR(total) }));
    return true;
  }

  holdRef.current = () => holdBill();

  async function resumeHeld(h: Held) {
    if (cart.length) {
      const ok = await ask({
        title: "Put the current bill on hold?",
        message: `The bill on screen (${formatPKR(total)}) will be held so you can open ${h.label}'s bill.`,
        confirmLabel: "Hold & open",
        tone: "info",
      });
      if (!ok || !holdBill(true)) return;
    }
    // Keep the prices the customer was told; refresh stock and names from the latest product list.
    const latest = new Map((products ?? []).map((p) => [p._id, p]));
    setCart(h.items.map((i) => ({ ...i, key: i.key ?? lineKey(i.product, i.pack), product: latest.get(i.product._id) ?? i.product })));
    setCustomer(h.customer);
    setBillDiscount(h.discount);
    saveHeld(tenantId, branchId, getHeld<CartItem, PartyLite>(tenantId, branchId).filter((x) => x.id !== h.id));
    setHeldOpen(false);
    searchRef.current?.focus();
  }

  async function deleteHeld(h: Held) {
    const ok = await ask({
      title: `Delete ${h.label}'s held bill?`,
      details: [
        { label: "Items", value: h.items.length },
        { label: "Total", value: formatPKR(h.total), strong: true },
      ],
      tone: "danger",
      confirmLabel: "Delete",
      cancelLabel: "Keep",
    });
    if (ok) saveHeld(tenantId, branchId, getHeld<CartItem, PartyLite>(tenantId, branchId).filter((x) => x.id !== h.id));
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-var(--banner-h,0px))] lg:flex-row">
      {/* Products */}
      <section className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:overflow-hidden">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("New Bill")} {lang !== "ur" && <span className="urdu ml-2 text-base text-slate-400">نیا بل</span>}</h1>
            <p className="hidden text-xs text-slate-500 sm:block">{t("Tip: scan a barcode or type and press Enter · F2 search · F9 pay · F4 hold · F6 held bills · F8 receive udhaar")}</p>
          </div>
          <div className="flex items-center gap-2">
            {usingSaved && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                <CloudOff className="h-4 w-4" /> {t("Offline mode")}
              </span>
            )}
            {outbox.length > 0 && (
              <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setOutboxOpen(true)}>
                {t("{n} waiting", { n: outbox.length })}
              </Button>
            )}
            {drawerOpen === false && !usingSaved && (
              <Link href="/drawer" className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 md:inline-flex" title="Open the cash drawer to track cash for the day close">
                <Banknote className="h-4 w-4" /> {t("Drawer not open")}
              </Link>
            )}
            {held.length > 0 && (
              <Button size="sm" variant="outline" className="whitespace-nowrap" icon={<PlayCircle className="h-4 w-4 text-amber-600" />} onClick={() => setHeldOpen(true)} title="Bills on hold (F6)">
                {t("Held bills")} <Badge color="amber">{held.length}</Badge>
              </Button>
            )}
            <Button size="sm" variant="outline" className="whitespace-nowrap" icon={<HandCoins className="h-4 w-4 text-brand-600" />} onClick={() => setReceiveOpen(true)} title="Customer pays old udhaar (F8)">
              <span className="hidden sm:inline">{t("Receive udhaar")}</span>
              <span className="sm:hidden">{t("Udhaar")}</span>
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
            placeholder={t("Scan barcode or search product…")}
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
          <CatChip active={!cat} onClick={() => setCat("")}>{t("All")}</CatChip>
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
                const inCartQty = round2(cart.filter((i) => i.product._id === p._id).reduce((a, i) => a + i.qty, 0));
                const inCart = inCartQty > 0 ? { qty: inCartQty } : null;
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
                      {t("Stock: {n}", { n: formatQty(p.stock) })}
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
            <ShoppingCart className="h-5 w-5 text-brand-600" /> {t("Bill items")}
            {itemCount > 0 && <Badge color="green">{itemCount}</Badge>}
          </h2>
          {cart.length > 0 && (
            <button onClick={resetBill} className="text-sm font-semibold text-rose-600 hover:text-rose-700">
              {t("Clear all")}
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
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-slate-800">{customer ? customer.name : t("Walk-in customer")}</span>
              {wholesale && <Badge color="violet">{t("Wholesale prices")}</Badge>}
            </div>
            <div className="text-xs text-slate-500">
              {customer ? (customer.balance > 0 ? t("Old udhaar: {amount}", { amount: formatPKR(customer.balance) }) : t("No old udhaar")) : t("Tap to choose a customer (needed for udhaar)")}
              {customer && loyalty && ` · ${t("{n} points", { n: customer.points ?? 0 })}`}
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
              <p className="text-sm">{t("Tap a product or scan a barcode to add it to the bill.")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {cart.map((item) => {
                const loose = !item.pack && LOOSE_UNITS.has(item.product.unit);
                const offer = offers.lines[cart.indexOf(item)];
                const line = round2(item.qty * item.price - item.discount - (offer?.discount ?? 0));
                return (
                  <li key={item.key} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-800">{item.product.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>
                            {formatPKR(item.price)} / {item.pack ? `${item.pack.name} (${formatQty(item.pack.size)} ${UNIT_LABELS[item.product.unit] ?? item.product.unit})` : UNIT_LABELS[item.product.unit]}
                          </span>
                          {wholesale && !item.custom && <Badge color="violet">{t("Wholesale")}</Badge>}
                          {offer && <Badge color="green">{offer.name} −{formatPKR(offer.discount)}</Badge>}
                        </div>
                        {item.device && (
                          <div className="mt-1 space-y-1">
                            <div className="font-mono text-xs text-slate-600">IMEI {item.device.imei}</div>
                            <DeviceTags d={item.device} />
                          </div>
                        )}
                        {!item.device && (item.product.packs?.length ?? 0) > 0 && (
                          <select
                            value={item.pack?.name ?? ""}
                            onChange={(e) => changeUnit(item, e.target.value)}
                            aria-label={`Sell ${item.product.name} as`}
                            className="mt-1 h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-hidden"
                          >
                            <option value="">{UNIT_LABELS[item.product.unit] ?? item.product.unit}</option>
                            {item.product.packs!.map((k) => (
                              <option key={k.name} value={k.name}>
                                {k.name} ({formatQty(k.size)})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <button onClick={() => removeItem(item.key)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {item.device ? (
                        <span className="text-xs text-slate-500">{item.product.warrantyMonths ? `${item.product.warrantyMonths} months warranty` : "1 phone"}</span>
                      ) : (
                      <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                        <button
                          className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-brand-700"
                          onClick={() => (item.qty <= (loose ? 0.25 : 1) ? removeItem(item.key) : updateItem(item.key, { qty: round2(item.qty - (loose ? 0.25 : 1)) }))}
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
                          onChange={(e) => updateItem(item.key, { qty: Math.max(0, Number(e.target.value)) })}
                          className="h-9 w-16 border-x border-slate-200 text-center font-semibold focus:outline-hidden"
                        />
                        <button
                          className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-brand-700"
                          onClick={() => updateItem(item.key, { qty: round2(item.qty + (loose ? 0.25 : 1)) })}
                          aria-label="Increase"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      )}
                      {can.manage && (
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={item.price}
                          onChange={(e) => updateItem(item.key, { price: Math.max(0, Number(e.target.value)), custom: true })}
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
            <Row label={t("Subtotal")} value={formatPKR(subtotal)} />
            {offers.bill && billOffer > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>{t("Offer: {name}", { name: offers.bill.name })}</span>
                <span className="font-semibold">−{formatPKR(billOffer)}</span>
              </div>
            )}
            {canRedeem && (
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg bg-violet-50 px-2 py-1.5 text-violet-800">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="h-4 w-4 accent-violet-600" aria-label="Use points" />
                  {t("Use {n} points", { n: customer!.points ?? 0 })}
                </span>
                <span className="font-semibold">{usePoints ? `−${formatPKR(pointsValue)}` : t("worth {amount}", { amount: formatPKR(round2((customer!.points ?? 0) * loyalty!.per)) })}</span>
              </label>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t("Discount")}</span>
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
            {taxRate > 0 && <Row label={`${t("Sales tax {rate}%", { rate: taxRate })}${inclusive ? ` ${t("(included)")}` : ""}`} value={formatPKR(tax)} />}
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-dashed border-slate-200 pt-3">
            <span className="text-base font-semibold text-slate-600">{t("Total")}</span>
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">{formatPKR(total)}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="xl" variant="outline" className="shrink-0 px-4" disabled={!cart.length} onClick={() => holdBill()} icon={<PauseCircle className="h-5 w-5" />} title="Put this bill aside and serve the next customer (F4)">
              {t("Hold")}
            </Button>
            <Button size="xl" className="flex-1" disabled={!cart.length || cart.some((i) => i.qty <= 0)} onClick={() => setPayOpen(true)}>
              {t("Take Payment")}
            </Button>
          </div>
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

      <DevicePicker
        open={!!phoneFor}
        product={phoneFor}
        exclude={cart.filter((i) => i.device).map((i) => i.device!._id)}
        title={phoneFor ? `Which ${phoneFor.name}?` : undefined}
        onClose={() => {
          setPhoneFor(null);
          searchRef.current?.focus();
        }}
        onPick={([d]) => {
          if (phoneFor && d) addPhone(phoneFor, d);
          setPhoneFor(null);
          searchRef.current?.focus();
        }}
      />

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={total}
        customer={customer}
        onChooseCustomer={() => setPickCustomer(true)}
        payload={billPayload}
        onInstallments={
          settings?.modules?.installments
            ? () => {
                setPayOpen(false);
                setQistOpen(true);
              }
            : undefined
        }
        onDone={(sale) => {
          setPayOpen(false);
          // Receipt prints straight away on this computer if "print automatically" is on.
          const printed = getPrintPrefs().auto;
          if (printed) printInFrame(receiptUrl(sale._id, { print: true, creditAmount: sale.creditAmount }));
          setDone({ ...sale, printed });
          resetBill();
          loadProducts();
        }}
        onOffline={(bill) => {
          const full: OutboxBill = {
            ...bill,
            branchId: branch?._id,
            branchName: branch?.name,
            customerName: customer?.name,
            lines: cart.map((i) => ({ name: i.product.name, qty: i.qty, unit: i.pack ? i.pack.name : UNIT_LABELS[i.product.unit], price: i.price, total: round2(i.qty * i.price - i.discount) })),
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

      <InstallmentSaleModal
        open={qistOpen}
        onClose={() => setQistOpen(false)}
        total={total}
        customer={customer}
        onChooseCustomer={() => setPickCustomer(true)}
        payload={billPayload}
        onDone={({ plan }) => {
          setQistOpen(false);
          setQistDone({ planId: plan._id, planNo: plan.planNo, invoiceNo: plan.invoiceNo, financed: plan.financed, months: plan.months, perMonth: plan.schedule[0]?.amount ?? 0, firstDue: plan.schedule[0]?.dueDate ?? "" });
          window.open(`/receipt/installment/${plan._id}?print=1`, "_blank");
          resetBill();
          loadProducts();
        }}
      />

      <Modal open={!!qistDone} onClose={() => setQistDone(null)} title="Sold on installments" size="sm">
        {qistDone && (
          <div className="text-center">
            <CalendarRange className="mx-auto h-14 w-14 text-brand-500" />
            <p className="mt-3 text-sm text-slate-500">
              {qistDone.planNo} · {qistDone.invoiceNo}
            </p>
            <p className="text-3xl font-extrabold text-slate-900">{formatPKR(qistDone.financed)}</p>
            <p className="mt-1 text-sm text-slate-600">
              {qistDone.months} × {formatPKR(qistDone.perMonth)} — first due {qistDone.firstDue ? formatDate(qistDone.firstDue) : "—"}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" icon={<Printer className="h-5 w-5" />} onClick={() => window.open(`/receipt/installment/${qistDone.planId}?print=1`, "_blank")}>
                {t("Print")}
              </Button>
              <Button size="lg" onClick={() => setQistDone(null)}>
                {t("Next bill")}
              </Button>
            </div>
            <Link href={`/installments/${qistDone.planId}`} className="mt-4 inline-block text-sm font-semibold text-brand-700 underline">
              Open the installment plan
            </Link>
          </div>
        )}
      </Modal>

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
                <p className="text-sm font-medium text-amber-800">{t("Give change back")}</p>
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
                {t("Print")}
              </Button>
              <Button size="lg" onClick={() => setOfflineDone(null)}>
                {t("Next bill")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ReceivePaymentModal open={receiveOpen} onClose={() => setReceiveOpen(false)} />

      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title={t("Bills on hold")} size="md">
        {held.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No bills on hold. Use “Hold” (F4) to put a bill aside while you serve someone else.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {[...held].reverse().map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-800">{h.label}</div>
                  <div className="text-xs text-slate-500">
                    {h.items.length} items · {heldAgo(h.at)}
                    {h.userName && ` · ${h.userName}`}
                  </div>
                  <div className="truncate text-xs text-slate-400">{h.items.map((i) => i.product.name).join(", ")}</div>
                </div>
                <div className="text-right font-bold text-slate-900">{formatPKR(h.total)}</div>
                <Button size="sm" icon={<PlayCircle className="h-4 w-4" />} onClick={() => resumeHeld(h)}>
                  {t("Open")}
                </Button>
                <Button size="sm" variant="ghost" className="hover:text-rose-600" aria-label={`Delete held bill ${h.label}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => deleteHeld(h)} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">Held bills are kept on this computer only. Stock is taken out when the bill is paid.</p>
      </Modal>

      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={addByCode} continuous title="Scan items" />

      <OutboxModal open={outboxOpen} onClose={() => setOutboxOpen(false)} tenantId={tenantId} bills={outbox} onSynced={loadProducts} />

      <Modal open={!!done} onClose={() => setDone(null)} title={t("Bill saved")} size="sm">
        {done && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-brand-500" />
            <p className="mt-3 text-sm text-slate-500">{done.invoiceNo}</p>
            <p className="text-3xl font-extrabold text-slate-900">{formatPKR(done.total)}</p>
            {done.change > 0 && (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">{t("Give change back")}</p>
                <p className="text-3xl font-extrabold text-amber-900">{formatPKR(done.change)}</p>
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" icon={<Printer className="h-5 w-5" />} onClick={() => window.open(receiptUrl(done._id, { print: true, creditAmount: done.creditAmount }), "_blank")}>
                {t("Print")}
              </Button>
              <Button size="lg" onClick={() => setDone(null)}>
                {t("Next bill")}
              </Button>
            </div>
            {done.printed && <p className="mt-3 text-xs text-slate-500">{t("Receipt sent to the printer.")}</p>}
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={autoPrint}
                onChange={(e) => {
                  setAutoPrint(e.target.checked);
                  setPrintPrefs({ auto: e.target.checked });
                }}
                className="h-4 w-4 accent-brand-600"
                aria-label="Print automatically"
              />
              {t("Print the receipt automatically after every bill (this computer)")}
            </label>
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
  onInstallments,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  customer: PartyLite | null;
  onChooseCustomer: () => void;
  payload: { items: unknown[]; discount: number; customerId?: string; redeemPoints?: number };
  onDone: (sale: { _id: string; invoiceNo: string; total: number; change: number; creditAmount?: number }) => void;
  onOffline: (bill: Omit<OutboxBill, "lines">) => void;
  /** Shown when the installments feature is on: sell this bill on monthly installments instead. */
  onInstallments?: () => void;
}) {
  const toast = useToast();
  const t = useT();
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
      const sale = await api<{ _id: string; invoiceNo: string; total: number; change: number; creditAmount?: number }>("/api/sales", { body });
      onDone(sale);
    } catch (err) {
      if (err instanceof NetworkError) {
        // A phone's IMEI must be checked by the server, so phones are never sold offline.
        if ((payload.items as { serials?: string[] }[]).some((i) => i.serials?.length)) {
          toast.error("No connection to the shop server. Phones sold by IMEI need the connection — try again when it is back.");
        } else onOffline({ clientId: clientId.current, soldAt: new Date().toISOString(), payload: body, total, change, status: "pending" });
      } else toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Take payment")} size="md">
      <div className="mb-4 rounded-2xl bg-slate-900 p-5 text-center text-white">
        <div className="text-sm text-slate-300">{t("Total to pay")}</div>
        <div className="text-4xl font-extrabold tracking-tight">{formatPKR(total)}</div>
      </div>

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "single", label: t("One method") },
          { value: "split", label: t("Split payment") },
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
                {t(m.label)}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <Field label={method === "credit" ? t("Paid now (optional)") : t("Amount received")} hint={method === "cash" ? t("Leave empty if customer gives exact amount") : undefined}>
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
              <Field label={t("Transaction ID (optional)")} className="mt-3" hint="From the customer's JazzCash / Easypaisa / bank message or card slip">
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
              <span className="w-24 shrink-0 text-sm font-semibold text-slate-700">{t(m.label)}</span>
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
                {t("Rest")}
              </button>
            </div>
          ))}
          <div className="flex justify-between px-1 pt-1 text-sm">
            <span className="text-slate-500">{t("Paid")}</span>
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
          <span className="font-semibold text-amber-800">{t("Change to return")}</span>
          <span className="text-2xl font-extrabold text-amber-900">{formatPKR(change)}</span>
        </div>
      )}
      {remaining > 0 && !splitTooMuch && (
        <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sky-800">{t("Goes to udhaar")}</span>
            <span className="text-2xl font-extrabold text-sky-900">{formatPKR(remaining)}</span>
          </div>
          {customer ? (
            <p className="mt-1 text-xs text-sky-700">{t("Will be added to {name}'s khata.", { name: customer.name })}</p>
          ) : (
            <button onClick={onChooseCustomer} className="mt-2 text-sm font-semibold text-sky-700 underline">
              {t("Choose a customer for udhaar")}
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
        {t("Confirm & Save Bill")}
      </Button>
      {onInstallments && (
        <Button variant="outline" size="lg" className="mt-3 w-full" onClick={onInstallments} icon={<CalendarRange className="h-5 w-5" />}>
          Sell on installments (qist)
        </Button>
      )}
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

function heldAgo(at: string) {
  const min = Math.floor((Date.now() - new Date(at).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : new Date(at).toLocaleDateString("en-PK", { day: "2-digit", month: "short" });
}
