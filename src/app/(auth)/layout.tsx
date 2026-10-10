import { ToastProvider } from "@/components/toast";
import { Logo } from "@/components/logo";
import { BarChart3, BookOpen, Package, ShoppingCart } from "lucide-react";

const features = [
  { icon: ShoppingCart, title: "Fast billing", text: "Make a bill in seconds with barcode or search" },
  { icon: Package, title: "Stock control", text: "Know what is running out before it does" },
  { icon: BookOpen, title: "Digital khata", text: "Track every customer's udhaar with full history" },
  { icon: BarChart3, title: "Daily profit", text: "See today's sales, profit and expenses at a glance" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-linear-to-br from-brand-700 via-brand-800 to-slate-900 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="relative">
            <Logo light />
          </div>
          <div className="relative">
            <h2 className="text-4xl font-extrabold leading-tight text-white">
              Run your shop
              <br />
              the smart way.
            </h2>
            <p className="urdu mt-2 text-xl text-brand-100">اپنی دکان کا مکمل حساب، ایک جگہ</p>
            <div className="mt-10 grid grid-cols-2 gap-5">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <f.icon className="h-6 w-6 text-brand-300" />
                  <div className="mt-3 font-semibold text-white">{f.title}</div>
                  <div className="mt-1 text-sm text-brand-100/80">{f.text}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="relative text-sm text-brand-200/70">For karyana stores, general stores & bakeries</p>
        </div>
        <div className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}
