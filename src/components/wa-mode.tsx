"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { getWaMode, setWaMode, type WaMode } from "@/lib/whatsapp";

/** Per-computer choice of WhatsApp Desktop app vs WhatsApp Web. */
export function WaModePicker() {
  const [mode, setMode] = useState<WaMode>("auto");
  useEffect(() => setMode(getWaMode()), []);
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 shadow-xs" title="Which WhatsApp opens on this computer">
      <MessageCircle className="h-4 w-4 text-emerald-600" />
      <span className="sr-only">Open messages in</span>
      <select
        value={mode}
        onChange={(e) => {
          const m = e.target.value as WaMode;
          setMode(m);
          setWaMode(m);
        }}
        className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-hidden"
      >
        <option value="app">WhatsApp Desktop</option>
        <option value="web">WhatsApp Web</option>
        <option value="auto">Ask each time</option>
      </select>
    </label>
  );
}
