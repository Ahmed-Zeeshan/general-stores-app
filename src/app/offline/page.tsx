import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline · Dukaan Manager" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">No connection</h1>
        <p className="urdu mt-1 text-lg text-slate-500">انٹرنیٹ یا سرور سے رابطہ نہیں</p>
        <p className="mt-3 text-slate-600">
          Dukaan Manager cannot reach the server. Check the internet or that the shop computer running the app is on, then try again.
        </p>
        {/* A full page load (not client-side navigation) so the browser really retries the server. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700">
          Try again
        </a>
      </div>
    </div>
  );
}
