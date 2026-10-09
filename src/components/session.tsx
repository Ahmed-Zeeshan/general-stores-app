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
};

type Ctx = { user: SessionUser; settings: ShopSettings | null; reload: () => void };
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
