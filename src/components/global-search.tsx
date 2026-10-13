"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarRange, CornerDownLeft, Loader2, Package, Receipt, Repeat, Search, Smartphone, Truck, Wrench, X, Zap } from "lucide-react";
import { cn } from "./ui";
import { api } from "@/lib/client";
import type { SearchGroup, SearchHit } from "@/lib/search";

const ICONS: Record<string, typeof Search> = {
  customer: BookOpen,
  supplier: Truck,
  product: Package,
  device: Smartphone,
  sale: Receipt,
  return: Receipt,
  repair: Wrench,
  installment: CalendarRange,
  used: Repeat,
  wallet: Zap,
};

/** Ctrl+K opens the search box from any screen (mounted once in the layout). */
export function SearchHotkey() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return open ? <SearchDialog onClose={() => setOpen(false)} /> : null;
}

/** "Search" button for the menu / header. */
export function SearchButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Search">
          <Search className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition hover:border-brand-300 hover:text-slate-700"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search anything…</span>
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-400">Ctrl K</kbd>
        </button>
      )}
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);
  // A page still loading behind the box (e.g. an auto-focused amount field) must not take the typing away.
  useEffect(() => {
    const keep = (e: FocusEvent) => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) input.current?.focus();
    };
    document.addEventListener("focusin", keep);
    return () => document.removeEventListener("focusin", keep);
  }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setGroups(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api<SearchGroup[]>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((g) => {
          setGroups(g);
          setActive(0);
        })
        .catch(() => setGroups([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  const hits = groups?.flatMap((g) => g.hits) ?? [];
  function go(h: SearchHit) {
    onClose();
    router.push(h.href);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  }
  useEffect(() => {
    document.querySelector(`[data-hit="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let n = -1;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-3 pt-[8vh] sm:p-6 sm:pt-[12vh]" onMouseDown={onClose}>
      <div ref={box} role="dialog" aria-label="Search" className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Name, mobile, CNIC, IMEI, bill or job number…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none"
            aria-label="Search anything"
          />
          {loading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />}
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close search">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {!groups ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">Type at least 2 letters or digits. Mobile numbers, CNIC and IMEI work with or without dashes.</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">Nothing found for “{q.trim()}”.</p>
          ) : (
            groups.map((g) => (
              <div key={g.type} className="mb-2">
                <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.label}</div>
                {g.hits.map((h) => {
                  n++;
                  const i = n;
                  const Icon = ICONS[h.type] ?? Search;
                  return (
                    <button
                      key={`${h.type}-${h.id}`}
                      type="button"
                      data-hit={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", i === active ? "bg-brand-50" : "hover:bg-slate-50")}
                    >
                      <Icon className={cn("h-5 w-5 shrink-0", i === active ? "text-brand-600" : "text-slate-400")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">{h.title}</span>
                        {h.subtitle && <span className="block truncate text-xs text-slate-500">{h.subtitle}</span>}
                      </span>
                      {i === active && <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-brand-500 sm:block" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="hidden border-t border-slate-100 px-4 py-2 text-xs text-slate-400 sm:block">↑ ↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>,
    document.body,
  );
}
