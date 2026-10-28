"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Banknote, CheckCircle2, FileText, Lock, LockOpen, Printer, Receipt } from "lucide-react";
import { DayCloseWhatsApp } from "@/components/day-summary";
import { Badge, Button, Card, cn, Count, EmptyState, Field, Input, Modal, PageHeader, Segmented, Spinner, StatCard, Table, Td, Textarea, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { BranchFilter } from "@/components/branch-filter";
import { useCan, useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { api, formatDate, todayISO } from "@/lib/client";
import { getHeld, getOutbox } from "@/lib/offline";
import { formatPKR, round2 } from "@/lib/money";
import { useT } from "@/lib/i18n";

type Movement = { kind: "in" | "out"; amount: number; reason?: string; at: string; userName?: string };
type Shift = {
  _id: string;
  shiftNo: string;
  branchName?: string;
  status: "open" | "closed";
  openedAt: string;
  openedByName?: string;
  openingCash: number;
  movements: Movement[];
  closedAt?: string;
  closedByName?: string;
  countedCash?: number;
  expectedCash?: number;
  difference?: number;
  floatLeft?: number;
  removedAtClose?: number;
  expectedOpening?: number;
  openingDifference?: number;
  /** Offline bills / refunds of this session that arrived after the close. */
  late?: { kind: "sale" | "return"; cash: number }[];
};
type Summary = {
  bills: number;
  sales: number;
  returns: number;
  expectedCash: number;
  cashFlow: { label: string; amount: number }[];
  salesByMethod: { method: string; total: number }[];
};
type Current = {
  shift: Shift | null;
  summary?: Summary | null;
  branch: { _id: string; name: string };
  lastClose?: { shiftNo: string; closedAt: string; floatLeft?: number; countedCash?: number } | null;
  /** Bills made today while no drawer was open. */
  unlinked?: { bills: number; cash: number };
};

/** Opened before today: the drawer was not closed at the end of a day. */
const openSinceEarlierDay = (openedAt: string) => new Date(openedAt).toDateString() !== new Date().toDateString();
/** Sales History filtered to one drawer session. */
const billsHref = (s: Pick<Shift, "_id" | "openedAt" | "closedAt">) =>
  `/sales?shift=${s._id}&from=${todayISO(0, new Date(s.openedAt))}&to=${todayISO(0, s.closedAt ? new Date(s.closedAt) : new Date())}`;

const NOTES = [5000, 1000, 500, 100, 50, 20, 10];

function diffBadge(diff: number | undefined, tr: ReturnType<typeof useT>) {
  if (diff === undefined || diff === null) return null;
  if (Math.abs(diff) < 0.5) return <Badge color="green">Exact</Badge>;
  return diff < 0 ? <Badge color="red">{tr("Short {amount}", { amount: formatPKR(-diff) })}</Badge> : <Badge color="amber">{tr("Over {amount}", { amount: formatPKR(diff) })}</Badge>;
}

export default function DrawerPage() {
  const toast = useToast();
  const tr = useT();
  const can = useCan();
  const [current, setCurrent] = useState<Current | null>(null);
  const [history, setHistory] = useState<Shift[] | null>(null);
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [branch, setBranch] = useState("");
  const [move, setMove] = useState<"in" | "out" | null>(null);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<Shift | null>(null);
  const [closedSummary, setClosedSummary] = useState<Summary | null>(null);

  const load = useCallback(() => {
    api<Current>("/api/shifts/current").then(setCurrent).catch((e) => toast.error(e.message));
    api<Shift[]>(`/api/shifts?from=${range.from}&to=${range.to}&branch=${branch}`).then(setHistory).catch((e) => toast.error(e.message));
  }, [range, branch, toast]);
  useEffect(load, [load]);

  const shift = current?.shift;

  return (
    <div>
      <PageHeader title="Cash Drawer" urdu="کیش دراز" subtitle="Open the day with the cash in the drawer, close it by counting — the Z report shows if anything is short" />

      {!current ? (
        <Spinner />
      ) : !shift ? (
        <OpenDrawer branchName={current.branch.name} lastClose={current.lastClose ?? null} onOpened={load} />
      ) : (
        <Card className="overflow-hidden">
          {openSinceEarlierDay(shift.openedAt) && (
            <div className="flex items-start gap-2 bg-amber-50 px-6 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{tr("This drawer has been open since {date} — the day was not closed. Count the cash and close it, then open today's drawer.", { date: formatDate(shift.openedAt) })}</span>
            </div>
          )}
          <div className="flex flex-col gap-4 bg-linear-to-br from-emerald-700 to-emerald-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-emerald-100">
                <LockOpen className="h-4 w-4" /> {tr("Drawer open")} · {shift.branchName} · {shift.shiftNo}
              </div>
              <div className="mt-1 text-2xl font-bold">{tr("Since {date}", { date: formatDate(shift.openedAt, true) })}</div>
              <div className="text-sm text-emerald-100">{tr("Opened by {name} with {amount}", { name: shift.openedByName ?? "", amount: formatPKR(shift.openingCash) })}</div>
              {shift.openingDifference !== undefined && (
                <div className="mt-1 inline-flex rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-100">
                  {tr(shift.openingDifference < 0 ? "{amount} less than the last close left in the drawer" : "{amount} more than the last close left in the drawer", { amount: formatPKR(Math.abs(shift.openingDifference)) })}
                </div>
              )}
            </div>
            {current.summary ? (
              <div className="sm:text-right">
                <div className="text-sm text-emerald-100">{tr("Cash that should be in the drawer")}</div>
                <div className="text-4xl font-extrabold">{formatPKR(current.summary.expectedCash)}</div>
              </div>
            ) : (
              <p className="max-w-xs text-sm text-emerald-100">{tr("The expected amount is shown after you count the cash and close the day.")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            <Button variant="outline" icon={<ArrowDownCircle className="h-4 w-4 text-emerald-600" />} onClick={() => setMove("in")}>Cash in</Button>
            <Button variant="outline" icon={<ArrowUpCircle className="h-4 w-4 text-rose-600" />} onClick={() => setMove("out")}>Cash out</Button>
            <Link href={billsHref(shift)}>
              <Button variant="outline" icon={<Receipt className="h-4 w-4" />}>Bills in this drawer</Button>
            </Link>
            {can.manage && (
              <a href={`/receipt/shift/${shift._id}`} target="_blank" rel="noreferrer">
                <Button variant="outline" icon={<FileText className="h-4 w-4" />}>X report (so far)</Button>
              </a>
            )}
            <Button className="sm:ml-auto" icon={<Lock className="h-4 w-4" />} onClick={() => setClosing(true)}>Close day</Button>
          </div>
          {current.summary && (
            <div className="grid gap-5 border-t border-slate-100 p-4 lg:grid-cols-5">
              <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-1">
                <StatCard
                  label="Sales"
                  value={formatPKR(current.summary.sales)}
                  icon={<Banknote className="h-4 w-4" />}
                  tone="green"
                  hint={<><Count n={current.summary.bills} one="{n} bill" many="{n} bills" />{current.summary.returns ? ` · ${tr("{amount} returned", { amount: formatPKR(current.summary.returns) })}` : ""}</>}
                />
                <StatCard
                  label="Cash sales"
                  value={formatPKR(current.summary.cashFlow.find((x) => x.label === "Cash sales")?.amount ?? 0)}
                  icon={<ArrowDownCircle className="h-4 w-4" />}
                  tone="blue"
                  hint={current.summary.sales > 0 ? tr("of {amount} total sales", { amount: formatPKR(current.summary.sales) }) : undefined}
                />
              </div>
              <div className="lg:col-span-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{tr("Cash flow so far")}</h3>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
                  {current.summary.cashFlow
                    .filter((x) => Math.abs(x.amount) >= 0.5)
                    .map((x) => {
                      const opening = x.label === "Opening cash";
                      return (
                        <li key={x.label} className="flex items-center justify-between gap-3 px-3.5 py-2">
                          <span className="text-slate-600">{tr(x.label)}</span>
                          <b className={cn("shrink-0 tabular-nums", opening ? "text-slate-800" : x.amount < 0 ? "text-rose-600" : "text-emerald-600")}>
                            {opening ? "" : x.amount < 0 ? "− " : "+ "}
                            {formatPKR(Math.abs(x.amount))}
                          </b>
                        </li>
                      );
                    })}
                  <li className="flex items-center justify-between gap-3 bg-slate-50 px-3.5 py-2.5 font-bold text-slate-900">
                    <span>{tr("Should be in drawer")}</span>
                    <span className="shrink-0 tabular-nums">{formatPKR(current.summary.expectedCash)}</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
          {shift.movements.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">{tr("Cash in / out")}</h3>
              <ul className="space-y-1 text-sm">
                {shift.movements.map((m, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-slate-600">
                      {formatDate(m.at, true)} · {m.reason} {m.userName && <span className="text-slate-400">· {m.userName}</span>}
                    </span>
                    <b className={m.kind === "in" ? "text-emerald-700" : "text-rose-600"}>
                      {m.kind === "in" ? "+" : "−"}
                      {formatPKR(m.amount)}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {current && (current.unlinked?.bills ?? 0) > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <b>{tr("{n} bills today were made while the drawer was closed", { n: current.unlinked!.bills })}</b>
            {current.unlinked!.cash > 0 && <> · {tr("{amount} cash", { amount: formatPKR(current.unlinked!.cash) })}</>}
            <div className="mt-0.5 text-amber-800">
              {tr("Their cash is not in any drawer count.")}
              {can.owner ? <> {tr("To stop this, switch on “Make bills only when the cash drawer is open” in Settings.")}</> : null}
            </div>
          </div>
        </div>
      )}

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-bold text-slate-900">{tr("Day closes")}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <DateRange from={range.from} to={range.to} onChange={setRange} />
            <BranchFilter value={branch} onChange={setBranch} />
          </div>
        </div>
        {!history ? (
          <Spinner />
        ) : history.length === 0 ? (
          <EmptyState icon={<Banknote className="h-8 w-8" />} title="No drawer sessions in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Shift</Th>
                <Th>Opened</Th>
                <Th>Closed</Th>
                <Th className="text-right">Opening</Th>
                <Th className="text-right">Expected</Th>
                <Th className="text-right">Counted</Th>
                <Th>Result</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h._id}>
                  <Td>
                    <div className="font-semibold text-slate-800">{h.shiftNo}</div>
                    <div className="text-xs text-slate-400">{h.branchName}</div>
                  </Td>
                  <Td className="text-slate-500">
                    {formatDate(h.openedAt, true)}
                    <div className="text-xs">{h.openedByName}</div>
                  </Td>
                  <Td className="text-slate-500">
                    {h.closedAt ? formatDate(h.closedAt, true) : <Badge color="green">Open</Badge>}
                    {h.closedByName && <div className="text-xs">{h.closedByName}</div>}
                  </Td>
                  <Td className="text-right">
                    {formatPKR(h.openingCash)}
                    {h.openingDifference !== undefined && <div className="text-xs font-semibold text-amber-700">{h.openingDifference < 0 ? "−" : "+"}{formatPKR(Math.abs(h.openingDifference))}</div>}
                  </Td>
                  <Td className="text-right">{h.expectedCash !== undefined && h.status === "closed" ? formatPKR(h.expectedCash) : "—"}</Td>
                  <Td className="text-right font-semibold">{h.countedCash !== undefined ? formatPKR(h.countedCash) : "—"}</Td>
                  <Td>
                    {h.status === "closed" && diffBadge(h.difference, tr)}
                    {h.status === "closed" && (h.late?.length ?? 0) > 0 && (
                      <div className="mt-1 text-xs text-slate-500">
                        {tr("{n} offline bills arrived later", { n: h.late!.length })}: {diffBadge((h.difference ?? 0) - h.late!.reduce((a, x) => a + (x.kind === "sale" ? x.cash : -x.cash), 0), tr)}
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                    <Link href={billsHref(h)}>
                      <Button size="sm" variant="ghost" icon={<Receipt className="h-4 w-4" />}>Bills</Button>
                    </Link>
                    {(h.status === "closed" || can.manage) && (
                      <a href={`/receipt/shift/${h._id}`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />}>{h.status === "closed" ? "Z report" : "X report"}</Button>
                      </a>
                    )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {shift && <MoveModal shiftId={shift._id} kind={move} onClose={() => setMove(null)} onSaved={() => { setMove(null); load(); }} />}
      {shift && (
        <CloseModal
          shift={shift}
          open={closing}
          onClose={() => setClosing(false)}
          onClosed={(s) => {
            setClosing(false);
            setClosedSummary(current?.summary ?? null);
            setClosed(s);
            load();
          }}
        />
      )}
      <Modal open={!!closed} onClose={() => setClosed(null)} title="Day closed" size="sm">
        {closed && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-brand-500" />
            <p className="mt-2 text-sm text-slate-500">{closed.shiftNo} · {closed.branchName}</p>
            <div className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-left text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{tr("Should be in drawer")}</span><b>{formatPKR(closed.expectedCash ?? 0)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">{tr("Counted")}</span><b>{formatPKR(closed.countedCash ?? 0)}</b></div>
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-1.5"><span className="font-semibold text-slate-700">{tr("Result")}</span>{diffBadge(closed.difference, tr)}</div>
              {closed.floatLeft !== undefined && (
                <>
                  <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5"><span className="text-slate-500">{tr("Kept in drawer for next day")}</span><b>{formatPKR(closed.floatLeft)}</b></div>
                  {(closed.removedAtClose ?? 0) > 0 && <div className="flex justify-between"><span className="text-slate-500">{tr("Taken out (bank / owner)")}</span><b>{formatPKR(closed.removedAtClose!)}</b></div>}
                </>
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/receipt/shift/${closed._id}?print=1`, "_blank")}>Z report</Button>
              <Button onClick={() => setClosed(null)}>Done</Button>
              <DayCloseWhatsApp shift={closed} summary={closedSummary} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function OpenDrawer({ branchName, lastClose, onOpened }: { branchName: string; lastClose: Current["lastClose"]; onOpened: () => void }) {
  const toast = useToast();
  const tr = useT();
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // The float the last close left: the opening count should match it.
  const left = lastClose?.floatLeft;
  const mismatch = left !== undefined && cash !== "" && Math.abs(Number(cash) - left) >= 0.5 ? round2(Number(cash) - left) : null;
  async function open(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/shifts", { body: { openingCash: Number(cash) || 0, note: note || undefined } });
      toast.success(tr("Cash drawer opened"));
      onOpened();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Lock className="h-7 w-7" />
        </div>
        <form onSubmit={open} className="grid flex-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="text-lg font-bold text-slate-900">{tr("Start the day — {branch}", { branch: branchName })}</h2>
            <p className="text-sm text-slate-500">{tr("Count the cash already in the drawer (change float) and enter it below.")}</p>
          </div>
          <Field
            label="Cash in drawer now (Rs)"
            hint={
              left !== undefined
                ? tr("{shift} left {amount} in the drawer", { shift: lastClose!.shiftNo, amount: formatPKR(left) })
                : lastClose?.countedCash !== undefined
                  ? tr("Last day closed with {amount}", { amount: formatPKR(lastClose.countedCash) })
                  : undefined
            }
          >
            <Input autoFocus required type="number" inputMode="decimal" min="0" step="any" value={cash} onChange={(e) => setCash(e.target.value)} className="h-12 text-xl font-bold" aria-label="Opening cash" />
          </Field>
          {mismatch !== null && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {tr(mismatch < 0 ? "{amount} less than the last close left in the drawer. Count again — if it is right, open anyway and the owner will see it." : "{amount} more than the last close left in the drawer. Count again — if it is right, open anyway and the owner will see it.", { amount: formatPKR(Math.abs(mismatch)) })}
            </p>
          )}
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" loading={saving} icon={<LockOpen className="h-5 w-5" />}>Open drawer</Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

function MoveModal({ shiftId, kind, onClose, onSaved }: { shiftId: string; kind: "in" | "out" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const tr = useT();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAmount("");
    setReason("");
  }, [kind]);
  if (!kind) return null;
  const presets = kind === "in" ? ["Change from bank", "Owner added cash"] : ["Bank deposit", "Owner took cash", "Change given to other counter"];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/shifts/${shiftId}/movement`, { body: { kind, amount: Number(amount), reason } });
      toast.success(tr(kind === "in" ? "Cash in recorded" : "Cash out recorded"));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={kind === "in" ? "Cash put into drawer" : "Cash taken out of drawer"} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Amount (Rs)">
          <Input autoFocus required type="number" inputMode="decimal" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 text-2xl font-bold" aria-label="Amount" />
        </Field>
        <Field label="Reason">
          <Input required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} aria-label="Reason" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} type="button" onClick={() => setReason(tr(p))} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">{tr(p)}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{tr("Sales, refunds, udhaar payments and expenses are counted automatically — use this only for other cash.")}</p>
        <Button type="submit" size="lg" className="w-full" loading={saving}>Save</Button>
      </form>
    </Modal>
  );
}

function CloseModal({ shift, open, onClose, onClosed }: { shift: Shift; open: boolean; onClose: () => void; onClosed: (s: Shift) => void }) {
  const toast = useToast();
  const tr = useT();
  const confirm = useConfirm();
  const [mode, setMode] = useState<"notes" | "total">("notes");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const { user, branch } = useSession();
  useEffect(() => {
    if (open) {
      setCounts({});
      setCoins("");
      setTotal("");
      setNote("");
      setKeep("");
      setProblem("");
    }
  }, [open]);
  // Bills on this computer that are not in the count yet.
  const waiting = useMemo(() => {
    if (!open || !user.tenantId) return { held: 0, offline: 0 };
    return { held: getHeld(user.tenantId, branch?._id ?? "").length, offline: getOutbox(user.tenantId).length };
  }, [open, user.tenantId, branch?._id]);
  const counted = useMemo(
    () => (mode === "notes" ? round2(NOTES.reduce((a, n) => a + n * (Number(counts[n]) || 0), 0) + (Number(coins) || 0)) : round2(Number(total) || 0)),
    [mode, counts, coins, total],
  );
  // The float kept for tomorrow: by default the same as this morning's (never more than counted).
  const keepNum = keep === "" ? Math.min(counted, shift.openingCash) : Math.max(0, Number(keep) || 0);
  const takenOut = round2(counted - keepNum);
  if (!open) return null;

  async function save() {
    setProblem("");
    if (keepNum > counted + 0.004) {
      setProblem(tr("The cash kept in the drawer cannot be more than the cash counted."));
      return;
    }
    const ok = await confirm({
      title: tr("Close the day?"),
      message: tr("After closing, the counted cash and the Z report are saved and cannot be changed. Open a new day before the next bill if you use the drawer."),
      details: [
        { label: tr("Cash counted"), value: formatPKR(counted), strong: true },
        { label: tr("Kept in drawer for next day"), value: formatPKR(keepNum) },
        ...(takenOut > 0 ? [{ label: tr("Taken out (bank / owner)"), value: formatPKR(takenOut) }] : []),
      ],
      points: [
        ...(waiting.held ? [tr("{n} bills are still on hold on this computer — they are not in this day's sales.", { n: waiting.held })] : []),
        ...(waiting.offline ? [tr("{n} offline bills on this computer have not been sent yet — connect to the internet first.", { n: waiting.offline })] : []),
      ],
      confirmLabel: tr("Close day"),
      tone: "warning",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const body =
        mode === "notes"
          ? { denominations: [...NOTES.map((n) => ({ value: n, count: Number(counts[n]) || 0 })), { value: 0, count: Number(coins) || 0 }], note: note || undefined, floatLeft: keepNum }
          : { countedCash: counted, note: note || undefined, floatLeft: keepNum };
      onClosed(await api<Shift>(`/api/shifts/${shift._id}/close`, { body }));
    } catch (err) {
      // A count far from what it should be: shown here, so the cashier can recount or write a reason.
      setProblem((err as Error).message);
      if (!/count/i.test((err as Error).message)) toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Close day — count the cash"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saving} icon={<Lock className="h-4 w-4" />} onClick={save}>Close day</Button>
        </>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "notes", label: "Count notes" },
          { value: "total", label: "Enter total" },
        ]}
      />
      {mode === "notes" ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {NOTES.map((n) => (
            <label key={n} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", Number(counts[n]) > 0 ? "border-brand-300 bg-brand-50/50" : "border-slate-200")}>
              <span className="w-14 shrink-0 text-sm font-bold text-slate-700">{n.toLocaleString("en-PK")}</span>
              <span className="text-slate-400">×</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={counts[n] ?? ""}
                onChange={(e) => setCounts({ ...counts, [n]: e.target.value })}
                placeholder="0"
                aria-label={`Rs ${n} notes`}
                className="h-9 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-right font-semibold focus:border-brand-500 focus:outline-hidden"
              />
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <span className="shrink-0 text-sm font-bold text-slate-700">{tr("Coins Rs")}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={coins}
              onChange={(e) => setCoins(e.target.value)}
              placeholder="0"
              aria-label="Coins total"
              className="h-9 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-right font-semibold focus:border-brand-500 focus:outline-hidden"
            />
          </label>
        </div>
      ) : (
        <Field label="Total cash counted (Rs)" className="mt-4">
          <Input autoFocus type="number" inputMode="decimal" min="0" step="any" value={total} onChange={(e) => setTotal(e.target.value)} className="h-14 text-2xl font-bold" aria-label="Counted cash" />
        </Field>
      )}
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white">
        <span className="text-sm text-slate-300">{tr("Cash counted")}</span>
        <span className="text-3xl font-extrabold">{formatPKR(counted)}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Keep in drawer for next day (Rs)" hint={tr("Change float for tomorrow. The rest is taken out (bank / owner).")}>
          <Input type="number" inputMode="decimal" min="0" step="any" value={keep} onChange={(e) => setKeep(e.target.value)} placeholder={String(Math.min(counted, shift.openingCash))} aria-label="Keep in drawer" />
        </Field>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">{tr("Kept in drawer")}</span><b>{formatPKR(keepNum)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">{tr("Taken out")}</span><b>{formatPKR(Math.max(0, takenOut))}</b></div>
        </div>
      </div>
      {(waiting.held > 0 || waiting.offline > 0) && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {waiting.held > 0 && <div>{tr("{n} bills are still on hold on this computer — they are not in this day's sales.", { n: waiting.held })}</div>}
            {waiting.offline > 0 && <div>{tr("{n} offline bills on this computer have not been sent yet — connect to the internet first.", { n: waiting.offline })}</div>}
          </div>
        </div>
      )}
      {problem && (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" role="alert">
          {tr(problem)}
        </p>
      )}
      <Field label={problem ? "Reason for the difference" : "Note (optional)"} className="mt-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-[60px]" aria-label="Close note" autoFocus={!!problem} />
      </Field>
    </Modal>
  );
}
