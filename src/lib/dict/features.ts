/**
 * Pricing tools in Urdu and Roman Urdu: a customer's special prices, discount on one item, price history,
 * bulk price update and correcting a saved bill.
 * English text → [Urdu, Roman Urdu]. {placeholders} stay as they are; numbers stay in English digits.
 */
export const DICT_FEATURES: Record<string, [string, string]> = {
  // ----- Special prices per customer -----
  "Special prices": ["خاص ریٹ", "Khaas rate"],
  "Special price": ["خاص ریٹ", "Khaas rate"],
  "Special prices saved": ["خاص ریٹ محفوظ ہو گئے", "Khaas rate mehfooz ho gaye"],
  "Save special prices": ["خاص ریٹ محفوظ کریں", "Khaas rate mehfooz karein"],
  "Items {name} always gets at their own price. On a bill for {name} these prices come in by themselves — before wholesale and normal prices.": [
    "وہ چیزیں جو {name} کو ہمیشہ اپنے ریٹ پر ملتی ہیں۔ {name} کے بل پر یہ ریٹ خود لگ جاتے ہیں — ہول سیل اور عام ریٹ سے پہلے۔",
    "Woh cheezein jo {name} ko hamesha apne rate par milti hain. {name} ke bill par ye rate khud lag jate hain — wholesale aur aam rate se pehle.",
  ],
  "Add an item: type its name or scan the barcode": ["چیز شامل کریں: نام لکھیں یا بارکوڈ اسکین کریں", "Cheez shamil karein: naam likhein ya barcode scan karein"],
  removed: ["ہٹا دی گئی", "hata di gayi"],
  "{amount} less": ["{amount} کم", "{amount} kam"],
  "{amount} more": ["{amount} زیادہ", "{amount} zyada"],
  "Not saved yet": ["ابھی محفوظ نہیں ہوا", "Abhi mehfooz nahi hua"],
  "No special prices": ["کوئی خاص ریٹ نہیں", "Koi khaas rate nahi"],
  "Add the items this customer gets at a different price.": ["وہ چیزیں شامل کریں جو اس گاہک کو الگ ریٹ پر ملتی ہیں۔", "Woh cheezein shamil karein jo is gahak ko alag rate par milti hain."],
  "This customer pays the normal prices.": ["یہ گاہک عام ریٹ دیتا ہے۔", "Ye gahak aam rate deta hai."],
  "Normal price": ["عام ریٹ", "Aam rate"],
  "Customer special prices": ["گاہک کے خاص ریٹ", "Gahak ke khaas rate"],

  // ----- Discount on one item -----
  "Discount on this item": ["اس چیز پر رعایت", "Is cheez par riayat"],

  // ----- Price history -----
  "Price history": ["ریٹ کی تاریخ", "Rate ki tareekh"],
  "Price history — {name}": ["ریٹ کی تاریخ — {name}", "Rate ki tareekh — {name}"],
  "No price changes yet": ["ابھی تک ریٹ نہیں بدلا", "Abhi tak rate nahi badla"],
  "Every change of this item's prices will be listed here.": ["اس چیز کے ریٹ کی ہر تبدیلی یہاں لکھی ہوگی۔", "Is cheez ke rate ki har tabdeeli yahan likhi hogi."],
  Why: ["وجہ", "Wajah"],
  "New item": ["نئی چیز", "Nayi cheez"],
  "Changed by hand": ["ہاتھ سے بدلا", "Haath se badla"],
  "Imported (CSV)": ["امپورٹ (CSV)", "Import (CSV)"],
  "Bulk price update": ["ایک ساتھ ریٹ تبدیلی", "Ek saath rate tabdeeli"],
  "Production cost": ["تیاری کی لاگت", "Tayyari ki laagat"],

  // ----- Bulk price update -----
  "Update prices": ["ریٹ بدلیں", "Rate badlein"],
  "Which items": ["کون سی چیزیں", "Kaun si cheezein"],
  "Which price": ["کون سا ریٹ", "Kaun sa rate"],
  "All items": ["سب چیزیں", "Sab cheezein"],
  "all items": ["سب چیزیں", "sab cheezein"],
  "Wholesale price": ["ہول سیل ریٹ", "Wholesale rate"],
  Increase: ["بڑھائیں", "Barhayein"],
  Decrease: ["کم کریں", "Kam karein"],
  "By how many %": ["کتنے % سے", "Kitne % se"],
  "By how many rupees (per unit)": ["کتنے روپے سے (فی یونٹ)", "Kitne rupay se (fi unit)"],
  "Round the new price": ["نیا ریٹ گول کریں", "Naya rate gol karein"],
  "No rounding": ["گول نہ کریں", "Gol na karein"],
  "Change {n} prices?": ["{n} ریٹ بدلیں؟", "{n} rate badlein?"],
  "{field} of {scope}: {how}.": ["{scope} کا {field}: {how}۔", "{scope} ka {field}: {how}."],
  "The old prices are kept in each item's price history.": ["پرانے ریٹ ہر چیز کی ریٹ کی تاریخ میں رہیں گے۔", "Purane rate har cheez ki rate ki tareekh mein rahenge."],
  "{n} items will sell below their cost price.": ["{n} چیزیں اپنی لاگت سے کم پر بکیں گی۔", "{n} cheezein apni laagat se kam par bikengi."],
  "Change prices": ["ریٹ بدلیں", "Rate badlein"],
  "Change {n} prices": ["{n} ریٹ بدلیں", "{n} rate badlein"],
  "{n} prices changed": ["{n} ریٹ بدل گئے", "{n} rate badal gaye"],
  "Type how much to change the prices; the new prices show here before anything is saved.": [
    "لکھیں کہ ریٹ کتنا بدلنا ہے؛ کچھ محفوظ ہونے سے پہلے نئے ریٹ یہاں دکھیں گے۔",
    "Likhein ke rate kitna badalna hai; kuch mehfooz hone se pehle naye rate yahan dikhenge.",
  ],
  "{n} prices will change": ["{n} ریٹ بدلیں گے", "{n} rate badlenge"],
  "only items that have a wholesale price": ["صرف وہ چیزیں جن کا ہول سیل ریٹ ہے", "sirf woh cheezein jin ka wholesale rate hai"],
  "{n} below cost": ["{n} لاگت سے کم", "{n} laagat se kam"],
  "below cost": ["لاگت سے کم", "laagat se kam"],
  "{n} skipped (price would be 0)": ["{n} چھوڑ دی گئیں (ریٹ 0 ہو جاتا)", "{n} chhor di gayin (rate 0 ho jata)"],

  // ----- Correct a saved bill -----
  Correct: ["درست کریں", "Durust karein"],
  "Correct a mistake in this bill": ["اس بل کی غلطی درست کریں", "Is bill ki ghalti durust karein"],
  "Correct bill {no}?": ["بل {no} درست کریں؟", "Bill {no} durust karein?"],
  "Correct this bill": ["یہ بل درست کریں", "Ye bill durust karein"],
  "Use this when a saved bill has a mistake (wrong item, quantity, price or customer).": [
    "جب محفوظ بل میں غلطی ہو (غلط چیز، مقدار، ریٹ یا گاہک) تو یہ استعمال کریں۔",
    "Jab mehfooz bill mein ghalti ho (ghalat cheez, miqdar, rate ya gahak) to ye istemal karein.",
  ],
  "Bill {no} is returned in full: stock goes back and its udhaar comes off the khata.": [
    "بل {no} پورا واپس ہوگا: اسٹاک واپس آئے گا اور اس کا اُدھار کھاتے سے ہٹ جائے گا۔",
    "Bill {no} poora wapas hoga: stock wapas aayega aur us ka udhaar khate se hat jayega.",
  ],
  "New Bill opens with the same items so you can fix them and save the corrected bill.": [
    "نیا بل انہی چیزوں کے ساتھ کھلے گا تاکہ آپ درست کر کے نیا بل محفوظ کریں۔",
    "Naya bill inhi cheezon ke saath khulega taake aap durust kar ke naya bill mehfooz karein.",
  ],
  "Both bills stay on record, linked to each other.": ["دونوں بل ریکارڈ میں رہیں گے، ایک دوسرے سے جڑے ہوئے۔", "Dono bill record mein rahenge, ek doosre se jude hue."],
  "Bill {no} returned. Fix the items and save the corrected bill.": ["بل {no} واپس ہو گیا۔ چیزیں درست کر کے نیا بل محفوظ کریں۔", "Bill {no} wapas ho gaya. Cheezein durust kar ke naya bill mehfooz karein."],
  "Corrected → {no}": ["درست کیا گیا ← {no}", "Durust kiya gaya → {no}"],
  "Correction of {no}": ["{no} کی درستی", "{no} ki durusti"],
  "Correcting bill {no}": ["بل {no} درست ہو رہا ہے", "Bill {no} durust ho raha hai"],
  "The old bill was returned in full ({no}). Fix the items below and save — the new bill is linked to the old one.": [
    "پرانا بل پورا واپس ہو گیا ({no})۔ نیچے چیزیں درست کر کے محفوظ کریں — نیا بل پرانے سے جڑا ہوگا۔",
    "Purana bill poora wapas ho gaya ({no}). Neeche cheezein durust kar ke mehfooz karein — naya bill purane se jura hoga.",
  ],
  "Add these again from the list (by IMEI): {items}": ["یہ دوبارہ فہرست سے شامل کریں (IMEI سے): {items}", "Ye dobara list se shamil karein (IMEI se): {items}"],
  "Bill corrected": ["بل درست کیا گیا", "Bill durust kiya gaya"],

  // ----- A page this role cannot use -----
  "You can't open this page": ["آپ یہ صفحہ نہیں کھول سکتے", "Aap ye page nahi khol sakte"],
  "This page is only for the shop owner. Ask the owner if you need something from it.": [
    "یہ صفحہ صرف دکان کے مالک کے لیے ہے۔ اگر اس میں سے کچھ چاہیے تو مالک سے کہیں۔",
    "Ye page sirf dukaan ke malik ke liye hai. Agar is mein se kuch chahiye to malik se kahein.",
  ],
  "This page is only for the owner or a manager. Ask them if you need something from it.": [
    "یہ صفحہ صرف مالک یا مینیجر کے لیے ہے۔ اگر اس میں سے کچھ چاہیے تو ان سے کہیں۔",
    "Ye page sirf malik ya manager ke liye hai. Agar is mein se kuch chahiye to un se kahein.",
  ],

  // ----- Bill as a picture / PDF on WhatsApp -----
  Picture: ["تصویر", "Tasveer"],
  "Text message": ["تحریری پیغام", "Text message"],
  "Save picture": ["تصویر محفوظ کریں", "Tasveer save karein"],
  "Save PDF": ["PDF محفوظ کریں", "PDF save karein"],
  "Share on WhatsApp": ["واٹس ایپ پر بھیجیں", "WhatsApp par bhejein"],
  "Copy picture & open WhatsApp": ["تصویر کاپی کریں اور واٹس ایپ کھولیں", "Tasveer copy karein aur WhatsApp kholein"],
  "Save PDF & open WhatsApp": ["PDF محفوظ کریں اور واٹس ایپ کھولیں", "PDF save karein aur WhatsApp kholein"],
  "Bill picture": ["بل کی تصویر", "Bill ki tasveer"],
  "Tap “Share on WhatsApp”, choose WhatsApp, then the customer{phone}.": [
    "“واٹس ایپ پر بھیجیں” دبائیں، واٹس ایپ چنیں، پھر گاہک{phone}۔",
    "“WhatsApp par bhejein” dabayein, WhatsApp chunein, phir gahak{phone}.",
  ],
  "The picture is copied and the customer's chat opens. Press Ctrl+V in the chat, then Send.": [
    "تصویر کاپی ہو جائے گی اور گاہک کی چیٹ کھل جائے گی۔ چیٹ میں Ctrl+V دبائیں، پھر بھیجیں۔",
    "Tasveer copy ho jayegi aur gahak ki chat khul jayegi. Chat mein Ctrl+V dabayein, phir Send karein.",
  ],
  "The PDF is saved and the customer's chat opens. Drag the PDF into the chat, then Send.": [
    "PDF محفوظ ہو جائے گی اور گاہک کی چیٹ کھل جائے گی۔ PDF کو چیٹ میں کھینچ کر ڈالیں، پھر بھیجیں۔",
    "PDF save ho jayegi aur gahak ki chat khul jayegi. PDF ko chat mein kheench kar daalein, phir Send karein.",
  ],
  "Bill picture copied. In the WhatsApp chat press Ctrl+V, then Send.": [
    "بل کی تصویر کاپی ہو گئی۔ واٹس ایپ چیٹ میں Ctrl+V دبائیں، پھر بھیجیں۔",
    "Bill ki tasveer copy ho gayi. WhatsApp chat mein Ctrl+V dabayein, phir Send karein.",
  ],
  "The bill was saved to your Downloads ({file}). Drag it into the WhatsApp chat, then Send.": [
    "بل آپ کے Downloads میں محفوظ ہو گیا ({file})۔ اسے واٹس ایپ چیٹ میں کھینچ کر ڈالیں، پھر بھیجیں۔",
    "Bill aap ke Downloads mein save ho gaya ({file}). Isay WhatsApp chat mein kheench kar daalein, phir Send karein.",
  ],
};
