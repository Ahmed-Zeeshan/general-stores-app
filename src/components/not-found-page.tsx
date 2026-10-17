"use client";

import Link from "next/link";
import { Compass, LayoutDashboard, Lock } from "lucide-react";
import { Card } from "./ui";
import { useSession } from "./session";
import { useT } from "@/lib/i18n";

/** Shown inside the app (menu and all) when an address does not exist. */
export function NotFoundContent() {
  const t = useT();
  const { user } = useSession();
  const home = user.role === "superadmin" ? "/admin" : "/";
  return (
    <Card className="mx-auto mt-6 max-w-lg">
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Compass className="h-8 w-8" />
        </div>
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{t("Page not found")}</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">{t("This address does not exist in the app. Check the link, or go back to the dashboard.")}</p>
        <Link
          href={home}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700"
        >
          <LayoutDashboard className="h-4 w-4" />
          {t("Back to Dashboard")}
        </Link>
      </div>
    </Card>
  );
}

/** Shown inside the app when someone opens a page their role cannot use (e.g. a cashier typing /reports). */
export function NoAccessContent({ ownerOnly }: { ownerOnly: boolean }) {
  const t = useT();
  return (
    <Card className="mx-auto mt-6 max-w-lg">
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{t("You can't open this page")}</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          {ownerOnly ? t("This page is only for the shop owner. Ask the owner if you need something from it.") : t("This page is only for the owner or a manager. Ask them if you need something from it.")}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700"
        >
          <LayoutDashboard className="h-4 w-4" />
          {t("Back to Dashboard")}
        </Link>
      </div>
    </Card>
  );
}
