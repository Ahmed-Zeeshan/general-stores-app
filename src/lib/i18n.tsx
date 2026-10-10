"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Interface language for the counter screens (English / اردو). Chosen per computer; numbers and
 * amounts stay in English digits so they match receipts and calculators.
 */
export type Lang = "en" | "ur";
const KEY = "dukaan:lang";

const UR: Record<string, string> = {
  // Navigation & common
  "Log out": "لاگ آؤٹ",
  "Change password": "پاس ورڈ تبدیل کریں",
  Cancel: "منسوخ",
  Save: "محفوظ کریں",
  Done: "ہو گیا",
  Close: "بند کریں",
  Print: "پرنٹ",
  Search: "تلاش",
  // POS
  "New Bill": "نیا بل",
  "Tip: scan a barcode or type and press Enter · F2 search · F9 pay · F4 hold · F6 held bills · F8 receive udhaar":
    "بارکوڈ اسکین کریں یا نام لکھ کر Enter دبائیں · F2 تلاش · F9 ادائیگی · F4 روکیں · F6 رکے بل · F8 ادھار وصولی",
  "Offline mode": "آف لائن",
  "{n} waiting": "{n} بل باقی",
  "Drawer not open": "دراز نہیں کھلا",
  "Held bills": "رکے ہوئے بل",
  "Receive udhaar": "ادھار وصول کریں",
  Udhaar: "ادھار",
  "Scan barcode or search product…": "بارکوڈ اسکین کریں یا چیز تلاش کریں…",
  All: "سب",
  "Tap a product or scan a barcode to add it to the bill.": "بل میں ڈالنے کے لیے چیز پر کلک کریں یا بارکوڈ اسکین کریں۔",
  "No products found": "کوئی چیز نہیں ملی",
  "Bill items": "بل کی اشیاء",
  "Clear all": "سب ہٹائیں",
  "Walk-in customer": "عام گاہک",
  "Tap to choose a customer (needed for udhaar)": "گاہک چنیں (ادھار کے لیے ضروری)",
  "Old udhaar: {amount}": "پرانا ادھار: {amount}",
  "No old udhaar": "کوئی پرانا ادھار نہیں",
  "{n} points": "{n} پوائنٹس",
  "Wholesale prices": "ہول سیل ریٹ",
  Wholesale: "ہول سیل",
  Subtotal: "کل رقم",
  Discount: "رعایت",
  "Sales tax {rate}%": "سیلز ٹیکس {rate}%",
  "(included)": "(شامل)",
  Total: "ٹوٹل",
  Hold: "روکیں",
  "Take Payment": "رقم وصول کریں",
  "Offer: {name}": "آفر: {name}",
  "Use {n} points": "{n} پوائنٹس استعمال کریں",
  "worth {amount}": "قیمت {amount}",
  "Stock: {n}": "اسٹاک: {n}",
  // Payment
  "Take payment": "ادائیگی",
  "Total to pay": "کل ادائیگی",
  "One method": "ایک طریقہ",
  "Split payment": "تقسیم ادائیگی",
  Cash: "نقد",
  JazzCash: "جاز کیش",
  Easypaisa: "ایزی پیسہ",
  Card: "کارڈ",
  Bank: "بینک",
  "Amount received": "وصول شدہ رقم",
  "Paid now (optional)": "ابھی ادا (اختیاری)",
  "Leave empty if customer gives exact amount": "پوری رقم ملے تو خالی چھوڑ دیں",
  "Transaction ID (optional)": "ٹرانزیکشن آئی ڈی (اختیاری)",
  Rest: "باقی",
  Paid: "ادا",
  "Change to return": "بقایا واپس کریں",
  "Goes to udhaar": "ادھار میں جائے گا",
  "Will be added to {name}'s khata.": "{name} کے کھاتے میں جمع ہو گا۔",
  "Choose a customer for udhaar": "ادھار کے لیے گاہک چنیں",
  "Confirm & Save Bill": "بل محفوظ کریں",
  "Bill saved": "بل محفوظ ہو گیا",
  "Give change back": "بقایا واپس دیں",
  "Next bill": "اگلا بل",
  "Receipt sent to the printer.": "رسید پرنٹر کو بھیج دی گئی۔",
  "Print the receipt automatically after every bill (this computer)": "ہر بل کے بعد رسید خود پرنٹ ہو (یہ کمپیوٹر)",
  "Bills on hold": "رکے ہوئے بل",
  Open: "کھولیں",
  "Bill on hold ({amount}). Open it again from \"Held bills\".": "بل روک لیا گیا ({amount})۔ \"رکے ہوئے بل\" سے دوبارہ کھولیں۔",
  // Receive payment
  "Receive payment": "رقم وصولی",
  "Receive udhaar — choose customer": "ادھار وصولی — گاہک چنیں",
  "Full payment": "پوری رقم",
  Half: "آدھی",
  "Amount (Rs)": "رقم (روپے)",
  "Paid by": "ادائیگی بذریعہ",
  "Note (optional)": "نوٹ (اختیاری)",
  "Payment received": "رقم وصول ہو گئی",
  "Still to collect: {amount}": "ابھی باقی: {amount}",
  "Khata clear — fully paid ✓": "کھاتہ صاف — پوری ادائیگی ✓",
  Receipt: "رسید",
  "Name or phone": "نام یا فون",
  "Receive {amount}": "{amount} وصول کریں",
  // Login
  "Log in": "لاگ ان",
  "Welcome back": "خوش آمدید",
  "Log in to open your shop.": "اپنی دکان کھولنے کے لیے لاگ ان کریں۔",
  "Your password": "آپ کا پاس ورڈ",
  "Forgot your password? Staff: ask your shop owner. Shop owners: ask the administrator.": "پاس ورڈ بھول گئے؟ عملہ: دکان کے مالک سے پوچھیں۔ مالکان: ایڈمنسٹریٹر سے پوچھیں۔",
  Username: "یوزر نیم",
  Password: "پاس ورڈ",
};

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "ur") setLangState("ur");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "ur" ? "ur" : "en";
    document.documentElement.classList.toggle("lang-ur", lang === "ur");
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/** t("Old udhaar: {amount}", { amount: "Rs 500" }) — Urdu when chosen, English otherwise. */
export function useT() {
  const { lang } = useContext(LangContext);
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      let out = lang === "ur" ? UR[text] ?? text : text;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
      return out;
    },
    [lang],
  );
}

/** Small English / اردو switch. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold ${className}`} role="group" aria-label="Language">
      <button type="button" onClick={() => setLang("en")} className={`rounded-md px-2.5 py-1 ${lang === "en" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"}`}>
        English
      </button>
      <button type="button" onClick={() => setLang("ur")} className={`urdu rounded-md px-2.5 py-1 ${lang === "ur" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"}`}>
        اردو
      </button>
    </div>
  );
}
