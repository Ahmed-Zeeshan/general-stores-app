"use client";

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, Loader2, X } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";

/** Translates plain text (Urdu / Roman Urdu); anything else is shown as it is. */
function useTx() {
  const t = useT();
  return <N,>(node: N): N => (typeof node === "string" ? (t(node) as N) : node);
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "xl";
  loading?: boolean;
  icon?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...props },
  ref,
) {
  const tx = useTx();
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-xs focus-visible:ring-brand-500",
    secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 focus-visible:ring-slate-400",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-xs focus-visible:ring-rose-500",
    ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400",
    outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400",
  };
  const sizes = {
    sm: "h-9 px-3 text-sm gap-1.5",
    md: "h-11 px-4 text-sm gap-2",
    lg: "h-12 px-5 text-base gap-2",
    xl: "h-16 px-6 text-lg gap-3",
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {tx(children)}
    </button>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tx = useTx();
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-1.5 block text-sm font-medium text-slate-700">{tx(label)}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{tx(hint)}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  );
}

const inputStyle =
  "rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 placeholder:text-slate-400 shadow-xs transition focus:border-brand-500 focus:outline-hidden focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100";

/** Full width by default, unless the caller passes its own width (e.g. "w-28") or flex sizing. */
function inputBase(className?: string) {
  const customWidth = /(^|\s)(w-|flex-1)/.test(className ?? "");
  return cn(inputStyle, !customWidth && "w-full");
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputBase(className), "h-11", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(inputBase(className), "h-11 pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputBase(className), "min-h-[80px] py-2.5", className)} {...props} />;
  },
);

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-soft", className)}>{children}</div>;
}

/** Which help topic belongs to which screen (the "?" next to page headings). */
const HELP_FOR: [string, string][] = [
  ["/pos", "bill"],
  ["/customers", "udhaar"],
  ["/udhaar", "udhaar"],
  ["/products", "stock"],
  ["/labels", "stock"],
  ["/expiry", "stock"],
  ["/purchases", "purchases"],
  ["/suppliers", "purchases"],
  ["/sales", "returns"],
  ["/drawer", "drawer"],
  ["/settings", "staff"],
  ["/activity", "staff"],
  ["/transfers", "staff"],
  ["/phones", "phones"],
  ["/used-phones", "phones"],
  ["/repairs", "repairs"],
  ["/wallets", "wallets"],
  ["/installments", "installments"],
];

export function PageHeader({
  title,
  urdu,
  subtitle,
  actions,
}: {
  title: string;
  urdu?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const tx = useTx();
  const { lang } = useLang();
  // Urdu: the Urdu heading is the main one, with the English name small beside it.
  const main = lang === "ur" && urdu ? urdu : tx(title);
  const pathname = usePathname() ?? "";
  const help = HELP_FOR.find(([p]) => pathname.startsWith(p))?.[1];
  const side = lang === "ur" ? (urdu ? title : null) : urdu;
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className={cn("text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl", lang === "ur" && urdu && "urdu leading-loose")}>{main}</h1>
          {side && <span className={cn("text-lg text-slate-400", lang !== "ur" && "urdu", lang === "ur" && "text-sm")}>{side}</span>}
          {help && (
            <Link href={`/help#${help}`} className="self-center text-slate-300 hover:text-brand-600" aria-label="Help for this page" title="How does this page work?">
              <HelpCircle className="h-5 w-5" />
            </Link>
          )}
        </div>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{tx(subtitle)}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badgeColors = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function Badge({ color = "slate", children }: { color?: keyof typeof badgeColors; children: React.ReactNode }) {
  const tx = useTx();
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", badgeColors[color])}>
      {tx(children)}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const tx = useTx();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  // Rendered at the top of the page, so a dialog opened from the menu is never hidden behind the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn("relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl", sizes[size])}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{tx(title)}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A count with the right word in the chosen language: <Count n={1} one="{n} bill" many="{n} bills" /> → "1 bill". */
export function Count({ n, one, many }: { n: number; one: string; many: string }) {
  const t = useT();
  return <>{t(n === 1 ? one : many, { n })}</>;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  const tx = useTx();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{tx(title)}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{tx(text)}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-16", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}

const TONE_TEXT = { green: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600", violet: "text-violet-600", slate: "text-slate-500", blue: "text-sky-600" } as const;

/**
 * A compact KPI tile: label + small tinted icon on top, a big tabular value, and an optional hint.
 * With `onClick` it becomes a toggle/filter and highlights when `active`. The whole app's stat
 * strips use this (via {@link StatCard}), so values never truncate and every page stays consistent.
 */
export function StatTile({
  label,
  value,
  icon,
  tone = "slate",
  hint,
  active,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: keyof typeof TONE_TEXT;
  hint?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const tx = useTx();
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-500">{tx(label)}</span>
        <span className={cn("shrink-0", TONE_TEXT[tone])}>{icon}</span>
      </div>
      <div className="mt-1 truncate text-xl font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 h-4 truncate text-[11px] text-slate-400">{typeof hint === "string" ? tx(hint) : hint}</div>
    </>
  );
  const base = "block rounded-xl border p-3 text-left transition";
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(base, active ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")}>
        {inner}
      </button>
    );
  return <div className={cn(base, "border-slate-200 bg-white")}>{inner}</div>;
}

/** Back-compat KPI card used across the app; renders the compact {@link StatTile}. */
export function StatCard({ tone = "green", ...rest }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: keyof typeof TONE_TEXT; hint?: React.ReactNode }) {
  return <StatTile tone={tone} {...rest} />;
}

/**
 * Data table. When the columns don't fit the space, long text first wraps inside the cells; if
 * it still doesn't fit (phones, tablets, a laptop with the menu open) each row becomes a small card: the first cell is the title and every other cell shows its
 * column heading next to the value, so no column ever hides behind a sideways scroll.
 * `stack={false}` keeps the normal table with a sideways scroll instead.
 */
export function Table({ children, stack = true, maxHeight }: { children: React.ReactNode; stack?: boolean; maxHeight?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const table = ref.current;
    if (!wrap || !table || !stack) return;
    const update = () => {
      // Copy each column heading onto its cells (shown as the label in card view).
      const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
      for (const tr of table.querySelectorAll("tbody > tr, tfoot > tr")) {
        let col = 0;
        for (const cell of tr.children as HTMLCollectionOf<HTMLTableCellElement>) {
          const text = cell.colSpan > 1 ? "" : (heads[col] ?? "");
          if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
          // Only long text (names, notes, details) may wrap; dates, amounts and codes stay on one line.
          cell.toggleAttribute("data-long", (cell.textContent ?? "").trim().length > 24);
          col += cell.colSpan || 1;
        }
      }
      // Too wide? First let long text wrap inside the cells; if it still doesn't fit, use cards.
      const tooWide = () => table.offsetWidth > wrap.clientWidth + 1;
      table.classList.remove("wrapped", "stacked");
      if (tooWide()) {
        table.classList.add("wrapped");
        if (tooWide()) table.classList.replace("wrapped", "stacked");
      }
    };
    update();
    const rows = new MutationObserver(update);
    rows.observe(table, { childList: true, subtree: true, characterData: true });
    const size = new ResizeObserver(update);
    size.observe(wrap);
    return () => {
      rows.disconnect();
      size.disconnect();
    };
  }, [stack]);
  return (
    <div ref={wrapRef} className={cn("scrollbar-thin overflow-x-auto", maxHeight && "overflow-y-auto")} style={maxHeight ? { maxHeight } : undefined}>
      <table ref={ref} className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  const tx = useTx();
  return (
    <th className={cn("whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500", className)}>
      {tx(children)}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("whitespace-nowrap border-b border-slate-100 px-4 py-3", className)}>
      {children}
    </td>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const tx = useTx();
  return (
    <div className="scrollbar-thin inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-semibold transition sm:px-3.5",
            value === o.value ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-700",
          )}
        >
          {tx(o.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * A small dropdown menu opened by `trigger`. Closes on outside click, Escape, or after an item is
 * picked. Used to tuck away less-common row actions behind a "⋯" button so lists stay uncluttered.
 */
export function Menu({ trigger, children, align = "right" }: { trigger: React.ReactNode; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className={cn("absolute z-20 mt-1 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg", align === "right" ? "right-0" : "left-0")}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One row inside a {@link Menu}. */
export function MenuItem({ icon, onClick, href, danger, children }: { icon?: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean; children: React.ReactNode }) {
  const tx = useTx();
  const cls = cn("flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium hover:bg-slate-50", danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700");
  if (href)
    return (
      <Link href={href} className={cls}>
        {icon}
        {tx(children)}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {tx(children)}
    </button>
  );
}
