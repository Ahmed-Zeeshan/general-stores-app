import { createJiti } from "jiti";
import { ok, eq, section, done } from "../lib/harness.mjs";

// ---------- Understanding speech: numbers, item lists, commands, sound-alike product names ----------
const jiti = createJiti(import.meta.url);
const v = await jiti.import("../../src/lib/voice-parse.ts");
const num = (s) => v.findAmount(v.normalize(s).split(" "));

section("Numbers");
eq(num("500"), 500, "digits");
eq(num("1,250 rupay"), 1250, "1,250 with a comma");
eq(num("barah sau pachaas"), 1250, "barah sau pachaas = 1250");
eq(num("do hazaar paanch sau"), 2500, "do hazaar paanch sau = 2500");
eq(num("dhai hazar"), 2500, "dhai hazar = 2500");
eq(num("dedh sau"), 150, "dedh sau = 150");
eq(num("sawa sau"), 125, "sawa sau = 125");
eq(num("paune do"), 1.75, "paune do = 1.75");
eq(num("ڈھائی ہزار روپے"), 2500, "Urdu: ڈھائی ہزار = 2500");
eq(num("پانچ سو"), 500, "Urdu: پانچ سو = 500");
eq(num("۱۲۰۰"), 1200, "Urdu digits ۱۲۰۰");
eq(num("two thousand five hundred"), 2500, "English words");
eq(num("ek lakh"), 100000, "ek lakh");
eq(num("likh do"), null, "'likh do' (write it down) is not 2");

section("Items for a bill");
let items = v.parseItems("do lux sabun, ek kilo cheeni aur 500 rupay ki cheeni");
ok(items.length === 3, "three items");
ok(items[0].qty === 2 && items[0].name === "lux sabun", "2 × lux sabun");
ok(items[1].qty === 1 && items[1].unit === "kg" && items[1].name === "cheeni", "1 kg cheeni");
ok(items[2].rupees === 500 && items[2].name === "cheeni", "Rs 500 of cheeni");
items = v.parseItems("dhai kilo aata, teen anday");
ok(items[0].qty === 2.5 && items[0].unit === "kg" && items[1].qty === 3 && items[1].name === "anday", "dhai kilo aata, teen anday");
items = v.parseItems("آدھا کلو چینی اور دو درجن انڈے");
ok(items.length === 2 && items[0].qty === 0.5 && items[0].unit === "kg" && items[1].qty === 2 && items[1].unit === "dozen", "Urdu: آدھا کلو چینی اور دو درجن انڈے");
items = v.parseItems("250 gram chai patti");
ok(items[0].qty === 0.25 && items[0].unit === "kg" && items[0].name === "chai patti", "250 gram = 0.25 kg");
items = v.parseItems("cheeni de do");
ok(items.length === 1 && items[0].qty === undefined && items[0].name === "cheeni", "'cheeni de do': no quantity, just the item");
items = v.parseItems("1.5 kilo daal");
ok(items[0].qty === 1.5 && items[0].name === "daal", "1.5 kilo daal (decimal kept)");
items = v.parseItems("اورنج جوس");
ok(items.length === 1 && items[0].name === "اورنج جوس", "'اورنج' is not split as 'اور'");

section("Sound-alike product names");
const products = [
  { _id: "1", name: "Lux Soap", nameUrdu: "لکس صابن" },
  { _id: "2", name: "Sugar", nameUrdu: "چینی" },
  { _id: "3", name: "Eggs" },
  { _id: "4", name: "Tea Pack 475g", nameUrdu: "چائے پیک" },
  { _id: "5", name: "Chicken Patties" },
  { _id: "6", name: "Basmati Rice", nameUrdu: "باسمتی چاول" },
  { _id: "7", name: "Fast Charger 20W" },
];
const best = (s) => v.bestMatch(s, products)?.product.name ?? null;
eq(best("lux sabun"), "Lux Soap", "lux sabun → Lux Soap");
eq(best("لکس صابن"), "Lux Soap", "لکس صابن → Lux Soap");
eq(best("cheeni"), "Sugar", "cheeni → Sugar (Urdu name)");
eq(best("chini"), "Sugar", "chini → Sugar");
eq(best("anday"), "Eggs", "anday → Eggs (no Urdu name, known word)");
eq(best("انڈے"), "Eggs", "انڈے → Eggs");
eq(best("basmati chawal"), "Basmati Rice", "basmati chawal → Basmati Rice");
eq(best("charger"), "Fast Charger 20W", "charger → Fast Charger 20W");
eq(best("pepsi"), null, "something the shop doesn't have: no match");
ok(v.topMatches("chai", products).length >= 1, "close matches offered for a choice");

section("Payments and udhaar");
let c = v.parseCommand("Shahid ne 500 rupay diye");
ok(c.kind === "payment" && c.name === "shahid" && c.amount === 500 && c.method === "cash", "Shahid ne 500 rupay diye → receive Rs 500 from Shahid");
c = v.parseCommand("شاہد نے پانچ سو روپے دیے");
ok(c.kind === "payment" && c.name === "شاہد" && c.amount === 500, "Urdu: شاہد نے پانچ سو روپے دیے");
c = v.parseCommand("Usman Ghani ne do hazaar jazzcash se bheje");
ok(c.kind === "payment" && c.name === "usman ghani" && c.amount === 2000 && c.method === "jazzcash", "JazzCash payment");
c = v.parseCommand("received 1500 from Bilal");
ok(c.kind === "payment" && c.name === "bilal" && c.amount === 1500, "English: received 1500 from Bilal");
c = v.parseCommand("Shahid ke khate mein 300 likh do");
ok(c.kind === "charge" && c.name === "shahid" && c.amount === 300, "Shahid ke khate mein 300 likh do → udhaar Rs 300");
c = v.parseCommand("شاہد کے کھاتے میں تین سو لکھ دو");
ok(c.kind === "charge" && c.amount === 300, "Urdu udhaar");
c = v.parseCommand("Bilal ko 700 udhaar de do");
ok(c.kind === "charge" && c.name === "bilal" && c.amount === 700, "Bilal ko 700 udhaar");

section("Expenses");
c = v.parseCommand("bijli ka bill 4500");
ok(c.kind === "expense" && c.category === "Electricity" && c.amount === 4500, "bijli ka bill 4500 → Electricity");
c = v.parseCommand("chai 150");
ok(c.kind === "expense" && c.category === "Tea & Food" && c.amount === 150, "chai 150 → Tea & Food");
c = v.parseCommand("rickshaw ka kiraya 200");
ok(c.kind === "expense" && c.amount === 200 && ["Transport", "Rent"].includes(c.category), "rickshaw 200 → transport");
c = v.parseCommand("خرچہ تین سو");
ok(c.kind === "expense" && c.category === "Other" && c.amount === 300, "Urdu: خرچہ تین سو");

section("Questions");
eq(v.parseCommand("aaj ki sale kitni hui").topic, "sales", "aaj ki sale kitni hui");
eq(v.parseCommand("آج کتنی فروخت ہوئی").topic, "sales", "Urdu sales question");
eq(v.parseCommand("aaj ka munafa kitna hai").topic, "profit", "profit");
c = v.parseCommand("Shahid ka udhaar kitna hai");
ok(c.topic === "udhaar" && c.name === "shahid", "Shahid ka udhaar kitna hai");
c = v.parseCommand("kul udhaar kitna hai");
ok(c.topic === "udhaar" && !c.name, "total udhaar (no name)");
c = v.parseCommand("cheeni ka stock kitna hai");
ok(c.topic === "stock" && c.name === "cheeni", "cheeni ka stock");
c = v.parseCommand("cheeni kitni bachi hai");
ok(c.topic === "stock" && c.name === "cheeni", "cheeni kitni bachi hai");
eq(v.parseCommand("kaun kaun qist mein late hai").topic, "late", "late installments");
eq(v.parseCommand("daraz mein kitna cash hai").topic, "cash", "cash in the drawer");

section("Open a page, or search");
c = v.parseCommand("naya bill");
ok(c.kind === "go" && c.path === "/pos", "naya bill → New Bill");
eq(v.parseCommand("khata kholo").path, "/customers", "khata kholo → khata");
eq(v.parseCommand("din band karo").path, "/drawer", "din band karo → cash drawer");
eq(v.parseCommand("نیا بل").path, "/pos", "Urdu: نیا بل");
c = v.parseCommand("Shahid Mehmood");
ok(c.kind === "search" && c.text === "Shahid Mehmood", "a name alone → search");
await done();
