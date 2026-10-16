"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, Segmented, Spinner, Table, Td, Th } from "./ui";
import { RepairStatusBadge, type RepairJob } from "./repairs";
import { useToast } from "./toast";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { plural, useT } from "@/lib/i18n";

type Overview = {
  stats: { bills: number; bought: number; avgBill: number; firstVisit: string | null; lastVisit: string | null; phones: number; inWarranty: number; openRepairs: number; installmentsLeft: number; installmentsLate: number };
  bills: { _id: string; invoiceNo: string; total: number; status: string; method: string; creditAmount: number; createdAt: string; branchName?: string; items: string }[];
  phones: { imei: string; name: string; saleId: string; invoiceNo: string; soldAt: string; returned: boolean; warrantyUntil: string | null; inWarranty: boolean }[];
  repairs: (Pick<RepairJob, "_id" | "jobNo" | "deviceName" | "problem" | "status" | "total" | "createdAt" | "warrantyUntil"> & { balance: number })[];
  installments: { _id: string; planNo: string; itemsText?: string; status: string; financed: number; paid: number; balance: number; overdue: number; lateCount: number; next: { dueDate: string; amount: number } | null; createdAt: string }[];
  usedPhones: { _id: string; buyNo: string; productName: string; imei: string; price: number; status: string; createdAt: string }[];
  modules: Record<string, boolean>;
};
type Tab = "khata" | "bills" | "phones" | "repairs" | "installments" | "points" | "used";

const METHOD: Record<string, string> = { ...PAYMENT_LABELS, split: "Split", installments: "Installments" };

/** Customer page: khata plus everything else about the customer, in tabs, with a summary on top. */
export function CustomerTabs({ id, khata, points }: { id: string; khata: React.ReactNode; points: React.ReactNode | null }) {
  const toast = useToast();
  const tr = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>("khata");
  useEffect(() => {
    api<Overview>(`/api/parties/${id}/overview`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [id, toast]);

  const s = data?.stats;
  const m = data?.modules ?? {};
  const options: { value: Tab; label: string }[] = [
    { value: "khata", label: "Khata" },
    { value: "bills", label: `Bills${s ? ` (${s.bills})` : ""}` },
    ...(m.phones || (data?.phones.length ?? 0) > 0 ? [{ value: "phones" as Tab, label: `Phones (${data?.phones.length ?? 0})` }] : []),
    ...(m.repairs ? [{ value: "repairs" as Tab, label: `Repairs (${data?.repairs.length ?? 0})` }] : []),
    ...(m.installments ? [{ value: "installments" as Tab, label: `Installments (${data?.installments.length ?? 0})` }] : []),
    ...(points ? [{ value: "points" as Tab, label: "Points" }] : []),
    ...((data?.usedPhones.length ?? 0) > 0 ? [{ value: "used" as Tab, label: `Sold to us (${data!.usedPhones.length})` }] : []),
  ];

  return (
    <div className="mt-6">
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Fact
            label="Bought in all"
            value={formatPKR(s.bought)}
            hint={`${tr(plural(s.bills, "{n} bill", "{n} bills"), { n: s.bills })}${s.bills ? ` · ${tr("avg {amount}", { amount: formatPKR(s.avgBill) })}` : ""}`}
          />
          <Fact label="Last visit" value={s.lastVisit ? formatDate(s.lastVisit) : "—"} hint={s.firstVisit ? tr("Customer since {date}", { date: formatDate(s.firstVisit) }) : tr("No bills yet")} />
          {m.phones || s.phones ? <Fact label="Phones bought" value={String(s.phones)} hint={tr("{n} in warranty", { n: s.inWarranty })} /> : null}
          {m.repairs ? <Fact label="Repairs in the shop" value={String(s.openRepairs)} /> : null}
          {m.installments ? (
            <Fact label="Installments left" value={formatPKR(s.installmentsLeft)} hint={s.installmentsLate ? tr("{amount} late", { amount: formatPKR(s.installmentsLate) }) : tr("Nothing late")} tone={s.installmentsLate ? "red" : undefined} />
          ) : null}
        </div>
      )}
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={options} />
      </div>
      {tab === "khata" ? (
        khata
      ) : tab === "points" ? (
        points
      ) : !data ? (
        <Spinner />
      ) : tab === "bills" ? (
        <Card>
          {data.bills.length === 0 ? (
            <Empty text="No bills for this customer yet." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>Items</Th>
                  <Th>Paid by</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {data.bills.map((b) => (
                  <tr key={b._id}>
                    <Td>
                      <a href={`/receipt/${b._id}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
                        {b.invoiceNo}
                      </a>
                      <div className="text-xs text-slate-500">{formatDate(b.createdAt, true)}</div>
                    </Td>
                    <Td data-long>
                      <div className="max-w-md truncate text-sm text-slate-700" title={b.items}>
                        {b.items}
                      </div>
                      {b.status !== "completed" && <Badge color={b.status === "returned" ? "red" : "amber"}>{b.status === "returned" ? "Returned" : "Part returned"}</Badge>}
                    </Td>
                    <Td>
                      {tr(METHOD[b.method] ?? b.method)}
                      {b.creditAmount > 0 && <div className="text-xs text-amber-700">{tr("{amount} udhaar", { amount: formatPKR(b.creditAmount) })}</div>}
                    </Td>
                    <Td className="text-right font-semibold">{formatPKR(b.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : tab === "phones" ? (
        <Card>
          {data.phones.length === 0 ? (
            <Empty text="No phones bought from you yet." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Phone</Th>
                  <Th>IMEI</Th>
                  <Th>Bought</Th>
                  <Th>Warranty</Th>
                </tr>
              </thead>
              <tbody>
                {data.phones.map((p) => (
                  <tr key={`${p.saleId}-${p.imei}`}>
                    <Td className="font-semibold text-slate-800">{p.name}</Td>
                    <Td className="font-mono text-sm">{p.imei}</Td>
                    <Td>
                      <a href={`/receipt/${p.saleId}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                        {p.invoiceNo}
                      </a>
                      <div className="text-xs text-slate-500">{formatDate(p.soldAt)}</div>
                    </Td>
                    <Td>
                      {p.returned ? (
                        <Badge color="slate">Returned</Badge>
                      ) : p.inWarranty ? (
                        <Badge color="green">{tr("Till {date}", { date: formatDate(p.warrantyUntil!) })}</Badge>
                      ) : p.warrantyUntil ? (
                        <Badge color="red">{tr("Ended {date}", { date: formatDate(p.warrantyUntil) })}</Badge>
                      ) : (
                        <span className="text-slate-400">{tr("None")}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : tab === "repairs" ? (
        <Card>
          {data.repairs.length === 0 ? (
            <Empty text="No repairs for this customer." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Phone & problem</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Bill / to pay</Th>
                </tr>
              </thead>
              <tbody>
                {data.repairs.map((r) => (
                  <tr key={r._id}>
                    <Td>
                      <Link href={`/repairs/${r._id}`} className="font-semibold text-brand-700 hover:underline">
                        {r.jobNo}
                      </Link>
                      <div className="text-xs text-slate-500">{formatDate(r.createdAt)}</div>
                    </Td>
                    <Td>
                      <div className="font-semibold text-slate-800">{r.deviceName}</div>
                      <div className="max-w-xs truncate text-xs text-slate-500">{r.problem}</div>
                    </Td>
                    <Td>
                      <RepairStatusBadge status={r.status} />
                      {r.warrantyUntil && new Date(r.warrantyUntil) >= new Date() && <div className="text-xs text-emerald-700">{tr("Warranty till {date}", { date: formatDate(r.warrantyUntil) })}</div>}
                    </Td>
                    <Td className="text-right">
                      <div className="font-semibold">{r.total ? formatPKR(r.total) : "—"}</div>
                      {r.balance > 0 && r.status !== "cancelled" && <div className="text-xs font-semibold text-amber-700">{tr("{amount} to pay", { amount: formatPKR(r.balance) })}</div>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : tab === "installments" ? (
        <Card>
          {data.installments.length === 0 ? (
            <Empty text="Nothing bought on installments." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Plan</Th>
                  <Th>Goods</Th>
                  <Th>Next</Th>
                  <Th className="text-right">Left</Th>
                </tr>
              </thead>
              <tbody>
                {data.installments.map((p) => (
                  <tr key={p._id}>
                    <Td>
                      <Link href={`/installments/${p._id}`} className="font-semibold text-brand-700 hover:underline">
                        {p.planNo}
                      </Link>
                      <div className="text-xs text-slate-500">{formatDate(p.createdAt)}</div>
                    </Td>
                    <Td data-long>
                      <div className="max-w-xs truncate text-sm" title={p.itemsText}>
                        {p.itemsText}
                      </div>
                    </Td>
                    <Td>
                      {p.status === "completed" ? (
                        <Badge color="green">Paid off</Badge>
                      ) : p.status === "cancelled" ? (
                        <Badge color="slate">Closed</Badge>
                      ) : p.lateCount ? (
                        <Badge color="red">{tr("{amount} late", { amount: formatPKR(p.overdue) })}</Badge>
                      ) : p.next ? (
                        <span className="text-sm">
                          {formatDate(p.next.dueDate)} · {formatPKR(p.next.amount)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right font-semibold">{p.status === "active" ? formatPKR(p.balance) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Bought from them</Th>
                <Th>IMEI</Th>
                <Th className="text-right">Paid</Th>
              </tr>
            </thead>
            <tbody>
              {data.usedPhones.map((u) => (
                <tr key={u._id}>
                  <Td>
                    <a href={`/receipt/used/${u._id}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
                      {u.buyNo}
                    </a>{" "}
                    {u.productName}
                    <div className="text-xs text-slate-500">
                      {formatDate(u.createdAt)}
                      {u.status === "cancelled" && ` · ${tr("cancelled")}`}
                    </div>
                  </Td>
                  <Td className="font-mono text-sm">{u.imei}</Td>
                  <Td className="text-right font-semibold">{formatPKR(u.price)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function Fact({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "red" }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500">{t(label)}</div>
      <div className={tone === "red" ? "text-lg font-extrabold text-rose-600" : "text-lg font-extrabold text-slate-900"}>{value}</div>
      {hint && <div className={tone === "red" ? "text-xs font-semibold text-rose-600" : "text-xs text-slate-500"}>{hint}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  const t = useT();
  return <p className="py-12 text-center text-sm text-slate-500">{t(text)}</p>;
}
