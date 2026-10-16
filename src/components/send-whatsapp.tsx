"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button, Field, Input, Modal, Spinner, Textarea } from "./ui";
import { api } from "@/lib/client";
import { billMessage, openWhatsApp, waNumber } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n";

type Shop = { shopName: string; phone?: string };
type SaleLite = {
  invoiceNo: string;
  createdAt: string;
  customerName?: string;
  items: { name: string; qty: number; unit: string; total: number; serials?: { imei: string; returned?: boolean }[]; warrantyUntil?: string }[];
  discount: number;
  total: number;
  amountPaid: number;
  creditAmount: number;
  installment?: boolean;
};

/**
 * Sends a bill on WhatsApp: the customer's number (filled in when known), the message ready to read,
 * and a link to the bill when the shop has set its public address. The message can be edited first.
 */
export function SendBillModal({ saleId, open, onClose, shop }: { saleId: string | null; open: boolean; onClose: () => void; shop: Shop }) {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !saleId) return;
    setText(null);
    setError("");
    Promise.all([api<SaleLite>(`/api/sales/${saleId}`), api<{ url: string | null; phone: string | null }>(`/api/share?kind=sale&id=${saleId}`)])
      .then(([s, share]) => {
        setPhone(share.phone ?? "");
        setLink(share.url);
        setText(
          billMessage({
            name: s.customerName,
            invoiceNo: s.invoiceNo,
            date: s.createdAt,
            items: s.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, total: i.total, imeis: (i.serials ?? []).filter((x) => !x.returned).map((x) => x.imei), warrantyUntil: i.warrantyUntil })),
            discount: s.discount,
            total: s.total,
            paid: Math.min(s.total, s.amountPaid),
            credit: s.creditAmount,
            installment: s.installment,
            shop: shop.shopName,
            shopPhone: shop.phone,
            link: share.url,
          }),
        );
      })
      .catch((e) => setError(e.message));
  }, [open, saleId, shop.shopName, shop.phone]);
  const number = waNumber(phone);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send the bill on WhatsApp"
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
          <Field label="Customer's WhatsApp number" error={phone && !number ? t("Enter a Pakistani mobile number, e.g. 0300-1234567") : undefined}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03xx-xxxxxxx" autoFocus={!phone} aria-label="Customer WhatsApp number" />
          </Field>
          <Field label="Message" hint={link ? "The link opens the bill on the customer's phone." : "Tip: set the app's public address in Settings to add a link to the bill."}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[220px] font-mono text-xs" aria-label="Message" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/** Loads the customer link of a repair / installment plan once, so WhatsApp can open straight from a click. */
export function useShareLink(kind: "repair" | "installment" | "sale", id: string | null | undefined) {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    api<{ url: string | null }>(`/api/share?kind=${kind}&id=${id}`)
      .then((r) => setLink(r.url))
      .catch(() => setLink(null));
  }, [kind, id]);
  return link;
}
