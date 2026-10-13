/**
 * Understands what the shopkeeper said (Urdu script, Roman Urdu or English, as the browser's speech
 * recognition writes it): numbers ("barah sau pachaas", "ڈھائی ہزار"), item lists for a bill
 * ("do lux sabun, ek kilo cheeni, 500 rupay ki cheeni") and commands — payments, udhaar, expenses,
 * questions and "open …". Nothing here saves anything: the screen shows what was understood and the
 * shopkeeper confirms. No imports, so it runs the same in the browser and in tests.
 */

// ---------------------------------------------------------------- numbers

const UNITS: Record<string, number> = {
  // Roman Urdu
  ek: 1, aik: 1, ik: 1, do: 2, doh: 2, teen: 3, tin: 3, char: 4, chaar: 4, panch: 5, paanch: 5, panj: 5, che: 6, chay: 6, chhe: 6, chhay: 6,
  saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10, dus: 10, gyarah: 11, gyara: 11, giyara: 11, barah: 12, bara: 12, baara: 12, baarah: 12,
  terah: 13, tera: 13, chaudah: 14, chouda: 14, pandrah: 15, pandra: 15, solah: 16, sola: 16, satrah: 17, satra: 17, atharah: 18, athara: 18,
  unnees: 19, unees: 19, bees: 20, bis: 20, pachees: 25, pachis: 25, tees: 30, chalees: 40, chalis: 40, pachaas: 50, pachas: 50, pachaass: 50,
  saath: 60, sattar: 70, assi: 80, nabbe: 90, nabay: 90,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  // Urdu
  ایک: 1, دو: 2, تین: 3, چار: 4, پانچ: 5, چھ: 6, چھے: 6, سات: 7, آٹھ: 8, نو: 9, دس: 10, گیارہ: 11, بارہ: 12, تیرہ: 13, چودہ: 14, پندرہ: 15,
  سولہ: 16, سترہ: 17, اٹھارہ: 18, انیس: 19, بیس: 20, پچیس: 25, تیس: 30, چالیس: 40, پچاس: 50, ساٹھ: 60, ستر: 70, اسی: 80, نوے: 90,
};
const FRACTIONS: Record<string, number> = {
  aadha: 0.5, adha: 0.5, aadhi: 0.5, adhi: 0.5, half: 0.5, paav: 0.25, pao: 0.25, pau: 0.25, quarter: 0.25, dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5,
  آدھا: 0.5, آدھی: 0.5, پاؤ: 0.25, ڈیڑھ: 1.5, ڈھائی: 2.5,
};
const MULT: Record<string, number> = { sau: 100, so: 100, hundred: 100, سو: 100, hazar: 1000, hazaar: 1000, hajar: 1000, thousand: 1000, ہزار: 1000, lakh: 100000, lac: 100000, لاکھ: 100000 };
const SAWA = new Set(["sawa", "sava", "سوا"]);
const PAUNE = new Set(["paune", "pone", "پونے"]);

export const isNumberWord = (t: string) => /^\d+(\.\d+)?$/.test(t) || t in UNITS || t in FRACTIONS || t in MULT || SAWA.has(t) || PAUNE.has(t);

/** Reads a number starting at tokens[i] ("barah sau pachaas" = 1250, "2 hazar 500" = 2500). */
export function readNumber(tokens: string[], i: number): { value: number; next: number } | null {
  let total = 0;
  let current = 0;
  let pending: "sawa" | "paune" | null = null;
  let j = i;
  let any = false;
  // "do" is also "give" — a lone "do" right after "likh"/"de" is not a number (handled by callers).
  for (; j < tokens.length; j++) {
    const t = tokens[j];
    if (SAWA.has(t)) pending = "sawa";
    else if (PAUNE.has(t)) pending = "paune";
    else if (/^\d+(\.\d+)?$/.test(t)) current += Number(t);
    else if (t in UNITS) current += UNITS[t] + (pending === "sawa" ? 0.25 : pending === "paune" ? -0.25 : 0);
    else if (t in FRACTIONS) current += FRACTIONS[t];
    else if (t in MULT) {
      const m = MULT[t];
      let base = current || 1;
      if (pending === "sawa" && !current) base = 1.25;
      if (pending === "paune" && !current) base = 0.75;
      if (m === 100) current = base * 100;
      else {
        total += base * m;
        current = 0;
      }
    } else break;
    if (!SAWA.has(t) && !PAUNE.has(t)) pending = null;
    any = true;
  }
  if (!any || (total === 0 && current === 0)) return null;
  return { value: Math.round((total + current) * 1000) / 1000, next: j };
}

/** First amount of money in the words (skips "do" when it means "give"). */
export function findAmount(tokens: string[]): number | null {
  for (let i = 0; i < tokens.length; i++) {
    if (!isNumberWord(tokens[i])) continue;
    if ((tokens[i] === "do" || tokens[i] === "دو") && i > 0 && GIVE_BEFORE.has(tokens[i - 1])) continue;
    const n = readNumber(tokens, i);
    if (n) return n.value;
  }
  return null;
}
const GIVE_BEFORE = new Set(["likh", "de", "daal", "dal", "kar", "karo", "rakh", "لکھ", "دے", "ڈال", "کر", "رکھ"]);

// ---------------------------------------------------------------- text

const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Lower case, Western digits, "1,250" → "1250", "Rs." / "rupay" / "روپے" → "rs", punctuation to spaces. */
export function normalize(text: string) {
  let s = text.toLowerCase().normalize("NFC");
  s = s.replace(/[۰-۹]/g, (d) => String(URDU_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  s = s.replace(/\brs\.?(?=\s|\d|$)/g, " rs ").replace(/\b(rupay|rupaye|rupe|rupees|rupee|rupiya|rupaiya)\b/g, " rs ").replace(/(روپے|روپیہ|روپئے|روپیے)/g, " rs ");
  s = s.replace(/(\d)(rs|kg|g|ml)\b/g, "$1 $2");
  s = s.replace(/[?!؟"“”'’]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
const words = (s: string) => s.split(" ").filter(Boolean);

// ---------------------------------------------------------------- items for a bill

export type VoiceItem = { said: string; name: string; qty?: number; unit?: string; rupees?: number };

const UNIT_WORDS: Record<string, string> = {
  kilo: "kg", kg: "kg", kilogram: "kg", kilograms: "kg", کلو: "kg",
  gram: "g", grams: "g", gm: "g", g: "g", گرام: "g",
  litre: "litre", liter: "litre", litres: "litre", ltr: "litre", لیٹر: "litre",
  ml: "ml",
  darjan: "dozen", dozen: "dozen", درجن: "dozen",
  packet: "pack", pack: "pack", paket: "pack", packets: "pack", پیکٹ: "pack",
  dabba: "box", dibba: "box", box: "box", ڈبہ: "box", ڈبے: "box",
  carton: "carton", کارٹن: "carton",
  adad: "pcs", piece: "pcs", pieces: "pcs", pcs: "pcs", عدد: "pcs", dana: "pcs", daane: "pcs",
};
const FILLER = new Set([
  "ki", "ka", "ke", "kay", "wala", "wali", "wale", "de", "do", "dein", "dena", "dedo", "chahiye", "chaiye", "please", "bhai", "aur", "and", "or", "plus", "the", "of", "a", "an", "bhi", "zara", "mujhe", "hamein", "add",
  "کی", "کا", "کے", "والا", "والی", "والے", "دے", "دو", "دیں", "دینا", "چاہیے", "چاہئے", "بھائی", "اور", "بھی", "ذرا", "مجھے",
]);

/** "do lux sabun, ek kilo cheeni aur 500 rupay ki cheeni" → three items. */
export function parseItems(text: string): VoiceItem[] {
  const s = normalize(text);
  // "." splits only between words, so "1.5 kilo" stays one number; Urdu "اور" only as a whole word.
  const parts = s.split(/\s*(?:,|،|۔|(?<!\d)\.(?!\d)|;|\baur\b|\band\b|\bphir\b|\bthen\b|\bplus\b)\s*|\s+(?:اور|پھر)\s+/).filter((p) => p && p.trim());
  const out: VoiceItem[] = [];
  for (const raw of parts) {
    // "… daal do" / "… add karo" mean "put it on the bill" (but "daal" alone is lentils).
    const part = raw.replace(/\s+(?:daal|dal|add) (?:do|dein|dena|karo|kar do)$/, "").replace(/\s+(?:ڈال دو|ڈال دیں)$/, "");
    const t = words(part);
    let qty: number | undefined;
    let unit: string | undefined;
    let rupees: number | undefined;
    const nameTokens: string[] = [];
    for (let i = 0; i < t.length; ) {
      // "do" at the very end ("cheeni de do") is "give", not 2.
      const isGiveDo = (t[i] === "do" || t[i] === "دو") && i > 0 && (t[i - 1] === "de" || t[i - 1] === "دے");
      if (!isGiveDo && isNumberWord(t[i]) && !(t[i] === "do" && i === t.length - 1 && t.length > 1)) {
        const n = readNumber(t, i);
        if (n) {
          if (t[n.next] === "rs") {
            rupees = n.value;
            i = n.next + 1;
          } else {
            qty = n.value;
            i = n.next;
          }
          continue;
        }
      }
      if (t[i] === "rs") {
        i++;
        continue;
      }
      if (UNIT_WORDS[t[i]]) {
        unit = UNIT_WORDS[t[i]];
        i++;
        continue;
      }
      if (!FILLER.has(t[i])) nameTokens.push(t[i]);
      i++;
    }
    const name = nameTokens.join(" ").trim();
    if (!name) continue;
    if (unit === "g" && qty !== undefined) {
      qty = qty / 1000;
      unit = "kg";
    }
    if (unit === "ml" && qty !== undefined) {
      qty = qty / 1000;
      unit = "litre";
    }
    out.push({ said: part, name, ...(qty !== undefined ? { qty } : {}), ...(unit ? { unit } : {}), ...(rupees !== undefined ? { rupees } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------- sound-alike matching

const URDU_LETTERS: Record<string, string> = {
  ب: "b", پ: "p", ت: "t", ٹ: "t", ث: "s", ج: "j", چ: "C", ح: "", خ: "K", د: "d", ڈ: "d", ذ: "z", ر: "r", ڑ: "r", ز: "z", ژ: "z", س: "s", ش: "S", ص: "s",
  ض: "z", ط: "t", ظ: "z", ع: "", غ: "G", ف: "f", ق: "k", ک: "k", گ: "g", ل: "l", م: "m", ن: "n", ں: "n", و: "", ہ: "", ھ: "", ۂ: "", ء: "", ی: "", ے: "",
  ئ: "", ا: "", آ: "", أ: "", ة: "",
};

/** Consonant skeleton that sounds the same in Urdu script and Roman letters: "cheeni" and "چینی" → "Cn". */
export function soundKey(word: string): string {
  let w = word.toLowerCase();
  if (/[؀-ۿ]/.test(w)) return [...w].map((c) => URDU_LETTERS[c] ?? "").join("").replace(/(.)\1+/g, "$1");
  w = w.replace(/[^a-z]/g, "");
  w = w.replace(/x/g, "ks").replace(/ph/g, "f").replace(/ck/g, "k").replace(/q/g, "k");
  w = w.replace(/ch/g, "C").replace(/sh/g, "S").replace(/kh/g, "K").replace(/gh/g, "G");
  w = w.replace(/c(?=[eiy])/g, "s").replace(/c/g, "k");
  w = w.replace(/([tdbpjgk])h/g, "$1");
  w = w.replace(/[aeiouywvh]/g, "");
  return w.replace(/(.)\1+/g, "$1");
}

/** Common Urdu / Roman words for things whose product name is English. */
const SYNONYMS: Record<string, string[]> = {
  sugar: ["cheeni", "chini", "چینی"],
  rice: ["chawal", "chaawal", "چاول"],
  eggs: ["anday", "ande", "anda", "aanda", "انڈے", "انڈا"],
  egg: ["anda", "انڈا"],
  milk: ["doodh", "dudh", "دودھ"],
  tea: ["chai", "patti", "pati", "چائے", "پتی"],
  salt: ["namak", "نمک"],
  oil: ["tel", "تیل"],
  soap: ["sabun", "saban", "صابن"],
  bread: ["roti", "double", "dabal", "ڈبل", "روٹی"],
  yogurt: ["dahi", "dahee", "دہی"],
  biscuits: ["biskut", "biscut", "بسکٹ"],
  water: ["pani", "paani", "پانی"],
  butter: ["makhan", "مکھن"],
  flour: ["aata", "atta", "آٹا"],
  atta: ["aata", "آٹا"],
  matchbox: ["machis", "maachis", "ماچس"],
  washing: ["surf", "سرف"],
  powder: ["surf", "سرف"],
  cover: ["kavar", "کور"],
  charger: ["chaarjar", "چارجر"],
  glass: ["glas", "گلاس"],
};

type Matchable = { name: string; nameUrdu?: string; brand?: string; fits?: string; barcode?: string };

function lev(a: string, b: string) {
  if (a === b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const close = (a: string, b: string) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 3 && lev(a, b) <= 1) || (a.length >= 3 && b.startsWith(a)));

/** How well what was said fits a product (0–1). */
export function matchScore(said: string, p: Matchable): number {
  const q = words(normalize(said));
  if (!q.length) return 0;
  const candidate = [p.name, p.nameUrdu, p.brand].filter(Boolean).join(" ");
  const cWords = words(normalize(candidate));
  const cKeys = cWords.map(soundKey).filter(Boolean);
  // English product words also answer to their Urdu / Roman names ("Sugar" ← "cheeni").
  for (const w of cWords) for (const s of SYNONYMS[w] ?? []) cKeys.push(soundKey(s));
  const plain = candidate.toLowerCase();
  let hit = 0;
  for (const w of q) {
    if (plain.includes(w) && w.length >= 3) hit += 1;
    else if (cKeys.some((k) => close(soundKey(w), k))) hit += 0.9;
  }
  const words_ = hit / q.length;
  // Whole-name sound similarity helps when words are split differently ("lux sabun" / "لکس صابن").
  const qk = q.map(soundKey).join("");
  const nameKeys = [p.name, p.nameUrdu].filter(Boolean).map((n) => words(normalize(n!)).map(soundKey).join(""));
  const whole = Math.max(0, ...nameKeys.map((k) => (k && qk ? 1 - lev(qk, k) / Math.max(qk.length, k.length) : 0)));
  return Math.max(words_, whole * 0.95);
}

/** The closest few products (best first), for "did you mean…?". */
export function topMatches<T extends Matchable>(said: string, products: T[], n = 3, min = 0.45): { product: T; score: number }[] {
  return products
    .map((product) => ({ product, score: matchScore(said, product) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** Best product for what was said, if it fits well enough. */
export function bestMatch<T extends Matchable>(said: string, products: T[], min = 0.6): { product: T; score: number } | null {
  let best: { product: T; score: number } | null = null;
  for (const p of products) {
    const s = matchScore(said, p);
    if (s > (best?.score ?? 0)) best = { product: p, score: s };
  }
  return best && best.score >= min ? best : null;
}

// ---------------------------------------------------------------- commands

export type VoiceCommand =
  | { kind: "payment"; name: string; amount: number; method: "cash" | "jazzcash" | "easypaisa" | "bank" }
  | { kind: "charge"; name: string; amount: number }
  | { kind: "expense"; category: string; amount: number; note: string }
  | { kind: "ask"; topic: "sales" | "profit" | "udhaar" | "stock" | "late" | "cash"; name?: string }
  | { kind: "go"; path: string; label: string }
  | { kind: "search"; text: string };

const EXPENSE_WORDS: [RegExp, string][] = [
  [/\b(bijli|electricity|light|wapda|lesco|mepco|iesco|fesco|gepco)\b|بجلی|واپڈا/, "Electricity"],
  [/\b(gas|sui)\b|گیس/, "Gas"],
  [/\b(pani|paani|water)\b|پانی/, "Water"],
  [/\b(kiraya|kiraaya|rent)\b|کرایہ/, "Rent"],
  [/\b(tankhwah|tankhah|salary|salaries)\b|تنخواہ/, "Salaries"],
  [/\b(chai|chaye|khana|tea|food|lunch|nashta)\b|چائے|کھانا|ناشتہ/, "Tea & Food"],
  [/\b(petrol|diesel|rickshaw|transport|bhara|bhaara|fare|gaari)\b|پیٹرول|کرایہ گاڑی|بھاڑا|رکشہ/, "Transport"],
  [/\b(marammat|repair|mistri)\b|مرمت|مستری/, "Repairs"],
  [/\b(shopper|shoppers|thaile|thailay|packing|packaging)\b|شاپر|تھیلے/, "Packaging"],
];
const EXPENSE_HINT = /\b(kharcha|kharch|kharchay|expense|expenses|bill)\b|خرچہ|خرچ|خرچے|بل/;
const ALL_WORDS = new Set(["", "kul", "total", "sara", "saara", "sab", "tamam", "aaj", "کل", "سارا", "سب", "تمام", "آج"]);
const QUESTION = /\b(kitna|kitni|kitne|kitnay|kya|batao|bataen|bataiye|bataye|how|what|kaun|kon|kis)\b|کتنا|کتنی|کتنے|کیا|بتاؤ|بتائیں|کون/;

const GO: [RegExp, string, string][] = [
  [/\b(naya bill|new bill|bill banao|bill banana|sale screen)\b|نیا بل|بل بناؤ/, "/pos", "New Bill"],
  [/\b(udhaar report|udhar report)\b|ادھار رپورٹ/, "/udhaar", "Udhaar Report"],
  [/\b(khata|khaata|customers|gahak)\b|کھاتہ|کھاتے|گاہک/, "/customers", "Customers Khata"],
  [/\b(din band|day close|daraz|drawer|cash drawer)\b|دن بند|دراز/, "/drawer", "Cash Drawer"],
  [/\b(report|reports|hisaab|hisab)\b|رپورٹ|حساب/, "/reports", "Reports"],
  [/\b(kharchay|kharche|expenses|kharcha)\b|اخراجات|خرچے/, "/expenses", "Expenses"],
  [/\b(products|stock list|ashya|maal)\b|اشیاء|مال/, "/products", "Products & Stock"],
  [/\b(order list|reorder|mangwana)\b|آرڈر/, "/reorder", "Reorder List"],
  [/\b(repair|repairs|marammat)\b|مرمت/, "/repairs", "Repairs"],
  [/\b(qist|qistein|qiston|installments?)\b|قسط|قسطیں/, "/installments", "Installments"],
  [/\b(easyload|easy load|load|wallet|jazzcash|easypaisa)\b|ایزی لوڈ/, "/wallets", "Easyload & Wallets"],
  [/\b(phones|imei|mobile phones)\b|موبائل/, "/phones", "Phones"],
  [/\b(settings|setting)\b|سیٹنگ/, "/settings", "Settings"],
  [/\b(purchase|khareedari|khareed)\b|خریداری/, "/purchases", "Purchases"],
  [/\b(help|madad)\b|مدد/, "/help", "Help"],
];

const clean = (s: string) =>
  words(s)
    .filter((w) => !FILLER.has(w) && w !== "rs" && !isNumberWord(w))
    .join(" ")
    .trim();

/** What the shopkeeper wants done. Anything not understood becomes a search. */
export function parseCommand(text: string): VoiceCommand {
  const s = normalize(text);
  const t = words(s);
  const amount = findAmount(t);
  const method = /jazz ?cash|جاز ?کیش/.test(s) ? "jazzcash" : /easy ?paisa|ایزی ?پیسہ/.test(s) ? "easypaisa" : /\bbank\b|بینک/.test(s) ? "bank" : "cash";

  // Payment: "Shahid ne 500 rupay diye", "شاہد نے پانچ سو روپے دیے", "received 500 from Shahid", "Shahid paid 500".
  let m =
    s.match(/^(.+?) (?:ne|nay|nein) (.+?) (?:diye|diya|diay|dye|de diye|de gaye|de gya|de gaya|jama karwaye|jama karaye|jama kiye|ada kiye|ada kar diye|bheje|bhej diye)\b/) ??
    s.match(/^(.+?) نے (.+?) (?:دیے|دیئے|دیا|دے دیے|دے گئے|جمع کروائے|جمع کرائے|ادا کیے|بھیجے)/);
  if (m && amount) return { kind: "payment", name: clean(m[1]), amount, method };
  m = s.match(/\b(?:received|got|receive|collected|collect) (.+?) (?:from) (.+)$/);
  if (m && amount) return { kind: "payment", name: clean(m[2]), amount, method };
  m = s.match(/^(.+?) (?:paid|has paid|gave) (.+)$/);
  if (m && amount) return { kind: "payment", name: clean(m[1]), amount, method };

  // Udhaar by hand: "Shahid ke khate mein 300 likh do", "Shahid ko 300 udhaar", "add 300 to Shahid's khata".
  m =
    s.match(/^(.+?) (?:ke|ka|ki|kay) (?:khate|khata|khaate|khaata|khatay|account) (?:mein|me|main|mai|mn|men) (.+)$/) ??
    s.match(/^(.+?) (?:کے|کا|کی) (?:کھاتے|کھاتہ) (?:میں|مے) (.+)$/);
  if (m && amount) return { kind: "charge", name: clean(m[1]), amount };
  m = s.match(/^(.+?) (?:ko|کو) (.+?) (?:udhaar|udhar|ادھار)\b/) ?? s.match(/^(.+?) (?:ko|کو) (.+?) ادھار/);
  if (m && amount) return { kind: "charge", name: clean(m[1]), amount };
  m = s.match(/\badd (.+?) to (.+?)(?:'s)? (?:khata|account)\b/);
  if (m && amount) return { kind: "charge", name: clean(m[2]), amount };

  // Questions.
  if (QUESTION.test(s)) {
    if (/\b(munafa|profit|bachat|faida)\b|منافع|فائدہ/.test(s)) return { kind: "ask", topic: "profit" };
    if (/\b(sale|sales|bikri|bechi|biki|becha)\b|فروخت|سیل|بکری/.test(s)) return { kind: "ask", topic: "sales" };
    if (/\b(qist|qistein|qiston|installment|installments)\b|قسط/.test(s)) return { kind: "ask", topic: "late" };
    if (/\b(cash|daraz|drawer|naqd|naqdi)\b|دراز|نقد/.test(s)) return { kind: "ask", topic: "cash" };
    const owes = s.match(/^(.+?) (?:ka|ki|ke|kay|کا|کی|کے) (?:udhaar|udhar|khata|khaata|baqaya|bakaya|ادھار|کھاتہ|بقایا)/) ?? s.match(/\bhow much (?:does|do) (.+?) owe\b/);
    if (owes && !ALL_WORDS.has(clean(owes[1]))) return { kind: "ask", topic: "udhaar", name: clean(owes[1]) };
    if (/\b(udhaar|udhar|baqaya|owe)\b|ادھار|بقایا/.test(s)) return { kind: "ask", topic: "udhaar" };
    const stock = s.match(/^(.+?) (?:ka|ki|ke|kay|کا|کی|کے) (?:stock|maal|اسٹاک|مال)/) ?? s.match(/\bstock (?:of|for) (.+?)(?: is| left|$)/) ?? s.match(/^(.+?) (?:kitna|kitni|kitne|کتنا|کتنی|کتنے) (?:hai|hain|bacha|bachi|bache|reh|ہے|ہیں|بچا|بچی)/);
    if (stock) return { kind: "ask", topic: "stock", name: clean(stock[1]) };
  }

  // Expense: "bijli ka bill 4500", "chai 150", "kharcha 300 rickshaw".
  if (amount) {
    const cat = EXPENSE_WORDS.find(([rx]) => rx.test(s));
    if (cat || EXPENSE_HINT.test(s)) return { kind: "expense", category: cat ? cat[1] : "Other", amount, note: text.trim() };
  }

  // Open a page: "naya bill", "khata kholo", "din band karo".
  if (!amount && t.length <= 5) {
    const go = GO.find(([rx]) => rx.test(s));
    if (go) return { kind: "go", path: go[1], label: go[2] };
  }
  return { kind: "search", text: text.trim() };
}
