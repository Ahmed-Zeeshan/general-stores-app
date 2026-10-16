"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ListPlus, Rocket, X } from "lucide-react";
import { Button, Card, cn } from "./ui";
import { StarterItemsModal } from "./starter-items";
import { api } from "@/lib/client";
import { PRINTER_TESTED_KEY } from "@/lib/print";
import { useT } from "@/lib/i18n";

type Status = {
  dismissed: boolean;
  modules: Record<string, boolean>;
  done: Record<"shop" | "products" | "customers" | "staff" | "drawer" | "bill" | "wallets" | "phones", boolean>;
  counts: { products: number };
};

/** The checklist for this shop (mobile-shop steps only when those features are on). */
function stepsFor(s: Status, printed: boolean) {
  return [
    { key: "shop", done: s.done.shop, title: "Add your shop's phone and address", text: "They print on every receipt and WhatsApp message.", href: "/settings", action: "Open Settings" },
    { key: "printer", done: printed, title: "Test the receipt printer", text: "Print a sample receipt to check paper size and printer.", href: "/receipt/test", action: "Print test receipt", newTab: true },
    { key: "products", done: s.done.products, title: "Add the items you sell", text: "Pick from a ready-made list and type your prices, or add your own ({n} so far).", vars: { n: s.counts.products }, starter: true, href: "/products", action: "Open Products" },
    ...(s.modules.phones ? [{ key: "phones", done: s.done.phones, title: "Add the phones in stock by IMEI", text: "Each handset is sold and tracked by its IMEI.", href: "/phones", action: "Open Phones" }] : []),
    ...(s.modules.wallets ? [{ key: "wallets", done: s.done.wallets, title: "Add your Easyload SIMs and JazzCash / Easypaisa accounts", text: "With their current balance and commission.", href: "/wallets", action: "Open Easyload" }] : []),
    { key: "customers", done: s.done.customers, title: "Add customers who buy on udhaar", text: "With their old balance from your register.", href: "/customers?new=1", action: "Add a customer" },
    { key: "staff", done: s.done.staff, title: "Give your staff their own login", text: "Cashiers can bill but can't change prices or see profit.", href: "/settings", action: "Add staff" },
    { key: "drawer", done: s.done.drawer, title: "Open the cash drawer", text: "Count the cash at the start of the day; the day close shows if anything is short.", href: "/drawer", action: "Open the drawer" },
    { key: "bill", done: s.done.bill, title: "Make your first bill", text: "Scan a barcode or tap an item, then Take Payment.", href: "/pos", action: "New Bill" },
  ];
}

/** "Get your shop ready" checklist for a new shop's owner, on the dashboard until done or hidden. */
export function SetupGuide() {
  const t = useT();
  const [s, setS] = useState<Status | null>(null);
  const [printed, setPrinted] = useState(false);
  const [starter, setStarter] = useState(false);
  const load = useCallback(() => {
    api<Status>("/api/setup-status")
      .then(setS)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    try {
      setPrinted(!!localStorage.getItem(PRINTER_TESTED_KEY));
    } catch {
      /* ignore */
    }
  }, [load]);
  // Everything done once: the guide is finished for good (it does not come back when, say, the drawer is closed at night).
  const allDone = !!s && !s.dismissed && stepsFor(s, printed).every((x) => x.done);
  useEffect(() => {
    if (allDone) api("/api/setup-status", { method: "POST" }).catch(() => {});
  }, [allDone]);
  if (!s || s.dismissed) return null;

  const steps = stepsFor(s, printed);
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount === steps.length) return null;
  async function hide() {
    await api("/api/setup-status", { method: "POST" }).catch(() => {});
    setS((x) => x && { ...x, dismissed: true });
  }

  return (
    <Card className="mb-8 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-brand-50/60 px-5 py-4">
        <Rocket className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900">{t("Get your shop ready")}</h2>
          <p className="text-sm text-slate-600">
            {t("{done} of {total} done — a few minutes now saves time at the counter.", { done: doneCount, total: steps.length })}
          </p>
          <div className="mt-2 h-2 rounded-full bg-white">
            <div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
        </div>
        <button type="button" onClick={hide} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Hide the setup guide" title={t("Hide")}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {steps.map((x) => (
          <li key={x.key} className={cn("flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center", x.done && "opacity-60")}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {x.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
              <div className="min-w-0">
                <div className={cn("text-sm font-semibold", x.done ? "text-slate-500 line-through" : "text-slate-800")}>{t(x.title)}</div>
                {!x.done && <div className="text-xs text-slate-500">{t(x.text, "vars" in x ? x.vars : undefined)}</div>}
              </div>
            </div>
            {!x.done && (
              <div className="flex shrink-0 flex-wrap gap-2 pl-8 sm:pl-0">
                {"starter" in x && x.starter && (
                  <Button size="sm" icon={<ListPlus className="h-4 w-4" />} onClick={() => setStarter(true)}>
                    Ready-made list
                  </Button>
                )}
                {"newTab" in x && x.newTab ? (
                  <a
                    href={x.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      try {
                        localStorage.setItem(PRINTER_TESTED_KEY, "1");
                      } catch {
                        /* ignore */
                      }
                      setPrinted(true);
                    }}
                  >
                    <Button size="sm" variant="outline">
                      {x.action}
                    </Button>
                  </a>
                ) : (
                  <Link href={x.href}>
                    <Button size="sm" variant="outline">
                      {x.action}
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <StarterItemsModal
        open={starter}
        onClose={() => setStarter(false)}
        onAdded={() => {
          setStarter(false);
          load();
        }}
      />
    </Card>
  );
}
