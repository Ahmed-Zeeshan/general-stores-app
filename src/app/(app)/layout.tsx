"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
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
import { ToastProvider } from "@/components/toast";
import { SessionContext, type ShopSettings } from "@/components/session";
import { Logo } from "@/components/logo";
import { Spinner, cn } from "@/components/ui";
import { api } from "@/lib/client";
import type { Role, SessionUser } from "@/lib/session";

const NAV: { href: string; label: string; urdu: string; icon: typeof Package; roles?: Role[] }[] = [
  { href: "/", label: "Dashboard", urdu: "ڈیش بورڈ", icon: LayoutDashboard },
  { href: "/pos", label: "New Bill", urdu: "نیا بل", icon: ShoppingCart },
  { href: "/sales", label: "Sales History", urdu: "فروخت", icon: Receipt },
  { href: "/products", label: "Products & Stock", urdu: "اشیاء", icon: Package },
  { href: "/customers", label: "Customers Khata", urdu: "کھاتہ", icon: BookOpen },
  { href: "/purchases", label: "Purchases", urdu: "خریداری", icon: PackagePlus, roles: ["owner", "manager"] },
  { href: "/suppliers", label: "Suppliers", urdu: "سپلائرز", icon: Truck, roles: ["owner", "manager"] },
  { href: "/expenses", label: "Expenses", urdu: "اخراجات", icon: Wallet, roles: ["owner", "manager"] },
  { href: "/reports", label: "Reports", urdu: "رپورٹس", icon: BarChart3, roles: ["owner", "manager"] },
  { href: "/settings", label: "Settings", urdu: "ترتیبات", icon: SettingsIcon, roles: ["owner"] },
];

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", cashier: "Cashier" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<{ user: SessionUser; settings: ShopSettings | null } | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api<{ user: SessionUser; settings: ShopSettings | null }>("/api/auth/me").then(setData).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  if (!data) return <Spinner className="min-h-screen" />;
  const nav = NAV.filter((n) => !n.roles || n.roles.includes(data.user.role));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo />
      </div>
      <div className="mx-4 mb-3 rounded-xl bg-brand-50 px-3 py-2.5">
        <div className="truncate text-sm font-bold text-brand-900">{data.settings?.shopName ?? "My Shop"}</div>
        <div className="text-xs text-brand-700">
          {data.user.name} · {ROLE_LABEL[data.user.role]}
        </div>
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
      <div className="border-t border-slate-100 p-3">
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

          <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </button>
            <span className="truncate px-2 font-bold text-slate-900">{data.settings?.shopName}</span>
            <Link href="/pos" className="rounded-lg bg-brand-600 p-2 text-white" aria-label="New bill">
              <ShoppingCart className="h-5 w-5" />
            </Link>
          </header>

          <main className={pathname === "/pos" ? "" : "mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"}>{children}</main>
        </div>
      </ToastProvider>
    </SessionContext.Provider>
  );
}
