"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/session";

export type ShopSettings = {
  shopName: string;
  shopType: string;
  phone?: string;
  address?: string;
  ntn?: string;
  strn?: string;
  taxEnabled: boolean;
  taxRate: number;
  pricesIncludeTax: boolean;
  receiptFooter?: string;
  maxUsers?: number;
  maxBranches?: number;
  plan?: string;
  expiresAt?: string;
  fbrEnabled?: boolean;
  fbrMode?: "sandbox" | "live";
  fbrPosId?: string;
  fbrDefaultPct?: string;
  waTemplate?: string;
  publicUrl?: string;
  ownerPhone?: string;
  waPaymentTemplate?: string;
  loyaltyEnabled?: boolean;
  requireOpenDrawer?: boolean;
  drawerVariance?: number;
  loyaltyEarnPer?: number;
  loyaltyPointValue?: number;
  loyaltyMinRedeem?: number;
  modules?: Partial<Record<"phones" | "repairs" | "wallets" | "installments", boolean>>;
};

export type BranchInfo = { _id: string; name: string; address?: string; phone?: string };
export type SessionData = {
  user: SessionUser;
  settings: ShopSettings | null;
  branch?: BranchInfo;
  branches?: { _id: string; name: string }[];
  branchLocked?: boolean;
};
type Ctx = SessionData & { reload: () => void };
export const SessionContext = createContext<Ctx | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the app layout");
  return ctx;
}

export function useCan() {
  const { user } = useSession();
  return {
    manage: user.role === "owner" || user.role === "manager",
    owner: user.role === "owner",
  };
}
