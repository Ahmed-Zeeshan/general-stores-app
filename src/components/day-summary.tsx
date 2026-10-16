"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button, Field, Input, Modal, Spinner, Textarea } from "./ui";
import { useSession } from "./session";
import { api, PAYMENT_LABELS, todayISO } from "@/lib/client";
import type { MobileReport } from "@/lib/mobile-report";
import { daySummaryMessage, dayCloseMessage, openWhatsApp, waNumber } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n";

type Report = {
  summary: { bills: number; netSales: number; returns: number; grossProfit: number; expenses: number; netProfit: number; credit: number; udhaarCollected: number };
  byMethod: { _id: string; total: number }[];
  topItems: { _id: string; total: number }[];
  mobile: MobileReport | null;
};
type ShiftRow = { shiftNo: string; branchName?: string; status: string; expectedCash?: number; countedCash?: number; difference?: number };

/** Message editor + number, then open WhatsApp (to the owner by default). */
function SendModal({ open, onClose, title, load }: { open: boolean; onClose: () => void; title: string; load: () => Promise<string> }) {
  const { settings } = useSession();
  const t = useT();
  const [phone, setPhone] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setPhone(settings?.ownerPhone || settings?.phone || "");
    setText(null);
    setError("");
    load()
      .then(setText)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const number = waNumber(phone);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!number || !text}
            icon={<MessageCircle className="h-4 w-4" />}
            onClick={() => {
              openWhatsApp(number!, text!);
              onClose();
            }}
          >
            Open WhatsApp
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : text === null ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Field label="Send to (WhatsApp)" hint="The owner's number from Settings → WhatsApp messages." error={phone && !number ? t("Enter a Pakistani mobile number") : undefined}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03xx-xxxxxxx" aria-label="Send to number" />
          </Field>
          <Field label="Message">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[260px] font-mono text-xs" aria-label="Summary message" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/** Dashboard button: today's figures for all branches as one WhatsApp message to the owner. */
export function DaySummaryButton() {
  const { settings } = useSession();
  const [open, setOpen] = useState(false);
  async function load() {
    const d = todayISO();
    const [r, shifts] = await Promise.all([api<Report>(`/api/reports?from=${d}&to=${d}&branch=all`), api<ShiftRow[]>(`/api/shifts?from=${d}&to=${d}&branch=all`)]);
    const m = r.mobile;
    return daySummaryMessage({
      shop: settings?.shopName ?? "",
      date: new Date(),
      sales: r.summary.netSales,
      bills: r.summary.bills,
      returns: r.summary.returns,
      grossProfit: r.summary.grossProfit,
      expenses: r.summary.expenses,
      netProfit: r.summary.netProfit,
      udhaarGiven: r.summary.credit,
      udhaarCollected: r.summary.udhaarCollected,
      byMethod: r.byMethod.map((x) => ({ label: PAYMENT_LABELS[x._id] ?? x._id, total: x.total })),
      drawers: shifts.map((s) => ({ shiftNo: s.shiftNo, branchName: s.branchName, status: s.status, expected: s.expectedCash, counted: s.countedCash, difference: s.difference })),
      mobile: m
        ? {
            repairsDelivered: m.repairs?.delivered,
            repairsProfit: m.repairs?.profit,
            walletEarned: m.wallets?.profit,
            walletCount: m.wallets?.count,
            installmentsCollected: m.installments?.collected,
            installmentsLate: m.installments?.overdue,
            usedBought: m.usedPhones?.count,
            usedSpent: m.usedPhones?.spent,
          }
        : undefined,
      top: r.topItems.map((t) => ({ name: t._id, total: t.total })),
    });
  }
  return (
    <>
      <Button variant="outline" size="sm" icon={<Send className="h-4 w-4 text-emerald-600" />} onClick={() => setOpen(true)}>
        Send today&apos;s summary
      </Button>
      <SendModal open={open} onClose={() => setOpen(false)} title="Today's summary on WhatsApp" load={load} />
    </>
  );
}

/** After closing the drawer: the Z report figures as a WhatsApp message to the owner. */
export function DayCloseWhatsApp({ shift, summary }: { shift: { shiftNo: string; branchName?: string; closedAt?: string; closedByName?: string; expectedCash?: number; countedCash?: number; difference?: number }; summary?: { sales: number; bills: number; salesByMethod: { method: string; total: number }[] } | null }) {
  const { settings } = useSession();
  const [open, setOpen] = useState(false);
  const load = async () =>
    dayCloseMessage({
      shop: settings?.shopName ?? "",
      branch: shift.branchName,
      shiftNo: shift.shiftNo,
      closedAt: shift.closedAt,
      closedBy: shift.closedByName,
      expected: shift.expectedCash ?? 0,
      counted: shift.countedCash ?? 0,
      difference: shift.difference ?? 0,
      sales: summary?.sales,
      bills: summary?.bills,
      byMethod: summary?.salesByMethod.map((x) => ({ label: PAYMENT_LABELS[x.method] ?? x.method, total: x.total })),
    });
  return (
    <>
      <Button variant="outline" className="col-span-2" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => setOpen(true)}>
        Send to the owner on WhatsApp
      </Button>
      <SendModal open={open} onClose={() => setOpen(false)} title="Day close on WhatsApp" load={load} />
    </>
  );
}
