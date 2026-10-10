import { Store } from "lucide-react";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
        <Store className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className={light ? "text-base font-extrabold text-white" : "text-base font-extrabold text-slate-900"}>Dukaan Manager</div>
        <div className={light ? "text-[11px] font-medium text-brand-100" : "text-[11px] font-medium text-slate-500"}>Shop ka hisaab, asaan</div>
      </div>
    </div>
  );
}
