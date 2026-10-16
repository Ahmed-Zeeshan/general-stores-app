"use client";

import Link from "next/link";
import { BookOpen, CalendarRange, HelpCircle, Keyboard, Languages, Package, Printer, Receipt, RotateCcw, Save, ScanBarcode, Search, ShoppingCart, Smartphone, Truck, Users, Wallet, Wrench, Zap } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { useSession } from "@/components/session";
import { useLang, useT } from "@/lib/i18n";

type Topic = { id: string; icon: typeof HelpCircle; title: string; urdu: string; steps: string[]; link?: { href: string; label: string }; module?: "phones" | "repairs" | "wallets" | "installments" };

/** Short how-tos for every part of the app, in plain words, with a one-line Urdu summary each. */
const TOPICS: Topic[] = [
  {
    id: "bill",
    icon: ShoppingCart,
    title: "Making a bill",
    urdu: "بل بنانا: چیز اسکین کریں یا کلک کریں، پھر رقم وصول کریں۔",
    steps: [
      "Open New Bill. Scan the barcode, or type the name and press Enter, or tap the item.",
      "Loose items (kg / litre) ask how much — type kg, or the rupees the customer wants (e.g. Rs 100 of sugar).",
      "Press Take Payment (F9). Choose Cash, JazzCash, Easypaisa, Card, Bank or Udhaar; Split payment lets you mix them.",
      "For udhaar, choose the customer first (top of the bill). Press Confirm & Save Bill — the receipt prints.",
      "Busy counter? Hold (F4) puts the bill aside; Held bills (F6) brings it back.",
      "Send bill on WhatsApp sends the bill to the customer instead of (or with) paper. With the app's address set in Settings, the message has a link that opens the bill.",
      "Touch screen? Big buttons makes the items larger; starred items (Favourites) come first, and items can have a photo.",
    ],
    link: { href: "/pos", label: "Open New Bill" },
  },
  {
    id: "udhaar",
    icon: BookOpen,
    title: "Udhaar (khata) and payments",
    urdu: "ادھار: گاہک کا کھاتہ، وصولی اور واٹس ایپ یاد دہانی۔",
    steps: [
      "Customers Khata lists everyone with their balance. Add old balances from your register when you add a customer.",
      "Receive Udhaar (F8 on the bill screen, or on the customer's page) takes full or part payment and prints a receipt.",
      "WhatsApp reminder opens WhatsApp with the message typed — you press Send. Udhaar Report shows who owes the longest.",
      "A payment entered by mistake can be cancelled by the owner or manager; it stays in the khata marked cancelled.",
    ],
    link: { href: "/customers", label: "Open Customers" },
  },
  {
    id: "stock",
    icon: Package,
    title: "Items, prices and stock",
    urdu: "اشیاء: نام، قیمت، اسٹاک اور بارکوڈ۔",
    steps: [
      "Products → Add product, or Ready-made items to pick from a list for your type of shop and type your prices.",
      "Update stock for counts, wastage and corrections. Every change is kept in the item's stock history.",
      "No barcode on an item? Create barcodes gives it one; Print labels prints stickers.",
      "Cartons and dozens: add pack sizes with their own price and barcode. Expiry by batch for dairy, bakery and medicines.",
    ],
    link: { href: "/products", label: "Open Products" },
  },
  {
    id: "purchases",
    icon: Truck,
    title: "Buying stock from suppliers",
    urdu: "خریداری: سپلائر سے مال آیا تو یہاں درج کریں۔",
    steps: [
      "Purchases → New purchase. Choose the supplier, scan or add the items with quantity and cost.",
      "Stock and cost prices update by themselves. What you don't pay now goes to the supplier's khata.",
      "Damaged or wrong goods: open the purchase and Return to supplier.",
      "Reorder List shows what will run out soon (from the last 30 days of sales) and how much to order from each supplier — send it on WhatsApp.",
    ],
    link: { href: "/reorder", label: "Open Reorder List" },
  },
  {
    id: "returns",
    icon: RotateCcw,
    title: "Customer returns",
    urdu: "واپسی: پرانا بل کھولیں اور واپس آنے والی اشیاء چنیں۔",
    steps: [
      "Sales History → find the bill (search by number or customer) → Return.",
      "Choose what came back and how many. Money goes back in cash or to the customer's khata; stock comes back.",
    ],
    link: { href: "/sales", label: "Open Sales History" },
  },
  {
    id: "drawer",
    icon: Wallet,
    title: "Cash drawer and day close",
    urdu: "کیش دراز: صبح رقم گن کر کھولیں، شام کو گن کر بند کریں۔",
    steps: [
      "Morning: Cash Drawer → Open drawer with the cash already in it.",
      "Money put in or taken out during the day (bank deposit, change): Cash in / Cash out.",
      "Evening: Close day — count the notes. The Z report shows Exact, Short or Over and prints.",
      "Send to the owner on WhatsApp sends the day close; on the dashboard, Send today's summary sends the whole day (sales, profit, udhaar, drawer).",
    ],
    link: { href: "/drawer", label: "Open Cash Drawer" },
  },
  {
    id: "scanner",
    icon: ScanBarcode,
    title: "Barcode scanner and camera",
    urdu: "بارکوڈ اسکینر: لگائیں اور اسکین کریں، کوئی سیٹنگ نہیں۔",
    steps: [
      "USB or Bluetooth scanners work as soon as they are plugged in — no setup.",
      "On a phone or laptop you can scan with the camera (camera button next to the search box).",
    ],
  },
  {
    id: "printer",
    icon: Printer,
    title: "Receipt printer",
    urdu: "پرنٹر: ٹیسٹ رسید پرنٹ کر کے کاغذ کا سائز چیک کریں۔",
    steps: [
      "Print a test receipt to check the paper size (80 mm or 58 mm).",
      "Turn on Print automatically on the Bill saved screen to print every bill without clicking Print.",
    ],
    link: { href: "/receipt/test", label: "Print test receipt" },
  },
  {
    id: "search",
    icon: Search,
    title: "Finding anything quickly",
    urdu: "تلاش: Ctrl+K دبائیں اور نام، فون، شناختی کارڈ یا IMEI لکھیں۔",
    steps: [
      "Press Ctrl+K (or the Search box in the menu) on any screen.",
      "Type a name, mobile number, CNIC, IMEI, bill number or job number — dashes don't matter.",
      "The bell in the menu lists today's tasks: late installments, phones ready, low balances, udhaar to remind.",
    ],
  },
  {
    id: "staff",
    icon: Users,
    title: "Staff and branches",
    urdu: "عملہ: ہر ملازم کا اپنا لاگ ان، کیشیئر قیمت نہیں بدل سکتا۔",
    steps: [
      "Settings → Staff: add a login for each person. Cashiers bill and receive udhaar; managers also handle stock and reports.",
      "Activity Log shows who changed prices, gave discounts, took returns or cancelled payments.",
      "More than one shop? Add branches; each branch has its own stock and you can move stock between them.",
      "Give each person a 4–6 digit PIN: on a shared counter, Switch user (under your name in the menu) lets the next person take over with their PIN.",
      "Limits per person: the largest discount they may give, and whether they may give udhaar.",
      "Safety: after 5 wrong PINs in a row the PIN stops working (set a new one here); after 10 wrong passwords the account waits 15 minutes. Changing or resetting a password logs that person out everywhere. Someone leaving? Disable their account.",
    ],
    link: { href: "/settings", label: "Open Settings" },
  },
  {
    id: "backup",
    icon: Save,
    title: "Backups",
    urdu: "بیک اپ: ہفتے میں ایک بار ڈاؤن لوڈ کریں اور محفوظ جگہ رکھیں۔",
    steps: [
      "Settings → Download backup saves everything in one file. Keep a copy on a USB or in Google Drive.",
      "Restore from backup brings a shop back exactly as it was in the file.",
      "The app also saves a copy every night. Settings shows when and where; put that folder inside Google Drive for desktop to keep every copy online too.",
    ],
    link: { href: "/settings", label: "Open Settings" },
  },
  {
    id: "phones",
    icon: Smartphone,
    module: "phones",
    title: "Phones by IMEI and used phones",
    urdu: "موبائل: ہر فون اس کے IMEI سے بکتا ہے، پرانے فون شناختی کارڈ کے ساتھ خریدیں۔",
    steps: [
      "Phones → Add phones: choose the model and scan each IMEI. On the bill, tap the model and pick the IMEI, or scan it.",
      "Check IMEI shows a phone's full history and warranty.",
      "Used Phones Bought: record the seller's CNIC, photos and checks; print the agreement for signature.",
    ],
    link: { href: "/phones", label: "Open Phones" },
  },
  {
    id: "repairs",
    icon: Wrench,
    module: "repairs",
    title: "Repairs",
    urdu: "مرمت: جاب کارڈ بنائیں، تیار ہو تو واٹس ایپ کریں۔",
    steps: [
      "Repairs → New repair job: customer, phone, problem, estimate and advance. A slip prints for the customer.",
      "Move the job through the steps; add parts from stock and the labour charge.",
      "Ready? Send the 'ready' WhatsApp. Deliver collects the balance and prints the bill with warranty.",
    ],
    link: { href: "/repairs", label: "Open Repairs" },
  },
  {
    id: "wallets",
    icon: Zap,
    module: "wallets",
    title: "Easyload, packages and JazzCash / Easypaisa",
    urdu: "ایزی لوڈ: سم کا بیلنس، کمیشن اور کیش اِن/آؤٹ۔",
    steps: [
      "Add each Easyload SIM and wallet account with its balance and commission.",
      "Easyload, Package, Cash in / send, Cash out and Bill payment each take a few taps; the balance and drawer cash update.",
      "Balance check compares with the SIM / app and records any difference.",
    ],
    link: { href: "/wallets", label: "Open Easyload & Wallets" },
  },
  {
    id: "installments",
    icon: CalendarRange,
    module: "installments",
    title: "Installments (qist)",
    urdu: "قسطیں: بل پر قسطوں پر بیچیں، اقرار نامہ پرنٹ کریں، ہر ماہ وصول کریں۔",
    steps: [
      "On the bill: Take Payment → Sell on installments. Enter the advance, markup, months and the customer's CNIC.",
      "Print the agreement for signatures. Installments → the plan → Receive installment each month.",
      "Late customers show in the bell with a one-tap WhatsApp reminder.",
    ],
    link: { href: "/installments", label: "Open Installments" },
  },
  {
    id: "language",
    icon: Languages,
    title: "Urdu and Roman Urdu",
    urdu: "زبان: مینو کے نیچے اردو یا رومن اردو چنیں۔",
    steps: ["Choose English, اردو or Roman Urdu at the bottom of the menu (or on the login page). Each computer remembers its choice."],
  },
  {
    id: "keys",
    icon: Keyboard,
    title: "Keyboard shortcuts",
    urdu: "شارٹ کٹس: F2 تلاش، F9 ادائیگی، F4 روکیں، F6 رکے بل، F8 ادھار وصولی، Ctrl+K تلاش۔",
    steps: ["New Bill: F2 search · F9 take payment · F4 hold · F6 held bills · F8 receive udhaar.", "Anywhere: Ctrl+K search."],
  },
];

export default function HelpPage() {
  const { settings } = useSession();
  const { lang } = useLang();
  const t = useT();
  const m = settings?.modules ?? {};
  const topics = TOPICS.filter((x) => !x.module || m[x.module]);
  return (
    <div>
      <PageHeader title="Help" urdu="مدد" subtitle="How to do each job in the app, step by step" />
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap gap-2">
          {topics.map((x) => (
            <a key={x.id} href={`#${x.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-800">
              <x.icon className="h-4 w-4" /> {t(x.title)}
            </a>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {topics.map((x) => (
          <Card key={x.id} className="scroll-mt-20 p-5">
            <section id={x.id}>
              <h2 className="flex items-center gap-2 font-bold text-slate-900">
                <x.icon className="h-5 w-5 text-brand-600" /> {t(x.title)}
              </h2>
              <p className={lang === "ur" ? "urdu mt-1 text-base text-slate-700" : "urdu mt-1 text-sm text-slate-500"}>{x.urdu}</p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                {x.steps.map((s) => (
                  <li key={s}>{t(s)}</li>
                ))}
              </ol>
              {x.link &&
                (x.link.href.startsWith("/receipt") ? (
                  <a href={x.link.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                    <Receipt className="h-4 w-4" /> {t(x.link.label)}
                  </a>
                ) : (
                  <Link href={x.link.href} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
                    {t(x.link.label)} →
                  </Link>
                ))}
            </section>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">{t("Still stuck? Ask your shop owner, or the person who set up the app for you.")}</p>
    </div>
  );
}
