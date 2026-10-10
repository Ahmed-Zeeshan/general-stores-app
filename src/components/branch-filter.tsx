"use client";

import { MapPin } from "lucide-react";
import { useCan, useSession } from "./session";

/**
 * Lets owners/managers who are not tied to one branch pick "all branches" or a specific one.
 * Renders nothing for single-branch shops or branch-locked staff.
 */
export function BranchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { branches, branchLocked } = useSession();
  const can = useCan();
  if (!can.manage || branchLocked || !branches || branches.length < 2) return null;
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 shadow-xs">
      <MapPin className="h-4 w-4 text-slate-400" />
      <span className="sr-only">Branch</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-hidden">
        <option value="">This branch</option>
        <option value="all">All branches</option>
        {branches.map((b) => (
          <option key={b._id} value={b._id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}
