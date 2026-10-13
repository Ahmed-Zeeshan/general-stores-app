"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, BookOpen, CalendarRange, CheckCircle2, FileWarning, MessageCircle, Package, Wallet, Wrench, Zap } from "lucide-react";
import { Modal, Spinner, cn } from "./ui";
import { useSession } from "./session";
import { useToast } from "./toast";
import { api } from "@/lib/client";
import { installmentMessage, openWhatsApp, reminderMessage, repairMessage, waNumber } from "@/lib/whatsapp";
import type { Task } from "@/lib/tasks";

const GROUPS: Record<Task["group"], { label: string; icon: typeof Bell }> = {
  drawer: { label: "Cash drawer", icon: Wallet },
  installments: { label: "Installments", icon: CalendarRange },
  repairs: { label: "Repairs", icon: Wrench },
  wallets: { label: "Easyload & wallets", icon: Zap },
  stock: { label: "Stock", icon: Package },
  udhaar: { label: "Udhaar reminders", icon: BookOpen },
  fbr: { label: "FBR", icon: FileWarning },
};
const ORDER: Task["group"][] = ["drawer", "installments", "repairs", "udhaar", "wallets", "stock", "fbr"];
const TONE = { red: "bg-rose-500", amber: "bg-amber-500", blue: "bg-sky-500" };

type Data = { tasks: Task[]; counts: Record<string, number> };

const TasksContext = createContext<{ data: Data | null; load: () => void }>({ data: null, load: () => {} });

/** Loads today's tasks once for the whole app (fresh on every page change and every 2 minutes). */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<Data | null>(null);
  const last = useRef(0);
  const load = useCallback(() => {
    last.current = Date.now();
    api<Data>("/api/tasks")
      .then(setData)
      .catch(() => {});
  }, []);
  // On a page change only when the list is older than 30 seconds (it reads the whole udhaar ledger).
  useEffect(() => {
    if (Date.now() - last.current > 30_000) load();
  }, [load, pathname]);
  useEffect(() => {
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);
  return <TasksContext.Provider value={{ data, load }}>{children}</TasksContext.Provider>;
}

/** Bell with the number of things to do today; opens the list. */
export function TasksBell({ className, light }: { className?: string; light?: boolean }) {
  const { data, load } = useContext(TasksContext);
  const [open, setOpen] = useState(false);
  const total = data ? Object.values(data.counts).reduce((a, n) => a + n, 0) : 0;
  const urgent = data?.tasks.some((t) => t.tone === "red");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          load();
        }}
        className={cn("relative rounded-lg p-2 transition", light ? "text-slate-600 hover:bg-slate-100" : "text-brand-800 hover:bg-brand-100", className)}
        aria-label={`Today's tasks${total ? ` (${total})` : ""}`}
        title="Today's tasks"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className={cn("absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white", urgent ? "bg-rose-600" : "bg-amber-500")}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      <TasksPanel open={open} onClose={() => setOpen(false)} data={data} onChanged={load} />
    </>
  );
}

function TasksPanel({ open, onClose, data, onChanged }: { open: boolean; onClose: () => void; data: Data | null; onChanged: () => void }) {
  const { settings } = useSession();
  const toast = useToast();
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSent(new Set());
  }, [open]);
  const shop = settings?.shopName ?? "";
  const shopPhone = settings?.phone;

  async function whatsapp(t: Task) {
    const w = t.wa!;
    const phone = waNumber(w.phone);
    if (!phone) return toast.error("This mobile number is not a valid WhatsApp number.");
    if (w.kind === "installment") {
      openWhatsApp(phone, installmentMessage("reminder", { name: w.name, planNo: w.planNo, items: w.items, amount: w.amount, dueDate: w.dueDate, overdue: w.overdue, balance: w.balance, shop, shopPhone }));
      await api(w.remindUrl, { method: "POST" }).catch(() => {});
    } else if (w.kind === "repair") {
      openWhatsApp(phone, repairMessage("ready", { name: w.name, jobNo: w.jobNo, device: w.device, problem: w.problem, total: w.total, paid: w.paid, balance: w.balance, shop, shopPhone }));
    } else {
      openWhatsApp(phone, reminderMessage(settings?.waTemplate, { name: w.name, amount: w.amount, shop, shopPhone }));
      await api("/api/reminders", { body: { partyId: w.partyId, kind: "reminder" } }).catch(() => {});
    }
    setSent((s) => new Set(s).add(t.id));
    onChanged();
  }

  const groups = ORDER.map((g) => ({ g, items: data?.tasks.filter((t) => t.group === g) ?? [], count: data?.counts[g] ?? 0 })).filter((x) => x.items.length);
  return (
    <Modal open={open} onClose={onClose} title="Today's tasks" size="md">
      {!data ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="py-10 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <p className="mt-3 font-semibold text-slate-800">Nothing waiting. Well done!</p>
          <p className="text-sm text-slate-500">Late installments, phones ready, low balances and udhaar to remind show up here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(({ g, items, count }) => {
            const G = GROUPS[g];
            return (
              <section key={g}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <G.icon className="h-4 w-4" /> {G.label}
                  {count > items.length && <span className="font-medium normal-case text-slate-400">(first {items.length} of {count})</span>}
                </h3>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {items.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TONE[t.tone])} />
                      <Link href={t.href} onClick={onClose} className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                        {t.detail && <div className="text-xs text-slate-500">{t.detail}</div>}
                      </Link>
                      {t.wa &&
                        (sent.has(t.id) ? (
                          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" /> Sent
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => whatsapp(t)}
                            className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                            aria-label={`WhatsApp: ${t.title}`}
                          >
                            <MessageCircle className="h-4 w-4" /> WhatsApp
                          </button>
                        ))}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Red = needs attention now · amber = today · blue = waiting for the customer
          </p>
        </div>
      )}
    </Modal>
  );
}
