"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Barcode,
  BarChart3,
  BellRing,
  MapPin,
  BookOpen,
  Building2,
  ChefHat,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Truck,
  Wallet,
  PackagePlus,
  X,
} from "lucide-react";
import { ToastProvider, useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { SessionContext, type SessionData } from "@/components/session";
import { Logo } from "@/components/logo";
import { Button, Field, Input, Modal, Spinner, cn } from "@/components/ui";
import { api, NetworkError } from "@/lib/client";
import { cache, clearOfflineCache, getOutbox, onOutboxChange, syncOutbox } from "@/lib/offline";
import type { Role } from "@/lib/session";

const SHOP: Role[] = ["owner", "manager", "cashier"];
const NAV: { href: string; label: string; urdu: string; icon: typeof Package; roles: Role[]; multiBranch?: boolean }[] = [
  { href: "/admin", label: "Shops", urdu: "دکانیں", icon: Building2, roles: ["superadmin"] },
  { href: "/", label: "Dashboard", urdu: "ڈیش بورڈ", icon: LayoutDashboard, roles: SHOP },
  { href: "/pos", label: "New Bill", urdu: "نیا بل", icon: ShoppingCart, roles: SHOP },
  { href: "/sales", label: "Sales History", urdu: "فروخت", icon: Receipt, roles: SHOP },
  { href: "/products", label: "Products & Stock", urdu: "اشیاء", icon: Package, roles: SHOP },
  { href: "/customers", label: "Customers Khata", urdu: "کھاتہ", icon: BookOpen, roles: SHOP },
  { href: "/udhaar", label: "Udhaar Report", urdu: "ادھار رپورٹ", icon: BellRing, roles: ["owner", "manager"] },
  { href: "/labels", label: "Barcode Labels", urdu: "لیبل", icon: Barcode, roles: ["owner", "manager"] },
  { href: "/production", label: "Production", urdu: "تیاری", icon: ChefHat, roles: ["owner", "manager"] },
  { href: "/transfers", label: "Stock Transfer", urdu: "منتقلی", icon: ArrowLeftRight, roles: ["owner", "manager"], multiBranch: true },
  { href: "/purchases", label: "Purchases", urdu: "خریداری", icon: PackagePlus, roles: ["owner", "manager"] },
  { href: "/suppliers", label: "Suppliers", urdu: "سپلائرز", icon: Truck, roles: ["owner", "manager"] },
  { href: "/expenses", label: "Expenses", urdu: "اخراجات", icon: Wallet, roles: ["owner", "manager"] },
  { href: "/reports", label: "Reports", urdu: "رپورٹس", icon: BarChart3, roles: ["owner", "manager"] },
  { href: "/settings", label: "Settings", urdu: "ترتیبات", icon: SettingsIcon, roles: ["owner"] },
];

const ROLE_LABEL: Record<Role, string> = { superadmin: "Super Admin", owner: "Owner", manager: "Manager", cashier: "Cashier" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const [offline, setOffline] = useState(false);
  const confirm = useConfirm();
  const load = useCallback(() => {
    api<SessionData>("/api/auth/me")
      .then((d) => {
        setData(d);
        setOffline(false);
        cache.set("me", d);
      })
      .catch((err) => {
        // No connection: keep working with the details saved at the last successful login.
        if (err instanceof NetworkError) {
          const saved = cache.get<SessionData | null>("me", null);
          if (saved) {
            setData(saved);
            setOffline(true);
          }
        }
      });
  }, []);
  useEffect(load, [load]);
  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    const waiting = data?.user.tenantId ? getOutbox(data.user.tenantId).length : 0;
    if (
      waiting &&
      !(await confirm({
        title: "Offline bills not sent yet",
        message: `${waiting} bill(s) made offline are still on this device.`,
        tone: "warning",
        points: ["They stay safely on this device.", "They are sent automatically after the next login on this device."],
        confirmLabel: "Log out anyway",
        cancelLabel: "Stay logged in",
      }))
    )
      return;
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearOfflineCache(data?.user.tenantId);
    router.replace("/login");
  }

  if (!data) return <Spinner className="min-h-screen" />;
  const multiBranch = (data.branches?.length ?? 0) > 1;
  const nav = NAV.filter((n) => n.roles.includes(data.user.role) && (!n.multiBranch || multiBranch));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const isAdmin = data.user.role === "superadmin";

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo />
      </div>
      <div className="mx-4 mb-3 rounded-xl bg-brand-50 px-3 py-2.5">
        <div className="truncate text-sm font-bold text-brand-900">{isAdmin ? "Admin Panel" : data.settings?.shopName ?? "My Shop"}</div>
        <div className="text-xs text-brand-700">
          {data.user.name} · {ROLE_LABEL[data.user.role]}
        </div>
        {multiBranch && data.branch && <BranchSwitcher data={data} />}
      </div>
      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              isActive(item.href) ? "bg-brand-600 text-white shadow-md shadow-brand-600/25" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <item.icon className={cn("h-5 w-5 shrink-0", isActive(item.href) ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
            <span className="flex-1">{item.label}</span>
            <span className={cn("urdu text-xs", isActive(item.href) ? "text-brand-100" : "text-slate-400")}>{item.urdu}</span>
          </Link>
        ))}
      </nav>
      <div className="space-y-1 border-t border-slate-100 p-3">
        <button
          onClick={() => setPwOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <KeyRound className="h-5 w-5" /> Change password
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-5 w-5" /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <SessionContext.Provider value={{ ...data, reload: load }}>
      <ToastProvider>
        <div className="min-h-screen lg:pl-72">
          <aside className="no-print fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

          {open && (
            <div className="no-print fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
              <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-2xl">
                <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
                {sidebar}
              </aside>
            </div>
          )}

          <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-sm lg:hidden">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </button>
            <span className="truncate px-2 font-bold text-slate-900">{isAdmin ? "Admin Panel" : data.settings?.shopName}</span>
            {isAdmin ? (
              <span className="w-9" />
            ) : (
              <Link href="/pos" className="rounded-lg bg-brand-600 p-2 text-white" aria-label="New bill">
                <ShoppingCart className="h-5 w-5" />
              </Link>
            )}
          </header>

          {data.user.tenantId && <OfflineSync tenantId={data.user.tenantId} offline={offline} onOnline={load} />}
          <main className={pathname === "/pos" ? "" : "mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"}>{children}</main>
        </div>
        <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      </ToastProvider>
    </SessionContext.Provider>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({ currentPassword: "", newPassword: "", confirm: "" });
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast.error("New passwords do not match.");
    setSaving(true);
    try {
      await api("/api/auth/password", { body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      toast.success("Password changed");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change password" size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Current password">
          <Input type="password" required autoFocus autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password" hint="At least 6 characters">
          <Input type="password" required minLength={6} autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </Field>
        <Field label="Repeat new password">
          <Input type="password" required minLength={6} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={saving}>
          Save new password
        </Button>
      </form>
    </Modal>
  );
}

function BranchSwitcher({ data }: { data: SessionData }) {
  const [busy, setBusy] = useState(false);
  if (data.branchLocked || !data.branches) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-800">
        <MapPin className="h-3.5 w-3.5" /> {data.branch?.name}
      </div>
    );
  }
  async function change(id: string) {
    setBusy(true);
    try {
      await api("/api/branches/switch", { body: { branchId: id } });
      // Reload so every screen shows the new branch's stock and sales.
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }
  return (
    <label className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1 ring-1 ring-brand-200">
      <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-700" />
      <span className="sr-only">Branch</span>
      <select
        value={data.branch?._id}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        className="w-full bg-transparent text-xs font-semibold text-brand-900 focus:outline-hidden"
      >
        {data.branches.map((b) => (
          <option key={b._id} value={b._id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Sends offline bills in the background and shows a banner while offline or bills are waiting. */
function OfflineSync({ tenantId, offline, onOnline }: { tenantId: string; offline: boolean; onOnline: () => void }) {
  const toast = useToast();
  const [waiting, setWaiting] = useState(0);
  const [failed, setFailed] = useState(0);
  const [netDown, setNetDown] = useState(offline);

  useEffect(() => setNetDown(offline), [offline]);

  useEffect(() => {
    const refresh = () => {
      const box = getOutbox(tenantId);
      setWaiting(box.filter((b) => b.status === "pending").length);
      setFailed(box.filter((b) => b.status === "failed").length);
    };
    refresh();
    return onOutboxChange(refresh);
  }, [tenantId]);

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      if (stopped || !getOutbox(tenantId).some((b) => b.status === "pending")) return;
      const r = await syncOutbox(tenantId);
      setNetDown(r.offline);
      if (r.sent) toast.success(`${r.sent} offline bill(s) sent to the server`);
      if (!r.offline && offline) onOnline();
    };
    run();
    const timer = setInterval(run, 20_000);
    const back = () => {
      run();
      onOnline();
    };
    window.addEventListener("online", back);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", back);
    };
  }, [tenantId, toast, offline, onOnline]);

  const visible = netDown || waiting > 0 || failed > 0;
  // Full-height screens (New Bill) subtract the banner's height so nothing is hidden under it.
  useEffect(() => {
    document.documentElement.style.setProperty("--banner-h", visible ? "2.5rem" : "0px");
    return () => document.documentElement.style.setProperty("--banner-h", "0px");
  }, [visible]);

  if (!visible) return null;
  return (
    <div className={`no-print z-30 flex h-10 items-center justify-center truncate px-4 text-center text-sm font-semibold lg:sticky lg:top-0 ${netDown ? "bg-amber-500 text-white" : failed ? "bg-rose-600 text-white" : "bg-sky-600 text-white"}`}>
      {netDown ? "Offline — you can still make bills. " : ""}
      {waiting > 0 && `${waiting} bill(s) waiting to be sent. `}
      {failed > 0 && (
        <Link href="/pos?outbox=1" className="underline">
          {failed} bill(s) could not be saved — tap to review
        </Link>
      )}
    </div>
  );
}
