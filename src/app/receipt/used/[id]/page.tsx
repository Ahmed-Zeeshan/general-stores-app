"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { PTA_LABELS } from "@/lib/imei";
import { rupeesInWords } from "@/lib/words";

type Used = {
  _id: string;
  buyNo: string;
  createdAt: string;
  branchName?: string;
  seller: { name: string; cnic: string; phone: string; address?: string };
  photos?: string[];
  productName: string;
  imei: string;
  imei2?: string;
  color?: string;
  storage?: string;
  pta: string;
  checks?: Record<string, boolean>;
  batteryHealth?: number;
  accessories?: string[];
  notes?: string;
  price: number;
  method: string;
  paymentRef?: string;
  status: string;
  cancelReason?: string;
  userName?: string;
};
type Settings = { shopName: string; phone?: string; address?: string };

const CHECK_LABELS: Record<string, string> = {
  screen: "Screen & touch",
  body: "Body / frame",
  camera: "Cameras",
  audio: "Speaker & mic",
  charging: "Charging port",
  biometric: "Fingerprint / face",
  network: "Signal & Wi-Fi",
  buttons: "Buttons",
};

export default function UsedAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Agreement id={id} />
    </Suspense>
  );
}

function Agreement({ id }: { id: string }) {
  const search = useSearchParams();
  const [doc, setDoc] = useState<Used | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<Used>(`/api/used-phones/${id}`), api<{ settings: Settings }>("/api/auth/me")])
      .then(([d, me]) => {
        setDoc(d);
        setSettings(me.settings);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (doc && search.get("print") === "1") setTimeout(() => window.print(), 400);
  }, [doc, search]);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!doc || !settings) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const row = (label: string, value?: React.ReactNode) =>
    value ? (
      <div className="flex gap-3 border-b border-slate-200 py-1.5">
        <span className="w-40 shrink-0 text-slate-500">{label}</span>
        <span className="min-w-0 font-medium break-words">{value}</span>
      </div>
    ) : null;
  const failed = Object.entries(doc.checks ?? {}).filter(([, v]) => !v).map(([k]) => CHECK_LABELS[k] ?? k);

  return (
    <div className="min-h-screen bg-slate-100 py-4 sm:py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end px-4">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          <Printer className="h-4 w-4" /> Print agreement
        </button>
      </div>
      <div className="mx-auto max-w-3xl bg-white p-5 text-[13px] text-slate-900 shadow-lg sm:p-10 print:max-w-none print:p-0 print:shadow-none">
        <div className="flex flex-col gap-2 border-b-2 border-slate-900 pb-3 sm:flex-row sm:items-start sm:justify-between print:flex-row">
          <div>
            <div className="text-xl font-extrabold sm:text-2xl">{settings.shopName}</div>
            {settings.address && <div className="text-slate-600">{settings.address}</div>}
            {settings.phone && <div className="text-slate-600">Phone: {settings.phone}</div>}
          </div>
          <div className="sm:text-right print:text-right">
            <div className="text-base font-bold uppercase">Used Mobile Purchase Agreement</div>
            <div className="urdu text-slate-500">استعمال شدہ موبائل خریداری کا اقرار نامہ</div>
            <div className="text-slate-600">
              {doc.buyNo} · {formatDate(doc.createdAt, true)}
            </div>
          </div>
        </div>
        {doc.status === "cancelled" && <div className="mt-3 rounded bg-rose-100 p-2 text-center font-bold text-rose-800">CANCELLED{doc.cancelReason ? ` — ${doc.cancelReason}` : ""}</div>}

        <h3 className="mt-5 font-bold uppercase text-slate-500">Seller / فروخت کنندہ</h3>
        {row("Name", doc.seller.name)}
        {row("CNIC", doc.seller.cnic)}
        {row("Mobile", doc.seller.phone)}
        {row("Address", doc.seller.address)}

        <h3 className="mt-5 font-bold uppercase text-slate-500">Phone / موبائل</h3>
        {row("Model", doc.productName)}
        {row("IMEI 1", <span className="font-mono">{doc.imei}</span>)}
        {row("IMEI 2", doc.imei2 && <span className="font-mono">{doc.imei2}</span>)}
        {row("Colour / storage", [doc.color, doc.storage].filter(Boolean).join(" · "))}
        {row("PTA", PTA_LABELS[doc.pta] ?? doc.pta)}
        {row("Battery health", doc.batteryHealth !== undefined && doc.batteryHealth !== null ? `${doc.batteryHealth}%` : undefined)}
        {row("Checked", failed.length ? `Not OK: ${failed.join(", ")}` : doc.checks ? "All checks OK" : undefined)}
        {row("Came with", doc.accessories?.length ? doc.accessories.join(", ") : "Phone only")}
        {row("Notes", doc.notes)}

        <h3 className="mt-5 font-bold uppercase text-slate-500">Price / قیمت</h3>
        {row("Amount paid", <span className="text-base font-bold">{formatPKR(doc.price)}</span>)}
        {row("In words", rupeesInWords(doc.price))}
        {row("Paid by", `${doc.method === "khata" ? "Credited to customer's khata (trade-in)" : PAYMENT_LABELS[doc.method] ?? doc.method}${doc.paymentRef ? ` · ${doc.paymentRef}` : ""}`)}

        <div className="mt-5 rounded-lg border border-slate-300 p-3 leading-relaxed">
          <p>
            I, <b>{doc.seller.name}</b> (CNIC {doc.seller.cnic}), declare that the phone above is my own property. It is not stolen, snatched, lost or under any dispute, loan or installment. I
            have sold it to {settings.shopName} of my own free will for {formatPKR(doc.price)} and have received the full amount. If any claim arises about this phone, I will be fully responsible.
          </p>
          <p className="urdu mt-2 text-right">
            میں اقرار کرتا/کرتی ہوں کہ اوپر دیا گیا موبائل میری ذاتی ملکیت ہے۔ یہ چوری شدہ، چھینا ہوا یا کسی تنازعہ یا قسط میں نہیں ہے۔ میں نے اپنی مرضی سے یہ موبائل فروخت کیا اور پوری رقم وصول کر لی ہے۔ کسی بھی دعوے کی صورت میں میں ذمہ دار ہوں گا/گی۔
          </p>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-xs">
          <div>
            <div className="h-14 border-b border-slate-800" />
            Seller signature / دستخط
          </div>
          <div>
            <div className="mx-auto h-14 w-20 rounded border border-slate-800" />
            Thumb impression / انگوٹھا
          </div>
          <div>
            <div className="h-14 border-b border-slate-800" />
            For {settings.shopName}
            {doc.userName && <div className="text-slate-500">{doc.userName}</div>}
          </div>
        </div>

        {doc.photos && doc.photos.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3 print:break-inside-avoid">
            {doc.photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p} alt={`Photo ${i + 1}`} className="h-32 w-auto rounded border border-slate-300 object-contain" />
            ))}
          </div>
        )}
        <p className="mt-6 text-center text-[11px] text-slate-500">
          {doc.branchName && `${doc.branchName} · `}Keep this agreement with the seller&apos;s CNIC copy.
        </p>
      </div>
    </div>
  );
}
