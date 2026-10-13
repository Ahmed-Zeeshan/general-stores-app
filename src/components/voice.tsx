"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageCircle, Mic, MicOff, Printer, Search, Square, Volume2 } from "lucide-react";
import { Button, Input, Modal, Segmented, Select, cn } from "./ui";
import { useCan, useSession } from "./session";
import { useToast } from "./toast";
import { printPaymentReceipt, sendPaymentWhatsApp } from "./receive-payment";
import { api, LOOSE_UNITS, PAYMENT_LABELS, UNIT_LABELS } from "@/lib/client";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatPKR, formatQty, round2 } from "@/lib/money";
import { sellPrice, type PackLike } from "@/lib/pricing";
import { getVoiceLang, setVoiceLang, speak, useSpeech, type VoiceLang } from "@/lib/speech";
import { bestMatch, parseCommand, parseItems, topMatches, type VoiceCommand, type VoiceItem } from "@/lib/voice-parse";
import { useLang, useT } from "@/lib/i18n";
import type { SearchGroup } from "@/lib/search";

// ================================================================ mic button

/** Strip at the bottom of the screen while the microphone is on. */
function ListeningBar({ interim, onStop }: { interim: string; onStop: () => void }) {
  const t = useT();
  return createPortal(
    <div className="no-print fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" onMouseDown={(e) => e.preventDefault()}>
      <div role="status" aria-label="Listening" className="flex max-w-lg items-center gap-3 rounded-full bg-slate-900 py-2 pl-4 pr-2 text-sm text-white shadow-2xl">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
        </span>
        <span className="min-w-0 truncate">{interim || t("Listening… speak now")}</span>
        <button type="button" onClick={onStop} className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25">
          <Square className="h-3.5 w-3.5" /> {t("Stop")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** A microphone button: press, speak, and `onText` gets what was said. Hidden where the browser has no voice. */
export function MicButton({ onText, label = "Speak", className, iconClass }: { onText: (text: string) => void; label?: string; className?: string; iconClass?: string }) {
  const sp = useSpeech();
  const toast = useToast();
  const t = useT();
  const { error, setError } = sp;
  useEffect(() => {
    if (error) {
      toast.error(t(error));
      setError("");
    }
  }, [error, setError, toast, t]);
  if (!sp.supported) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (sp.listening ? sp.stop() : sp.start((text) => text && onText(text)))}
        title={t(label)}
        aria-label={label}
        aria-pressed={sp.listening}
        className={cn(
          "inline-flex shrink-0 items-center justify-center transition",
          sp.listening ? "bg-rose-600 text-white hover:bg-rose-700" : "text-slate-600 hover:bg-slate-100 hover:text-brand-700",
          className,
        )}
      >
        <Mic className={cn("h-5 w-5", iconClass)} />
      </button>
      {sp.listening && <ListeningBar interim={sp.interim} onStop={sp.stop} />}
    </>
  );
}

/** Which language the shopkeeper speaks in (remembered on this computer). */
function VoiceLangSwitch() {
  const [lang, setLang] = useState<VoiceLang>("ur-PK");
  useEffect(() => setLang(getVoiceLang()), []);
  return (
    <Segmented
      value={lang}
      onChange={(l) => {
        setLang(l);
        setVoiceLang(l);
      }}
      options={[
        { value: "ur-PK", label: "اردو" },
        { value: "en-PK", label: "English" },
      ]}
    />
  );
}

// ================================================================ voice billing (POS)

export type VoiceProduct = {
  _id: string;
  name: string;
  nameUrdu?: string;
  brand?: string;
  unit: string;
  salePrice: number;
  wholesalePrice?: number;
  packs?: PackLike[];
  stock: number;
  trackSerial?: boolean;
};

const PACK_NAMES: Record<string, RegExp> = {
  dozen: /dozen|darjan|درجن|\b12\b/i,
  pack: /pack|packet|پیکٹ/i,
  box: /box|dabba|ڈبہ/i,
  carton: /carton|ctn|کارٹن/i,
};

/** Quantity (and pack size) on the bill for what was said: "Rs 500 ki cheeni" → 3.125 kg, "2 darjan anday" → 24 pcs. */
export function voiceQty(item: VoiceItem, p: VoiceProduct): { qty: number; pack: PackLike | null } {
  const loose = LOOSE_UNITS.has(p.unit);
  const pack = (item.unit && PACK_NAMES[item.unit] && p.packs?.find((k) => PACK_NAMES[item.unit!].test(k.name))) || null;
  if (item.rupees) {
    const price = sellPrice(p, pack, false);
    if (!(price > 0)) return { qty: 1, pack };
    return { qty: loose && !pack ? Math.round((item.rupees / price) * 1000) / 1000 : Math.max(1, Math.round(item.rupees / price)), pack };
  }
  let qty = item.qty ?? 1;
  if (!pack) {
    if (item.unit === "dozen" && p.unit !== "dozen") qty *= 12;
    if (item.unit === "kg" && p.unit === "g") qty *= 1000;
    if (item.unit === "litre" && p.unit === "ml") qty *= 1000;
  }
  return { qty: round2(qty) || 1, pack };
}

type Line = { said: string; item: VoiceItem; options: { product: VoiceProduct; score: number }[]; pick: string; qty: string; pack: PackLike | null };

function makeLines<P extends VoiceProduct>(text: string, products: P[]): Line[] {
  return parseItems(text).map((item) => {
    const options = topMatches(item.name, products, 4, 0.5);
    const best = bestMatch(item.name, products);
    const chosen = best && !best.product.trackSerial ? best.product : null;
    const q = chosen ? voiceQty(item, chosen) : { qty: item.qty ?? 1, pack: null };
    return { said: item.said, item, options, pick: chosen?._id ?? "", qty: String(q.qty), pack: q.pack };
  });
}

/** What was spoken at the counter, item by item, to check before it goes on the bill. */
export function VoiceBillModal<P extends VoiceProduct>({
  text,
  products,
  onClose,
  onAdd,
}: {
  text: string | null;
  products: P[];
  onClose: () => void;
  onAdd: (lines: { product: P; qty: number; pack: PackLike | null }[]) => void;
}) {
  const t = useT();
  const [lines, setLines] = useState<Line[]>([]);
  const byId = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  useEffect(() => {
    if (text) setLines(makeLines(text, products));
    // Only when new words arrive; the products list does not change while this is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (text === null) return null;

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const ready = lines
    .map((l) => ({ l, p: byId.get(l.pick) }))
    .filter((x): x is { l: Line; p: P } => !!x.p && !x.p.trackSerial && Number(x.l.qty) > 0);

  return (
    <Modal
      open
      onClose={onClose}
      title="Voice bill — check and add"
      size="lg"
      footer={
        <>
          <MicButton
            label="Speak more items"
            className="h-11 rounded-xl border border-slate-300 bg-white px-3"
            onText={(more) => setLines((ls) => [...ls, ...makeLines(more, products)])}
          />
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready.length} onClick={() => onAdd(ready.map(({ l, p }) => ({ product: p, qty: Number(l.qty), pack: l.pack })))}>
            {t("Add {n} to the bill", { n: ready.length })}
          </Button>
        </>
      }
    >
      <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <Mic className="mr-1 inline h-4 w-4 text-brand-600" />“{text}”
      </p>
      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{t("No items heard. Say for example: “do lux sabun, ek kilo cheeni”.")}</p>
      ) : (
        <ul className="space-y-3">
          {lines.map((l, i) => {
            const p = byId.get(l.pick);
            const price = p ? sellPrice(p, l.pack, false) : 0;
            return (
              <li key={i} className="rounded-2xl border border-slate-200 p-3">
                <div className="mb-2 text-xs text-slate-500">
                  {t("Heard")}: <span className="font-semibold text-slate-700">“{l.said}”</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={`Item for ${l.said}`}
                    className="min-w-0 flex-1"
                    value={l.pick}
                    onChange={(e) => {
                      const np = byId.get(e.target.value);
                      const q = np ? voiceQty(l.item, np) : { qty: Number(l.qty) || 1, pack: null };
                      set(i, { pick: e.target.value, qty: String(q.qty), pack: q.pack });
                    }}
                  >
                    <option value="">{l.options.length ? t("— Choose the item —") : t("— Not found, skip —")}</option>
                    {l.options.map((o) => (
                      <option key={o.product._id} value={o.product._id}>
                        {o.product.name}
                        {o.product.nameUrdu ? ` (${o.product.nameUrdu})` : ""} — {formatPKR(o.product.salePrice)}
                      </option>
                    ))}
                  </Select>
                  {p && !p.trackSerial && (
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Quantity for ${l.said}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        className="w-24 text-center"
                        value={l.qty}
                        onChange={(e) => set(i, { qty: e.target.value })}
                      />
                      <span className="w-14 text-sm text-slate-500">{l.pack ? l.pack.name : t(UNIT_LABELS[p.unit] ?? p.unit)}</span>
                    </div>
                  )}
                </div>
                {p?.trackSerial ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">{t("Phones go on the bill by IMEI — pick it from the product list.")}</p>
                ) : p ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {l.item.rupees ? `${t("Rs {amount} worth", { amount: l.item.rupees })} · ` : ""}
                    {formatQty(Number(l.qty) || 0)} × {formatPKR(price)} = <span className="font-semibold text-slate-800">{formatPKR(round2(price * (Number(l.qty) || 0)))}</span>
                    {p.stock < (Number(l.qty) || 0) * (l.pack?.size ?? 1) && <span className="ml-2 font-semibold text-rose-600">{t("Only {n} in stock", { n: formatQty(p.stock) })}</span>}
                  </p>
                ) : l.options.length ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">{t("Not sure which item — choose it, or it will be left out.")}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">{t("Not in your products — it will be left out.")}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

// ================================================================ voice assistant

type Party = { _id: string; name: string; phone?: string; balance: number; type: "customer" | "supplier" };
type Answer = { en: string; ur: string; roman: string; lines?: string[] };

const rs = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);
const SPEAK_KEY = "dukaan:voice-speak";

/** Customers whose name sounds like what was said, the closest first. */
function findParties(name: string, parties: Party[]) {
  const top = topMatches(name, parties, 5, 0.6);
  if (!top.length) return [];
  // Keep the ones as good as the best ("Shahid" → both Shahid Ali and Shahid Mehmood).
  return top.filter((x) => x.score >= top[0].score - 0.05).map((x) => x.product);
}

const EXAMPLES: [string, string][] = [
  ["Shahid ne 500 rupay diye", "Receive udhaar"],
  ["Shahid ke khate mein 300 likh do", "Add udhaar"],
  ["Bijli ka bill 4500", "Expense"],
  ["Aaj ki sale kitni hui", "Ask"],
  ["Cheeni ka stock kitna hai", "Ask"],
  ["Naya bill", "Open a page"],
];

/** Mic button in the menu / header: speak to save a payment, udhaar or expense, ask a question or open a page. */
export function VoiceButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Speak">
          <Mic className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-500 transition hover:border-brand-300 hover:text-brand-700"
          aria-label="Speak"
          title={t("Speak")}
        >
          <Mic className="h-4 w-4" />
        </button>
      )}
      {open && <VoiceAssistant onClose={() => setOpen(false)} />}
    </>
  );
}

function VoiceAssistant({ onClose }: { onClose: () => void }) {
  const sp = useSpeech();
  const t = useT();
  const [text, setText] = useState("");
  const [typed, setTyped] = useState("");
  const [cmd, setCmd] = useState<VoiceCommand | null>(null);
  const [round, setRound] = useState(0);
  const [aloud, setAloud] = useState(true);
  const router = useRouter();
  const toast = useToast();

  function run(said: string) {
    const s = said.trim();
    if (!s) return;
    const c = parseCommand(s);
    if (c.kind === "go") {
      onClose();
      toast.success(t("Opening {page}…", { page: t(c.label) }));
      router.push(c.path);
      return;
    }
    setText(s);
    setCmd(c);
    setRound((r) => r + 1);
  }
  const listen = () => sp.start(run);

  useEffect(() => {
    try {
      setAloud(localStorage.getItem(SPEAK_KEY) !== "off");
    } catch {
      /* ignore */
    }
  }, []);
  // Start listening as soon as the window opens.
  const started = useRef(false);
  useEffect(() => {
    if (sp.supported && !started.current) {
      started.current = true;
      listen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.supported]);

  return (
    <Modal open onClose={onClose} title="Speak to the app" size="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VoiceLangSwitch />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={aloud}
            onChange={(e) => {
              setAloud(e.target.checked);
              try {
                localStorage.setItem(SPEAK_KEY, e.target.checked ? "on" : "off");
              } catch {
                /* ignore */
              }
            }}
          />
          <Volume2 className="h-4 w-4" /> {t("Read answers aloud")}
        </label>
      </div>

      <div className="mt-4 flex flex-col items-center text-center">
        {sp.supported ? (
          <button
            type="button"
            onClick={() => (sp.listening ? sp.stop() : listen())}
            aria-label={sp.listening ? "Stop listening" : "Speak"}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition",
              sp.listening ? "animate-pulse bg-rose-600" : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            <Mic className="h-9 w-9" />
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <MicOff className="h-4 w-4" /> {t("Speaking works in Chrome or Edge. You can type below instead.")}
          </div>
        )}
        <p className="mt-2 min-h-5 text-sm text-slate-500">
          {sp.listening ? sp.interim || t("Listening… speak now") : sp.error ? <span className="text-rose-600">{t(sp.error)}</span> : sp.supported ? t("Press the mic and speak") : ""}
        </p>
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(typed);
          setTyped("");
        }}
      >
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("…or type it here")} aria-label="Type what you want" />
        <Button type="submit" variant="outline" disabled={!typed.trim()}>
          Go
        </Button>
      </form>

      {cmd ? (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate-500">
            {t("You said")}: <span className="font-semibold text-slate-800">“{text}”</span>
          </p>
          <CommandCard key={round} cmd={cmd} text={text} aloud={aloud} onClose={onClose} onAgain={listen} />
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t("You can say")}</div>
          <ul className="space-y-1.5">
            {EXAMPLES.map(([ex, what]) => (
              <li key={ex} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">“{ex}”</span>
                <span className="shrink-0 text-xs text-slate-400">{t(what)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">{t("Nothing is saved until you press Yes.")}</p>
        </div>
      )}
    </Modal>
  );
}

function CommandCard({ cmd, text, aloud, onClose, onAgain }: { cmd: VoiceCommand; text: string; aloud: boolean; onClose: () => void; onAgain: () => void }) {
  if (cmd.kind === "payment" || cmd.kind === "charge") return <KhataCard cmd={cmd} text={text} onClose={onClose} onAgain={onAgain} />;
  if (cmd.kind === "expense") return <ExpenseCard cmd={cmd} text={text} onClose={onClose} onAgain={onAgain} />;
  if (cmd.kind === "ask") return <AskCard cmd={cmd} aloud={aloud} />;
  if (cmd.kind === "search") return <SearchCard text={cmd.text} onClose={onClose} />;
  return null;
}

function OwnerOnly() {
  const t = useT();
  return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{t("Only the owner or a manager can do this.")}</p>;
}

function YesNo({ onYes, onNo, saving, disabled, yes }: { onYes: () => void; onNo: () => void; saving: boolean; disabled?: boolean; yes: string }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <Button variant="outline" size="lg" onClick={onNo}>
        No
      </Button>
      <Button size="lg" loading={saving} disabled={disabled} onClick={onYes} icon={<CheckCircle2 className="h-5 w-5" />}>
        {yes}
      </Button>
    </div>
  );
}

/** "Shahid ne 500 diye" / "Shahid ke khate mein 300 likh do": choose the customer, check, then Yes. */
function KhataCard({ cmd, text, onClose, onAgain }: { cmd: Extract<VoiceCommand, { kind: "payment" | "charge" }>; text: string; onClose: () => void; onAgain: () => void }) {
  const t = useT();
  const toast = useToast();
  const can = useCan();
  const { settings } = useSession();
  const [parties, setParties] = useState<Party[] | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [amount, setAmount] = useState(String(cmd.amount));
  const [method, setMethod] = useState<string>(cmd.kind === "payment" ? cmd.method : "cash");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ _id: string; refNo?: string; amount: number; balanceAfter: number; method?: string; createdAt: string } | null>(null);
  const isPay = cmd.kind === "payment";

  useEffect(() => {
    api<Party[]>("/api/parties?type=customer")
      .then((all) => {
        setParties(all);
        const found = findParties(cmd.name, all);
        if (found.length === 1) setParty(found[0]);
      })
      .catch((e) => toast.error((e as Error).message));
    // Once per spoken sentence (the toast helpers change on every message shown).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd.name]);

  if (!isPay && !can.manage) return <OwnerOnly />;
  if (!parties) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" />;
  const found = findParties(cmd.name, parties);
  const n = Number(amount) || 0;

  if (done) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="mt-1 font-bold text-emerald-900">
          {isPay ? t("Payment received") : t("Udhaar added")} — {formatPKR(Math.abs(done.amount))}
        </p>
        <p className="text-sm text-emerald-800">
          {party!.name} · {done.balanceAfter > 0 ? t("Udhaar now: {amount}", { amount: formatPKR(done.balanceAfter) }) : t("Khata clear — fully paid ✓")}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {isPay && (
            <Button size="sm" variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => printPaymentReceipt(done._id)}>
              Receipt
            </Button>
          )}
          {isPay && party!.phone && (
            <Button
              size="sm"
              variant="outline"
              icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}
              onClick={() => sendPaymentWhatsApp(settings, party!, done) && toast.success("WhatsApp opened — press Send there")}
            >
              WhatsApp
            </Button>
          )}
          <Button size="sm" variant="outline" icon={<Mic className="h-4 w-4" />} onClick={onAgain}>
            Speak again
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="rounded-2xl border border-slate-200 p-4">
        {found.length ? (
          <>
            <p className="mb-2 text-sm font-semibold text-slate-700">{t("Which customer?")}</p>
            <div className="space-y-2">
              {found.map((p) => (
                <button key={p._id} type="button" onClick={() => setParty(p)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-brand-400 hover:bg-brand-50">
                  <span>
                    <span className="block font-semibold text-slate-800">{p.name}</span>
                    {p.phone && <span className="text-xs text-slate-500">{p.phone}</span>}
                  </span>
                  <span className="text-sm text-slate-600">{formatPKR(p.balance)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">{t("No customer named “{name}” in the khata.", { name: cmd.name })}</p>
        )}
        <Button className="mt-3" variant="outline" size="sm" icon={<Mic className="h-4 w-4" />} onClick={onAgain}>
          Speak again
        </Button>
      </div>
    );
  }

  const after = round2(isPay ? party.balance - n : party.balance + n);
  async function save() {
    setSaving(true);
    try {
      const body = isPay ? { type: "payment", amount: n, method } : { type: "charge", amount: n, note: `${t("By voice")}: ${text}`.slice(0, 200) };
      const entry = await api<NonNullable<typeof done>>(`/api/parties/${party!._id}/payment`, { body });
      setDone(entry);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-4">
      <p className="text-lg font-bold text-slate-900">{isPay ? t("Receive {amount} from {name}?", { amount: formatPKR(n), name: party.name }) : t("Add {amount} udhaar to {name}?", { amount: formatPKR(n), name: party.name })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input aria-label="Voice amount" type="number" inputMode="decimal" min="0" className="w-36 text-lg font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {isPay && (
          <Select aria-label="Paid by" className="w-40" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "jazzcash", "easypaisa", "bank", "card"].map((m) => (
              <option key={m} value={m}>
                {t(PAYMENT_LABELS[m])}
              </option>
            ))}
          </Select>
        )}
        {found.length > 1 && (
          <button type="button" onClick={() => setParty(null)} className="text-sm font-semibold text-brand-700 underline">
            {t("Not this customer?")}
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {t("Udhaar now")}: <b>{formatPKR(party.balance)}</b> → {t("after")}: <b className={after > 0 ? "text-amber-700" : "text-emerald-700"}>{formatPKR(after)}</b>
      </p>
      <YesNo saving={saving} disabled={!(n > 0)} onYes={save} onNo={onClose} yes={isPay ? "Yes, receive" : "Yes, add udhaar"} />
    </div>
  );
}

/** "Bijli ka bill 4500" → Electricity Rs 4,500, saved only on Yes. */
function ExpenseCard({ cmd, text, onClose, onAgain }: { cmd: Extract<VoiceCommand, { kind: "expense" }>; text: string; onClose: () => void; onAgain: () => void }) {
  const t = useT();
  const toast = useToast();
  const can = useCan();
  const [category, setCategory] = useState(cmd.category);
  const [amount, setAmount] = useState(String(cmd.amount));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!can.manage) return <OwnerOnly />;
  const n = Number(amount) || 0;
  if (saved) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="mt-1 font-bold text-emerald-900">
          {t("Expense saved")} — {t(category)} {formatPKR(n)}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" variant="outline" icon={<Mic className="h-4 w-4" />} onClick={onAgain}>
            Speak again
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }
  async function save() {
    setSaving(true);
    try {
      await api("/api/expenses", { body: { category, amount: n, method: "cash", note: `${t("By voice")}: ${text}`.slice(0, 200) } });
      setSaved(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-4">
      <p className="text-lg font-bold text-slate-900">{t("Save expense {amount}?", { amount: formatPKR(n) })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Select aria-label="Expense type" className="w-48" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(c)}
            </option>
          ))}
        </Select>
        <Input aria-label="Voice amount" type="number" inputMode="decimal" min="0" className="w-36 text-lg font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{t("Paid in cash, from the drawer.")}</p>
      <YesNo saving={saving} disabled={!(n > 0)} onYes={save} onNo={onClose} yes="Yes, save" />
    </div>
  );
}

/** Works out the answer to a spoken question from the shop's own figures. */
async function answer(cmd: Extract<VoiceCommand, { kind: "ask" }>, manage: boolean): Promise<Answer> {
  const ownerOnly = { en: "Only the owner or a manager can see this.", ur: "یہ صرف مالک یا مینیجر دیکھ سکتا ہے۔", roman: "Ye sirf malik ya manager dekh sakta hai." };
  if (cmd.topic === "sales" || cmd.topic === "profit") {
    if (cmd.topic === "profit" && !manage) return ownerOnly;
    const d = await api<{ today: { sales: number; bills: number; profit: number; expenses: number } }>("/api/dashboard");
    const x = d.today;
    if (cmd.topic === "sales")
      return {
        en: `Today's sales: Rs ${rs(x.sales)} in ${x.bills} bills.`,
        ur: `آج کی سیل ${rs(x.sales)} روپے، ${x.bills} بل۔`,
        roman: `Aaj ki sale ${rs(x.sales)} rupay, ${x.bills} bill.`,
      };
    const net = round2(x.profit - x.expenses);
    return {
      en: `Today's profit: Rs ${rs(x.profit)}. Expenses Rs ${rs(x.expenses)}, so Rs ${rs(net)} net.`,
      ur: `آج کا منافع ${rs(x.profit)} روپے۔ خرچے ${rs(x.expenses)} روپے، خالص منافع ${rs(net)} روپے۔`,
      roman: `Aaj ka munafa ${rs(x.profit)} rupay. Kharchay ${rs(x.expenses)} rupay, khalis munafa ${rs(net)} rupay.`,
    };
  }
  if (cmd.topic === "udhaar") {
    const all = await api<Party[]>("/api/parties?type=customer");
    if (!cmd.name) {
      const due = all.filter((p) => p.balance > 0);
      const total = round2(due.reduce((a, p) => a + p.balance, 0));
      return {
        en: `Total udhaar: Rs ${rs(total)} from ${due.length} customers.`,
        ur: `کل ادھار ${rs(total)} روپے، ${due.length} گاہکوں سے۔`,
        roman: `Kul udhaar ${rs(total)} rupay, ${due.length} gahakon se.`,
        lines: due.slice(0, 5).map((p) => `${p.name}: Rs ${rs(p.balance)}`),
      };
    }
    const found = findParties(cmd.name, all);
    if (!found.length) return { en: `No customer named "${cmd.name}".`, ur: `"${cmd.name}" نام کا کوئی گاہک نہیں ملا۔`, roman: `"${cmd.name}" naam ka koi gahak nahi mila.` };
    const [p] = found;
    const head =
      p.balance > 0
        ? { en: `${p.name} owes Rs ${rs(p.balance)}.`, ur: `${p.name} کا ادھار ${rs(p.balance)} روپے ہے۔`, roman: `${p.name} ka udhaar ${rs(p.balance)} rupay hai.` }
        : p.balance < 0
          ? { en: `${p.name} has Rs ${rs(-p.balance)} advance.`, ur: `${p.name} کا ${rs(-p.balance)} روپے ایڈوانس ہے۔`, roman: `${p.name} ka ${rs(-p.balance)} rupay advance hai.` }
          : { en: `${p.name} owes nothing.`, ur: `${p.name} کا کوئی ادھار نہیں۔`, roman: `${p.name} ka koi udhaar nahi.` };
    return { ...head, lines: found.length > 1 ? found.map((x) => `${x.name}${x.phone ? ` (${x.phone})` : ""}: Rs ${rs(x.balance)}`) : undefined };
  }
  if (cmd.topic === "stock") {
    const products = await api<VoiceProduct[]>("/api/products?limit=5000");
    const hit = cmd.name ? bestMatch(cmd.name, products) : null;
    if (!hit) return { en: `No item named "${cmd.name ?? ""}".`, ur: `"${cmd.name ?? ""}" نام کی کوئی چیز نہیں ملی۔`, roman: `"${cmd.name ?? ""}" naam ki koi cheez nahi mili.` };
    const p = hit.product;
    const unit = UNIT_LABELS[p.unit] ?? p.unit;
    return {
      en: `${p.name}: ${formatQty(p.stock)} ${unit} in stock.`,
      ur: `${p.nameUrdu || p.name}: ${formatQty(p.stock)} ${unit} باقی ہیں۔`,
      roman: `${p.name}: ${formatQty(p.stock)} ${unit} baqi hain.`,
    };
  }
  if (cmd.topic === "late") {
    const r = await api<{ rows: { customerName: string; overdue: number; lateCount: number }[]; summary: { latePlans: number; overdue: number } }>("/api/installments?status=active&due=late");
    if (!r.rows.length) return { en: "No installment is late.", ur: "کوئی قسط لیٹ نہیں۔", roman: "Koi qist late nahi." };
    return {
      en: `${r.summary.latePlans} customers are late, Rs ${rs(r.summary.overdue)} due.`,
      ur: `${r.summary.latePlans} گاہک لیٹ ہیں، ${rs(r.summary.overdue)} روپے باقی۔`,
      roman: `${r.summary.latePlans} gahak late hain, ${rs(r.summary.overdue)} rupay baqi.`,
      lines: r.rows.slice(0, 6).map((x) => `${x.customerName}: Rs ${rs(x.overdue)} (${x.lateCount})`),
    };
  }
  // cash in the drawer
  if (!manage) return ownerOnly;
  const s = await api<{ shift: unknown; summary: { expectedCash: number } | null }>("/api/shifts/current");
  if (!s.shift || !s.summary) return { en: "The cash drawer is not open.", ur: "کیش دراز کھلا نہیں ہے۔", roman: "Cash daraz khula nahi hai." };
  const c = s.summary.expectedCash;
  return { en: `There should be Rs ${rs(c)} in the drawer.`, ur: `دراز میں ${rs(c)} روپے ہونے چاہئیں۔`, roman: `Daraz mein ${rs(c)} rupay hone chahiye.` };
}

function AskCard({ cmd, aloud }: { cmd: Extract<VoiceCommand, { kind: "ask" }>; aloud: boolean }) {
  const can = useCan();
  const { lang } = useLang();
  const [a, setA] = useState<Answer | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    answer(cmd, can.manage)
      .then((x) => {
        setA(x);
        if (aloud) speak(x.ur, x.roman);
      })
      .catch((e) => setErr((e as Error).message));
    // Asked once per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!a) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" />;
  return (
    <div role="region" aria-label="Answer" className="rounded-2xl bg-brand-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-lg font-bold text-brand-900" dir={lang === "ur" ? "rtl" : undefined}>
          {lang === "ur" ? a.ur : lang === "roman" ? a.roman : a.en}
        </p>
        <button type="button" onClick={() => speak(a.ur, a.roman)} className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-100" aria-label="Say it again">
          <Volume2 className="h-5 w-5" />
        </button>
      </div>
      {a.lines && (
        <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
          {a.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Anything else is looked up like the search box. */
function SearchCard({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  useEffect(() => {
    api<SearchGroup[]>(`/api/search?q=${encodeURIComponent(text)}`)
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [text]);
  if (!groups) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" />;
  const hits = groups.flatMap((g) => g.hits.map((h) => ({ ...h, group: g.label }))).slice(0, 8);
  if (!hits.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{t("Nothing found for “{q}”.", { q: text })}</p>;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-400">
        <Search className="h-3.5 w-3.5" /> {t("Found")}
      </p>
      <div className="space-y-1">
        {hits.map((h) => (
          <button
            key={`${h.type}-${h.id}`}
            type="button"
            onClick={() => {
              onClose();
              router.push(h.href);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-800">{h.title}</span>
              {h.subtitle && <span className="block truncate text-xs text-slate-500">{h.subtitle}</span>}
            </span>
            <span className="shrink-0 text-xs text-slate-400">{h.group}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
