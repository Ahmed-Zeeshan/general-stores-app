"use client";

import { Input } from "./ui";
import { todayISO } from "@/lib/client";
import { useT } from "@/lib/i18n";

const PRESETS = [
  { label: "Today", from: 0, to: 0 },
  { label: "Yesterday", from: -1, to: -1 },
  { label: "7 days", from: -6, to: 0 },
  { label: "30 days", from: -29, to: 0 },
];

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  const tr = useT();
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <div className="flex w-full rounded-xl bg-slate-100 p-1 sm:inline-flex sm:w-auto">
        {PRESETS.map((p) => {
          const f = todayISO(p.from);
          const t = todayISO(p.to);
          const active = f === from && t === to;
          return (
            <button
              key={p.label}
              onClick={() => onChange({ from: f, to: t })}
              className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-semibold transition sm:flex-none sm:px-3 ${active ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
            >
              {tr(p.label)}
            </button>
          );
        })}
      </div>
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <Input type="date" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} className="h-10 w-auto min-w-0 flex-1 px-2.5 text-sm sm:flex-none sm:px-3" />
        <span className="text-slate-400">{tr("to")}</span>
        <Input type="date" value={to} min={from} onChange={(e) => onChange({ from, to: e.target.value })} className="h-10 w-auto min-w-0 flex-1 px-2.5 text-sm sm:flex-none sm:px-3" />
      </div>
    </div>
  );
}
