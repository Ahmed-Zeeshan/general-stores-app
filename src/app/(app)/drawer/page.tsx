"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Banknote, CheckCircle2, FileText, Lock, LockOpen, Printer } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Spinner, StatCard, Table, Td, Th, Textarea, cn } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { BranchFilter } from "@/components/branch-filter";
import { useCan } from "@/components/session";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { api, formatDate, todayISO } from "@/lib/client";
import { formatPKR, round2 } from "@/lib/money";

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
};
type Summary = {
  bills: number;
  sales: number;
  returns: number;
  expectedCash: number;
  cashFlow: { label: string; amount: number }[];
  salesByMethod: { method: string; total: number }[];
};
type Current = { shift: Shift | null; summary?: Summary | null; branch: { name: string } };

const NOTES = [5000, 1000, 500, 100, 50, 20, 10];

function diffBadge(diff?: number) {
  if (diff === undefined || diff === null) return null;
  if (Math.abs(diff) < 0.5) return <Badge color="green">Exact</Badge>;
  return diff < 0 ? <Badge color="red">Short {formatPKR(-diff)}</Badge> : <Badge color="amber">Over {formatPKR(diff)}</Badge>;
}

export default function DrawerPage() {
  const toast = useToast();
  const can = useCan();
  const [current, setCurrent] = useState<Current | null>(null);
  const [history, setHistory] = useState<Shift[] | null>(null);
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [branch, setBranch] = useState("");
  const [move, setMove] = useState<"in" | "out" | null>(null);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<Shift | null>(null);

  const load = useCallback(() => {
    api<Current>("/api/shifts/current").then(setCurrent).catch((e) => toast.error(e.message));
    api<Shift[]>(`/api/shifts?from=${range.from}&to=${range.to}&branch=${branch}`).then(setHistory).catch((e) => toast.error(e.message));
  }, [range, branch, toast]);
  useEffect(load, [load]);

  const shift = current?.shift;
  const lastClosed = history?.find((h) => h.status === "closed");

  return (
    <div>
      <PageHeader title="Cash Drawer" urdu="کیش دراز" subtitle="Open the day with the cash in the drawer, close it by counting — the Z report shows if anything is short" />

      {!current ? (
        <Spinner />
      ) : !shift ? (
        <OpenDrawer branchName={current.branch.name} suggestion={lastClosed?.countedCash} onOpened={load} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 bg-linear-to-br from-emerald-700 to-emerald-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-emerald-100">
                <LockOpen className="h-4 w-4" /> Drawer open · {shift.branchName} · {shift.shiftNo}
              </div>
              <div className="mt-1 text-2xl font-bold">Since {formatDate(shift.openedAt, true)}</div>
              <div className="text-sm text-emerald-100">Opened by {shift.openedByName} with {formatPKR(shift.openingCash)}</div>
            </div>
            {current.summary ? (
              <div className="sm:text-right">
                <div className="text-sm text-emerald-100">Cash that should be in the drawer</div>
                <div className="text-4xl font-extrabold">{formatPKR(current.summary.expectedCash)}</div>
              </div>
            ) : (
              <p className="max-w-xs text-sm text-emerald-100">The expected amount is shown after you count the cash and close the day.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            <Button variant="outline" icon={<ArrowDownCircle className="h-4 w-4 text-emerald-600" />} onClick={() => setMove("in")}>Cash in</Button>
            <Button variant="outline" icon={<ArrowUpCircle className="h-4 w-4 text-rose-600" />} onClick={() => setMove("out")}>Cash out</Button>
            {can.manage && (
              <a href={`/receipt/shift/${shift._id}`} target="_blank" rel="noreferrer">
                <Button variant="outline" icon={<FileText className="h-4 w-4" />}>X report (so far)</Button>
              </a>
            )}
            <Button className="sm:ml-auto" icon={<Lock className="h-4 w-4" />} onClick={() => setClosing(true)}>Close day</Button>
          </div>
          {current.summary && (
            <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Sales" value={formatPKR(current.summary.sales)} icon={<Banknote className="h-5 w-5" />} hint={`${current.summary.bills} bills${current.summary.returns ? ` · ${formatPKR(current.summary.returns)} returned` : ""}`} />
              {current.summary.cashFlow.slice(1, 4).map((x) => (
                <StatCard key={x.label} label={x.label} value={formatPKR(x.amount)} icon={<ArrowDownCircle className="h-5 w-5" />} tone="green" />
              ))}
            </div>
          )}
          {shift.movements.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Cash in / out</h3>
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

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-bold text-slate-900">Day closes</h2>
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
                  <Td className="text-right">{formatPKR(h.openingCash)}</Td>
                  <Td className="text-right">{h.expectedCash !== undefined && h.status === "closed" ? formatPKR(h.expectedCash) : "—"}</Td>
                  <Td className="text-right font-semibold">{h.countedCash !== undefined ? formatPKR(h.countedCash) : "—"}</Td>
                  <Td>{h.status === "closed" && diffBadge(h.difference)}</Td>
                  <Td className="text-right">
                    {(h.status === "closed" || can.manage) && (
                      <a href={`/receipt/shift/${h._id}`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />}>{h.status === "closed" ? "Z report" : "X report"}</Button>
                      </a>
                    )}
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
              <div className="flex justify-between"><span className="text-slate-500">Should be in drawer</span><b>{formatPKR(closed.expectedCash ?? 0)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Counted</span><b>{formatPKR(closed.countedCash ?? 0)}</b></div>
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-1.5"><span className="font-semibold text-slate-700">Result</span>{diffBadge(closed.difference)}</div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/receipt/shift/${closed._id}?print=1`, "_blank")}>Z report</Button>
              <Button onClick={() => setClosed(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function OpenDrawer({ branchName, suggestion, onOpened }: { branchName: string; suggestion?: number; onOpened: () => void }) {
  const toast = useToast();
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function open(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/shifts", { body: { openingCash: Number(cash) || 0, note: note || undefined } });
      toast.success("Cash drawer opened");
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
            <h2 className="text-lg font-bold text-slate-900">Start the day — {branchName}</h2>
            <p className="text-sm text-slate-500">Count the cash already in the drawer (change float) and enter it below.</p>
          </div>
          <Field label="Cash in drawer now (Rs)" hint={suggestion !== undefined ? `Last day closed with ${formatPKR(suggestion)}` : undefined}>
            <Input autoFocus required type="number" inputMode="decimal" min="0" step="any" value={cash} onChange={(e) => setCash(e.target.value)} className="h-12 text-xl font-bold" aria-label="Opening cash" />
          </Field>
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
      toast.success(kind === "in" ? "Cash in recorded" : "Cash out recorded");
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
            <button key={p} type="button" onClick={() => setReason(p)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">{p}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">Sales, refunds, udhaar payments and expenses are counted automatically — use this only for other cash.</p>
        <Button type="submit" size="lg" className="w-full" loading={saving}>Save</Button>
      </form>
    </Modal>
  );
}

function CloseModal({ shift, open, onClose, onClosed }: { shift: Shift; open: boolean; onClose: () => void; onClosed: (s: Shift) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState<"notes" | "total">("notes");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setCounts({});
      setCoins("");
      setTotal("");
      setNote("");
    }
  }, [open]);
  const counted = useMemo(
    () => (mode === "notes" ? round2(NOTES.reduce((a, n) => a + n * (Number(counts[n]) || 0), 0) + (Number(coins) || 0)) : round2(Number(total) || 0)),
    [mode, counts, coins, total],
  );
  if (!open) return null;

  async function save() {
    const ok = await confirm({
      title: "Close the day?",
      message: "After closing, the counted cash and the Z report are saved and cannot be changed. Open a new day before the next bill if you use the drawer.",
      details: [{ label: "Cash counted", value: formatPKR(counted), strong: true }],
      confirmLabel: "Close day",
      tone: "warning",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const body =
        mode === "notes"
          ? { denominations: [...NOTES.map((n) => ({ value: n, count: Number(counts[n]) || 0 })), { value: 0, count: Number(coins) || 0 }], note: note || undefined }
          : { countedCash: counted, note: note || undefined };
      onClosed(await api<Shift>(`/api/shifts/${shift._id}/close`, { body }));
    } catch (err) {
      toast.error((err as Error).message);
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
            <span className="shrink-0 text-sm font-bold text-slate-700">Coins Rs</span>
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
        <span className="text-sm text-slate-300">Cash counted</span>
        <span className="text-3xl font-extrabold">{formatPKR(counted)}</span>
      </div>
      <Field label="Note (optional)" className="mt-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-[60px]" />
      </Field>
    </Modal>
  );
}
