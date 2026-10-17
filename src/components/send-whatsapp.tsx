"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { Button, Field, Input, Modal, Segmented, Spinner, Textarea } from "./ui";
import { api } from "@/lib/client";
import { billPdf, billPng, drawBill, type BillSale, type BillShop } from "@/lib/bill-image";
import { formatPKR } from "@/lib/money";
import { billMessage, openWhatsApp, waNumber } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n";

type Shop = { shopName: string; phone?: string };
type SaleFull = BillSale & {
  items: (BillSale["items"][number] & { serials?: { imei: string; returned?: boolean }[]; warrantyUntil?: string })[];
};
type Mode = "image" | "pdf" | "text";
const MODE_KEY = "dukaan:wa-bill-mode";

function savedMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === "image" || m === "pdf" || m === "text") return m;
  } catch {
    /* ignore */
  }
  return "image";
}

/** Phones and tablets can hand a file straight to WhatsApp; computers cannot. */
function canShareFiles() {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [new File(["x"], "bill.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Sends a bill on WhatsApp as a picture (default), a PDF or a text message. Phones share the file
 * straight to WhatsApp; on a computer the picture is copied (paste it in the chat) or the file is saved,
 * and WhatsApp opens on the customer's chat with a short note.
 */
export function SendBillModal({ saleId, open, onClose, shop }: { saleId: string | null; open: boolean; onClose: () => void; shop: Shop }) {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleFull | null>(null);
  const [details, setDetails] = useState<BillShop | null>(null);
  const [mode, setModeState] = useState<Mode>("image");
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const share = useMemo(() => (open ? canShareFiles() : false), [open]);
  const setMode = (m: Mode) => {
    setModeState(m);
    setNote(null);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!open || !saleId) return;
    setText(null);
    setError("");
    setNote(null);
    setCanvas(null);
    setPreview(null);
    setModeState(savedMode());
    Promise.all([
      api<SaleFull>(`/api/sales/${saleId}`),
      api<{ url: string | null; phone: string | null }>(`/api/share?kind=sale&id=${saleId}`),
      api<{ settings?: BillShop; branches?: { _id: string; name: string }[] }>("/api/auth/me").catch(() => ({ settings: undefined, branches: [] })),
      api<{ branches: { name: string; address?: string; phone?: string }[] }>("/api/branches").catch(() => ({ branches: [] })),
    ])
      .then(([s, sh, me, br]) => {
        setSale(s);
        setPhone(sh.phone ?? "");
        setLink(sh.url);
        // A shop with several branches shows the selling branch's address and phone.
        const many = (me.branches?.length ?? 0) > 1;
        const b = many ? br.branches.find((x) => x.name === s.branchName) : undefined;
        setDetails({
          shopName: me.settings?.shopName ?? shop.shopName,
          phone: b?.phone || me.settings?.phone || shop.phone,
          address: b?.address || me.settings?.address,
          ntn: me.settings?.ntn,
          strn: me.settings?.strn,
          receiptFooter: me.settings?.receiptFooter,
          branchName: many ? s.branchName : undefined,
        });
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
            link: sh.url,
          }),
        );
      })
      .catch((e) => setError(e.message));
  }, [open, saleId, shop.shopName, shop.phone]);

  // Draw the bill picture once the data is here (and only when a picture / PDF is wanted).
  useEffect(() => {
    if (!open || mode === "text" || !sale || !details || canvas) return;
    let cancelled = false;
    drawBill(sale, details, { link })
      .then(async (c) => {
        if (cancelled) return;
        setCanvas(c);
        setPreview(URL.createObjectURL(await billPng(c)));
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [open, mode, sale, details, link, canvas]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const number = waNumber(phone);
  const caption = sale
    ? [
        `Assalam o Alaikum${sale.customerName ? ` ${sale.customerName}` : ""},`,
        `${details?.shopName ?? shop.shopName} — bill ${sale.invoiceNo}: ${formatPKR(sale.total)}.`,
        ...(link ? [`Bill online: ${link}`] : []),
        "Shukriya!",
      ].join("\n")
    : "";
  const fileName = (ext: string) => `${(details?.shopName ?? shop.shopName ?? "bill").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "bill"}-${sale?.invoiceNo ?? "bill"}.${ext}`;

  async function makeFile() {
    if (!canvas) throw new Error("The bill is still being made.");
    return mode === "pdf" ? new File([await billPdf(canvas)], fileName("pdf"), { type: "application/pdf" }) : new File([await billPng(canvas)], fileName("png"), { type: "image/png" });
  }

  /** Phone / tablet: hand the file to WhatsApp through the share menu. */
  async function shareFile() {
    setBusy(true);
    setNote(null);
    try {
      const file = await makeFile();
      await navigator.share({ files: [file], text: caption, title: sale?.invoiceNo });
      onClose();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  /** Computer: copy the picture (or save the PDF), then open the customer's chat. */
  async function sendFromComputer() {
    setBusy(true);
    setNote(null);
    try {
      const file = await makeFile();
      let copied = false;
      if (mode === "image" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) download(file, file.name);
      if (number) openWhatsApp(number, caption);
      setNote({
        tone: "ok",
        text: copied
          ? t("Bill picture copied. In the WhatsApp chat press Ctrl+V, then Send.")
          : t("The bill was saved to your Downloads ({file}). Drag it into the WhatsApp chat, then Send.", { file: file.name }),
      });
    } catch (e) {
      setNote({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function saveOnly() {
    try {
      const file = await makeFile();
      download(file, file.name);
    } catch (e) {
      setNote({ tone: "error", text: (e as Error).message });
    }
  }

  const fileMode = mode !== "text";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send the bill on WhatsApp"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {fileMode && !share && (
            <Button variant="outline" disabled={!canvas} icon={<Download className="h-4 w-4" />} onClick={saveOnly}>
              {mode === "pdf" ? "Save PDF" : "Save picture"}
            </Button>
          )}
          {!fileMode ? (
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
          ) : share ? (
            <Button disabled={!canvas} loading={busy} icon={<Share2 className="h-4 w-4" />} onClick={shareFile}>
              Share on WhatsApp
            </Button>
          ) : (
            <Button disabled={!canvas || !number} loading={busy} icon={mode === "image" ? <Copy className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} onClick={sendFromComputer}>
              {mode === "image" ? "Copy picture & open WhatsApp" : "Save PDF & open WhatsApp"}
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : text === null ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "image", label: "Picture" },
              { value: "pdf", label: "PDF" },
              { value: "text", label: "Text message" },
            ]}
          />
          {(!fileMode || !share) && (
            <Field label="Customer's WhatsApp number" error={phone && !number ? t("Enter a Pakistani mobile number, e.g. 0300-1234567") : undefined}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03xx-xxxxxxx" autoFocus={!phone} aria-label="Customer WhatsApp number" />
            </Field>
          )}
          {fileMode ? (
            <>
              <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={t("Bill picture")} className="mx-auto w-full max-w-sm rounded-lg shadow-sm" data-testid="bill-preview" />
                ) : (
                  <Spinner />
                )}
              </div>
              <p className="text-xs text-slate-500">
                {share
                  ? t("Tap “Share on WhatsApp”, choose WhatsApp, then the customer{phone}.", { phone: number ? ` (${phone})` : "" })
                  : mode === "image"
                    ? t("The picture is copied and the customer's chat opens. Press Ctrl+V in the chat, then Send.")
                    : t("The PDF is saved and the customer's chat opens. Drag the PDF into the chat, then Send.")}
              </p>
            </>
          ) : (
            <Field label="Message" hint={link ? "The link opens the bill on the customer's phone." : "Tip: set the app's public address in Settings to add a link to the bill."}>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[220px] font-mono text-xs" aria-label="Message" />
            </Field>
          )}
          {note && <p className={note.tone === "ok" ? "rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800" : "rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700"}>{note.text}</p>}
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
