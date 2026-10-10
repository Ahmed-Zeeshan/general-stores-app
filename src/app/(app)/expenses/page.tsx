"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useCan } from "@/components/session";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { api, formatDate, PAYMENT_LABELS, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

type Expense = { _id: string; category: string; amount: number; method?: string; note?: string; date: string; user?: { name: string } };

export default function ExpensesPage() {
  const toast = useToast();
  const can = useCan();
  const confirm = useConfirm();
  const [range, setRange] = useState({ from: todayISO(-29), to: todayISO() });
  const [list, setList] = useState<Expense[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "Electricity", amount: "", note: "", date: todayISO(), method: "cash" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<Expense[]>(`/api/expenses?from=${range.from}&to=${range.to}`).then(setList).catch((e) => toast.error(e.message));
  }, [range, toast]);
  useEffect(load, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/expenses", { body: { ...form, amount: Number(form.amount) } });
      toast.success("Expense added");
      setOpen(false);
      setForm({ category: form.category, amount: "", note: "", date: todayISO(), method: form.method });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(x: Expense) {
    const ok = await confirm({
      title: "Delete this expense?",
      tone: "danger",
      icon: "delete",
      details: [
        { label: "Category", value: x.category },
        { label: "Date", value: formatDate(x.date) },
        ...(x.note ? [{ label: "Note", value: x.note }] : []),
        { label: "Amount", value: formatPKR(x.amount), strong: true },
      ],
      message: "Reports and profit will be recalculated without it.",
      confirmLabel: "Delete expense",
    });
    if (!ok) return;
    try {
      await api(`/api/expenses/${x._id}`, { method: "DELETE" });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const total = list?.reduce((s, x) => s + x.amount, 0) ?? 0;
  const byCat = Object.entries(
    (list ?? []).reduce<Record<string, number>>((m, x) => ({ ...m, [x.category]: (m[x.category] ?? 0) + x.amount }), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader
        title="Expenses"
        urdu="اخراجات"
        subtitle="Rent, bills, salaries and other shop costs"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add expense</Button>}
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <StatCard label="Total expenses" value={formatPKR(total)} icon={<Wallet className="h-5 w-5" />} tone="amber" hint={`${list?.length ?? 0} entries`} />
        <Card className="p-5 lg:col-span-2">
          <p className="mb-3 text-sm font-medium text-slate-500">By category</p>
          <div className="flex flex-wrap gap-2">
            {byCat.length === 0 && <span className="text-sm text-slate-400">No expenses yet</span>}
            {byCat.map(([c, v]) => (
              <span key={c} className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm">
                <span className="text-slate-500">{c}:</span> <b className="text-slate-800">{formatPKR(v)}</b>
              </span>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <div className="border-b border-slate-100 p-4">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
        </div>
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState icon={<Wallet className="h-8 w-8" />} title="No expenses in this period" action={<Button onClick={() => setOpen(true)}>Add expense</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Note</Th>
                <Th className="text-right">Amount</Th>
                {can.owner && <Th />}
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x._id}>
                  <Td className="text-slate-500">{formatDate(x.date)}</Td>
                  <Td className="font-medium">{x.category}</Td>
                  <Td className="text-slate-500">
                    {x.note}
                    {x.method && x.method !== "cash" && <span className="ml-1 text-xs text-slate-400">({PAYMENT_LABELS[x.method] ?? x.method})</span>}
                  </Td>
                  <Td className="text-right font-bold">{formatPKR(x.amount)}</Td>
                  {can.owner && (
                    <Td className="text-right">
                      <button onClick={() => remove(x)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add expense" size="sm">
        <form onSubmit={save} className="space-y-4">
          <Field label="What for?">
            <div className="grid grid-cols-2 gap-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, category: c })}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold ${form.category === c ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Amount (Rs)">
            <Input required autoFocus type="number" inputMode="decimal" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="h-12 text-xl font-bold" />
          </Field>
          <Field label="Paid from" hint="Cash from the drawer is taken off the day's expected cash">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} aria-label="Paid from">
              <option value="cash">Cash drawer</option>
              <option value="bank">Bank transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
              <option value="card">Card</option>
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Note (optional)">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={saving}>Save expense</Button>
        </form>
      </Modal>
    </div>
  );
}
