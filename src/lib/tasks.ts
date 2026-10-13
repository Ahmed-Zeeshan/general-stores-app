import { addDays, startOfDay } from "./api";
import { branchStock, type BranchContext } from "./branches";
import { withState, type PlanLean } from "./installments";
import { round2 } from "./money";
import { OPEN } from "./repairs";
import { udhaarReport } from "./udhaar";
import { InstallmentPlan, Product, Repair, Sale, Shift, StockBatch, Tenant, Wallet } from "@/models";

/** A WhatsApp message the screen builds and opens with one tap (texts live in lib/whatsapp). */
export type TaskWa =
  | { kind: "installment"; phone: string; name: string; planNo: string; items?: string; amount: number; dueDate?: string | Date | null; overdue: number; balance: number; remindUrl: string }
  | { kind: "repair"; phone: string; name: string; jobNo: string; device: string; problem: string; total: number; paid: number; balance: number }
  | { kind: "udhaar"; phone: string; name: string; amount: number; partyId: string };

export type Task = {
  id: string;
  group: "drawer" | "installments" | "repairs" | "wallets" | "stock" | "udhaar" | "fbr";
  tone: "red" | "amber" | "blue";
  title: string;
  detail?: string;
  href: string;
  wa?: TaskWa;
};

const DAY = 864e5;
const PER_GROUP = 15;

/**
 * Everything that needs doing today in one list: the drawer, late and due installments, repairs to
 * hand over or running late, low SIM / wallet balances, stock running out or expiring, customers to
 * remind about udhaar and bills not yet sent to FBR. Only the features the shop uses are checked.
 */
export async function todaysTasks(ctx: BranchContext, now = new Date()): Promise<{ tasks: Task[]; counts: Record<string, number> }> {
  const { tid, branchId, user } = ctx;
  const manage = user.role === "owner" || user.role === "manager";
  const tenant = (await Tenant.findById(tid).select("modules fbrEnabled").lean()) as { modules?: Record<string, boolean>; fbrEnabled?: boolean } | null;
  const m = tenant?.modules ?? {};
  const today = startOfDay(now);
  const tasks: Task[] = [];
  const counts: Record<string, number> = {};
  const add = (group: Task["group"], list: Task[], total = list.length) => {
    counts[group] = total;
    tasks.push(...list.slice(0, PER_GROUP));
  };

  const [shift, plans, repairs, wallets, products, expiring, udhaar, fbrPending] = await Promise.all([
    Shift.findOne({ tenant: tid, branch: branchId, status: "open" }).select("openedAt").lean(),
    m.installments ? InstallmentPlan.find({ tenant: tid, branch: branchId, status: "active" }).select("-payments").lean() : [],
    m.repairs ? Repair.find({ tenant: tid, branch: branchId, status: { $in: OPEN } }).select("jobNo customerName customerPhone deviceName problem status promisedAt readyAt total paid creditAmount").lean() : [],
    m.wallets ? Wallet.find({ tenant: tid, branch: branchId, active: true, lowAlert: { $gt: 0 } }).select("name balance lowAlert").lean() : [],
    Product.find({ tenant: tid, active: true, lowStockAlert: { $gt: 0 } }).select("name lowStockAlert trackSerial").lean(),
    StockBatch.countDocuments({ tenant: tid, branch: branchId, qty: { $gt: 0.0005 }, expiryDate: { $ne: null, $lte: addDays(now, 7) } }),
    udhaarReport(tid, now),
    user.role === "owner" && tenant?.fbrEnabled ? Sale.countDocuments({ tenant: tid, branch: branchId, fbrStatus: { $in: ["pending", "failed"] } }) : 0,
  ]);

  // Cash drawer
  if (!shift) add("drawer", [{ id: "drawer-open", group: "drawer", tone: "amber", title: "Open the cash drawer", detail: "Count the cash in the drawer to start the day", href: "/drawer" }]);
  else if (shift.openedAt < today)
    add("drawer", [{ id: "drawer-close", group: "drawer", tone: "red", title: "Close the old day", detail: `The drawer is open since ${dateText(shift.openedAt)} — count the cash and close it`, href: "/drawer" }]);

  // Installments
  if (m.installments) {
    const states = (plans as unknown as PlanLean[]).map((p) => withState(p, now));
    const late = states.filter((p) => p.lateCount > 0).sort((a, b) => b.daysLate - a.daysLate);
    const due = states.filter((p) => p.dueToday && !p.lateCount);
    const list = [...late, ...due].map(
      (p): Task => ({
        id: `qst-${p._id}`,
        group: "installments",
        tone: p.lateCount ? "red" : "amber",
        title: p.lateCount ? `${p.customerName}: Rs ${fmt(p.overdue)} late` : `${p.customerName}: installment due today`,
        detail: p.lateCount
          ? `${p.planNo} · ${p.lateCount} installment${p.lateCount > 1 ? "s" : ""}, ${p.daysLate} days${p.lastReminderAt ? ` · reminded ${ago(p.lastReminderAt, now)}` : " · not reminded yet"}`
          : `${p.planNo} · Rs ${fmt(p.next?.amount ?? 0)}`,
        href: `/installments/${p._id}`,
        ...(p.customerPhone
          ? {
              wa: {
                kind: "installment",
                phone: p.customerPhone,
                name: p.customerName,
                planNo: p.planNo,
                items: p.itemsText && p.itemsText.length <= 60 ? p.itemsText : undefined,
                amount: p.next?.amount ?? 0,
                dueDate: p.next?.dueDate,
                overdue: p.overdue,
                balance: p.balance,
                remindUrl: `/api/installments/${p._id}/remind`,
              },
            }
          : {}),
      }),
    );
    add("installments", list);
  }

  // Repairs: ready but not collected, and late
  if (m.repairs) {
    const ready = repairs.filter((r) => r.status === "ready");
    const late = repairs.filter((r) => r.status !== "ready" && r.promisedAt && r.promisedAt < now);
    const list = [
      ...late.map(
        (r): Task => ({
          id: `job-late-${r._id}`,
          group: "repairs",
          tone: "red",
          title: `${r.deviceName} (${r.customerName}) is late`,
          detail: `${r.jobNo} · promised ${dateText(r.promisedAt!)}`,
          href: `/repairs/${r._id}`,
        }),
      ),
      ...ready.map((r): Task => {
        const balance = round2(Math.max(0, (r.total ?? 0) - (r.paid ?? 0) - (r.creditAmount ?? 0)));
        return {
          id: `job-ready-${r._id}`,
          group: "repairs",
          tone: "blue",
          title: `${r.deviceName} ready for ${r.customerName}`,
          detail: `${r.jobNo}${r.readyAt ? ` · ready ${ago(r.readyAt, now)}` : ""}${balance ? ` · Rs ${fmt(balance)} to collect` : ""}`,
          href: `/repairs/${r._id}`,
          wa: { kind: "repair", phone: r.customerPhone, name: r.customerName, jobNo: r.jobNo, device: r.deviceName, problem: r.problem, total: r.total ?? 0, paid: r.paid ?? 0, balance },
        };
      }),
    ];
    add("repairs", list);
  }

  // SIM / wallet balances
  if (m.wallets) {
    const low = wallets.filter((w) => (w.balance ?? 0) < (w.lowAlert ?? 0));
    add(
      "wallets",
      low.map((w) => ({ id: `wallet-${w._id}`, group: "wallets", tone: "amber", title: `Top up ${w.name}`, detail: `Balance Rs ${fmt(w.balance ?? 0)} (warn below Rs ${fmt(w.lowAlert ?? 0)})`, href: "/wallets" })),
    );
  }

  // Stock running out (IMEI phones are counted by their units, also via branch stock) and expiring lots
  const levels = await branchStock(tid, branchId, products.map((p) => p._id));
  const low = products.filter((p) => (levels.get(String(p._id)) ?? 0) <= p.lowStockAlert);
  const stock: Task[] = [];
  if (low.length)
    stock.push({
      id: "stock-low",
      group: "stock",
      tone: low.some((p) => (levels.get(String(p._id)) ?? 0) <= 0) ? "red" : "amber",
      title: `${low.length} item${low.length > 1 ? "s" : ""} running low`,
      detail: low
        .slice(0, 4)
        .map((p) => p.name)
        .join(", ") + (low.length > 4 ? "…" : ""),
      href: manage ? "/reorder" : "/products?filter=low",
    });
  if (expiring) stock.push({ id: "stock-expiry", group: "stock", tone: "amber", title: `${expiring} lot${expiring > 1 ? "s" : ""} expiring within 7 days`, detail: "Sell first or write off", href: manage ? "/expiry?within=7" : "/products?filter=expiring" });
  add("stock", stock);

  // Udhaar: overdue more than 30 days and not reminded in the last 7 days
  const toRemind = udhaar.filter((r) => r.daysOverdue > 30 && r.phone && (!r.lastRemindedAt || now.getTime() - r.lastRemindedAt.getTime() > 7 * DAY)).sort((a, b) => b.balance - a.balance);
  add(
    "udhaar",
    toRemind.map((r) => ({
      id: `udhaar-${r._id}`,
      group: "udhaar",
      tone: r.daysOverdue > 90 ? "red" : "amber",
      title: `Remind ${r.name}: Rs ${fmt(r.balance)}`,
      detail: `Oldest udhaar ${r.daysOverdue} days${r.lastRemindedAt ? ` · last reminder ${ago(r.lastRemindedAt, now)}` : " · never reminded"}`,
      href: `/customers/${r._id}`,
      wa: { kind: "udhaar", phone: r.phone!, name: r.name, amount: r.balance, partyId: String(r._id) },
    })),
  );

  if (fbrPending) add("fbr", [{ id: "fbr", group: "fbr", tone: "amber", title: `${fbrPending} bill${fbrPending > 1 ? "s" : ""} not sent to FBR`, detail: "Settings → FBR → Send pending bills", href: "/settings" }]);

  return { tasks, counts };
}

const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(round2(n));
const dateText = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(d);
function ago(d: Date | string, now: Date) {
  const days = Math.floor((now.getTime() - new Date(d).getTime()) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
