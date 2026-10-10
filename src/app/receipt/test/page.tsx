"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { getPrintPrefs } from "@/lib/print";

/** A sample receipt to check the printer, paper width and cash drawer. */
export default function PrinterTestPage() {
  return (
    <Suspense fallback={null}>
      <PrinterTest />
    </Suspense>
  );
}

function PrinterTest() {
  const search = useSearchParams();
  const [shop, setShop] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    setNarrow(getPrintPrefs().paper === "58");
    api<{ settings: { shopName: string } }>("/api/auth/me")
      .then((me) => setShop(me.settings.shopName))
      .catch(() => setShop(""));
  }, []);
  useEffect(() => {
    if (shop !== null && search.get("print") === "1") setTimeout(() => window.print(), 300);
  }, [shop, search]);
  if (shop === null) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const line = "-".repeat(narrow ? 32 : 42);
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: ${narrow ? "58mm" : "80mm"} auto; margin: ${narrow ? "2mm" : "4mm"}; }`}</style>
      <div className={`mx-auto bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none ${narrow ? "w-[220px] text-[11px]" : "w-[300px]"}`}>
        <div className="text-center text-base font-bold uppercase">{shop}</div>
        <div className="text-center font-bold">PRINTER TEST</div>
        <div className="text-center">{new Date().toLocaleString("en-PK")}</div>
        <div className="overflow-hidden whitespace-nowrap">{line}</div>
        <div className="flex justify-between"><span>Paper</span><span>{narrow ? "58 mm" : "80 mm"}</span></div>
        <div className="flex justify-between"><span>Sugar 1 kg × 160</span><span>160</span></div>
        <div className="flex justify-between"><span>Olpers 1L × 2</span><span>600</span></div>
        <div className="mt-1 flex justify-between text-base font-bold"><span>TOTAL</span><span>Rs 760</span></div>
        <div className="overflow-hidden whitespace-nowrap">{line}</div>
        <div className="text-center" dir="rtl">اردو: شکریہ</div>
        <div className="mt-1 text-center text-[10px]">If this prints cleanly and the drawer opened, the counter is ready.</div>
      </div>
    </div>
  );
}
