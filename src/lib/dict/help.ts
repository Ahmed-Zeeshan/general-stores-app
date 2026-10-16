/**
 * Urdu / Roman Urdu for the Help page (topic titles, every step, links), the date range picker
 * and the WhatsApp Desktop / Web picker. English text → [Urdu, Roman Urdu].
 */
export const DICT_HELP: Record<string, [string, string]> = {
  // ----- Help page -----
  "Still stuck? Ask your shop owner, or the person who set up the app for you.": [
    "پھر بھی مشکل ہے؟ اپنی دکان کے مالک سے پوچھیں، یا اس شخص سے جس نے آپ کے لیے ایپ لگائی تھی۔",
    "Phir bhi mushkil hai? Apni dukaan ke malik se poochein, ya us shakhs se jis ne aap ke liye app lagayi thi.",
  ],

  // Making a bill
  "Making a bill": ["بل بنانا", "Bill banana"],
  "Open New Bill. Scan the barcode, or type the name and press Enter, or tap the item.": [
    "نیا بل کھولیں۔ بارکوڈ اسکین کریں، یا نام لکھ کر Enter دبائیں، یا چیز پر کلک کریں۔",
    "Naya bill kholein. Barcode scan karein, ya naam likh kar Enter dabayein, ya cheez par click karein.",
  ],
  "Loose items (kg / litre) ask how much — type kg, or the rupees the customer wants (e.g. Rs 100 of sugar).": [
    "کھلی چیزیں (کلو / لیٹر) پوچھتی ہیں کہ کتنی — کلو لکھیں، یا جتنے روپے کی گاہک کو چاہیے (مثلاً Rs 100 کی چینی)۔",
    "Khuli cheezein (kg / litre) poochti hain ke kitni — kg likhein, ya jitne rupay ki gahak ko chahiye (maslan Rs 100 ki cheeni).",
  ],
  "Press Take Payment (F9). Choose Cash, JazzCash, Easypaisa, Card, Bank or Udhaar; Split payment lets you mix them.": [
    "رقم وصول کریں (F9) دبائیں۔ نقد، JazzCash، Easypaisa، کارڈ، بینک یا ادھار چنیں؛ تقسیم ادائیگی سے یہ ملا کر بھی لے سکتے ہیں۔",
    "Raqam wusool karein (F9) dabayein. Naqd, JazzCash, Easypaisa, card, bank ya udhaar chunein; taqseem adaigi se ye mila kar bhi le sakte hain.",
  ],
  "For udhaar, choose the customer first (top of the bill). Press Confirm & Save Bill — the receipt prints.": [
    "ادھار کے لیے پہلے گاہک چنیں (بل کے اوپر)۔ پھر بل محفوظ کریں دبائیں — رسید پرنٹ ہو جائے گی۔",
    "Udhaar ke liye pehle gahak chunein (bill ke upar). Phir bill save karein dabayein — raseed print ho jaye gi.",
  ],
  "Busy counter? Hold (F4) puts the bill aside; Held bills (F6) brings it back.": [
    "کاؤنٹر پر رش ہے؟ روکیں (F4) بل کو ایک طرف رکھ دیتا ہے؛ رکے ہوئے بل (F6) سے وہ واپس آ جاتا ہے۔",
    "Counter par rush hai? Rokein (F4) bill ko aik taraf rakh deta hai; ruke hue bill (F6) se wo wapas aa jata hai.",
  ],
  "Send bill on WhatsApp sends the bill to the customer instead of (or with) paper. With the app's address set in Settings, the message has a link that opens the bill.": [
    "بل WhatsApp پر بھیجیں سے بل کاغذ کی جگہ (یا ساتھ) گاہک کو چلا جاتا ہے۔ اگر سیٹنگز میں ایپ کا ایڈریس لکھا ہو تو میسج میں بل کھولنے کا لنک بھی ہوتا ہے۔",
    "Bill WhatsApp par bhejein se bill kaghaz ki jagah (ya saath) gahak ko chala jata hai. Agar settings mein app ka address likha ho to message mein bill kholne ka link bhi hota hai.",
  ],
  "Touch screen? Big buttons makes the items larger; starred items (Favourites) come first, and items can have a photo.": [
    "ٹچ اسکرین ہے؟ بڑے بٹن سے اشیاء بڑی ہو جاتی ہیں؛ ستارے والی چیزیں (پسندیدہ) پہلے آتی ہیں، اور چیزوں کی تصویر بھی لگ سکتی ہے۔",
    "Touch screen hai? Baray button se cheezein bari ho jati hain; sitare wali cheezein (pasandeeda) pehle aati hain, aur cheezon ki tasveer bhi lag sakti hai.",
  ],
  "Open New Bill": ["نیا بل کھولیں", "Naya bill kholein"],

  // Udhaar
  "Udhaar (khata) and payments": ["ادھار (کھاتہ) اور وصولی", "Udhaar (khata) aur wusooli"],
  "Customers Khata lists everyone with their balance. Add old balances from your register when you add a customer.": [
    "کھاتہ میں ہر گاہک اپنے بقایا کے ساتھ نظر آتا ہے۔ نیا گاہک شامل کرتے وقت رجسٹر سے پرانا بقایا بھی درج کریں۔",
    "Gahakon ke khate mein har gahak apne baqaya ke saath nazar aata hai. Naya gahak shamil karte waqt register se purana baqaya bhi darj karein.",
  ],
  "Receive Udhaar (F8 on the bill screen, or on the customer's page) takes full or part payment and prints a receipt.": [
    "ادھار وصولی (بل والی اسکرین پر F8، یا گاہک کے صفحے پر) سے پوری یا کچھ رقم وصول ہوتی ہے اور رسید پرنٹ ہوتی ہے۔",
    "Udhaar wusooli (bill wali screen par F8, ya gahak ke page par) se poori ya kuch raqam wusool hoti hai aur raseed print hoti hai.",
  ],
  "WhatsApp reminder opens WhatsApp with the message typed — you press Send. Udhaar Report shows who owes the longest.": [
    "WhatsApp یاد دہانی سے WhatsApp لکھے ہوئے میسج کے ساتھ کھلتا ہے — آپ بس Send دبائیں۔ ادھار رپورٹ بتاتی ہے کہ سب سے پرانا ادھار کس کا ہے۔",
    "WhatsApp yaad-dehani se WhatsApp likhe hue message ke saath khulta hai — aap bas Send dabayein. Udhaar report batati hai ke sab se purana udhaar kis ka hai.",
  ],
  "A payment entered by mistake can be cancelled by the owner or manager; it stays in the khata marked cancelled.": [
    "غلطی سے درج ہوئی وصولی مالک یا مینیجر منسوخ کر سکتے ہیں؛ وہ کھاتے میں \"منسوخ\" لکھی ہوئی رہتی ہے۔",
    "Ghalti se darj hui wusooli malik ya manager cancel kar sakte hain; wo khate mein \"cancelled\" likhi hui rehti hai.",
  ],
  "Open Customers": ["گاہک کھولیں", "Gahak kholein"],

  // Items & stock
  "Items, prices and stock": ["اشیاء، قیمتیں اور اسٹاک", "Cheezein, qeematein aur stock"],
  "Products → Add product, or Ready-made items to pick from a list for your type of shop and type your prices.": [
    "اشیاء ← چیز شامل کریں، یا تیار فہرست سے اپنی دکان کی قسم کی چیزیں چنیں اور اپنی قیمتیں لکھیں۔",
    "Cheezein → cheez shamil karein, ya tayyar list se apni dukaan ki qisam ki cheezein chunein aur apni qeematein likhein.",
  ],
  "Update stock for counts, wastage and corrections. Every change is kept in the item's stock history.": [
    "گنتی، ضائع مال اور درستی کے لیے اسٹاک تبدیل کریں۔ ہر تبدیلی چیز کی اسٹاک ہسٹری میں محفوظ رہتی ہے۔",
    "Ginti, zaya maal aur durusti ke liye stock update karein. Har tabdeeli cheez ki stock history mein mehfooz rehti hai.",
  ],
  "No barcode on an item? Create barcodes gives it one; Print labels prints stickers.": [
    "چیز پر بارکوڈ نہیں؟ بارکوڈ بنائیں سے نیا بن جاتا ہے؛ لیبل پرنٹ کریں سے اسٹیکر پرنٹ ہوتے ہیں۔",
    "Cheez par barcode nahi? Barcode banayein se naya ban jata hai; label print karein se sticker print hote hain.",
  ],
  "Cartons and dozens: add pack sizes with their own price and barcode. Expiry by batch for dairy, bakery and medicines.": [
    "کارٹن اور درجن: پیک سائز ان کی اپنی قیمت اور بارکوڈ کے ساتھ شامل کریں۔ دودھ، بیکری اور دوائیوں کے لیے ہر بیچ کی الگ میعاد۔",
    "Carton aur darjan: pack size un ki apni qeemat aur barcode ke saath shamil karein. Doodh, bakery aur dawaiyon ke liye har batch ki alag expiry.",
  ],

  // Purchases
  "Buying stock from suppliers": ["سپلائر سے مال خریدنا", "Supplier se maal khareedna"],
  "Purchases → New purchase. Choose the supplier, scan or add the items with quantity and cost.": [
    "خریداری ← نئی خریداری۔ سپلائر چنیں، اشیاء اسکین یا شامل کریں اور تعداد اور لاگت لکھیں۔",
    "Khareedari → nayi khareedari. Supplier chunein, cheezein scan ya shamil karein aur tadaad aur laagat likhein.",
  ],
  "Stock and cost prices update by themselves. What you don't pay now goes to the supplier's khata.": [
    "اسٹاک اور خرید قیمت خود اپڈیٹ ہو جاتے ہیں۔ جو رقم ابھی ادا نہ کریں وہ سپلائر کے کھاتے میں چلی جاتی ہے۔",
    "Stock aur khareed qeemat khud update ho jate hain. Jo raqam abhi ada na karein wo supplier ke khate mein chali jati hai.",
  ],
  "Damaged or wrong goods: open the purchase and Return to supplier.": [
    "خراب یا غلط مال: خریداری کھولیں اور سپلائر کو واپس کریں دبائیں۔",
    "Kharab ya ghalat maal: khareedari kholein aur supplier ko wapas karein dabayein.",
  ],
  "Reorder List shows what will run out soon (from the last 30 days of sales) and how much to order from each supplier — send it on WhatsApp.": [
    "آرڈر لسٹ بتاتی ہے کہ کیا جلد ختم ہونے والا ہے (پچھلے 30 دن کی فروخت سے) اور ہر سپلائر سے کتنا منگوانا ہے — اسے WhatsApp پر بھیج دیں۔",
    "Order list batati hai ke kya jald khatam hone wala hai (pichle 30 din ki sale se) aur har supplier se kitna mangwana hai — ise WhatsApp par bhej dein.",
  ],
  "Open Reorder List": ["آرڈر لسٹ کھولیں", "Order list kholein"],

  // Returns
  "Customer returns": ["گاہک کی واپسی", "Gahak ki wapsi"],
  "Sales History → find the bill (search by number or customer) → Return.": [
    "فروخت ← بل تلاش کریں (نمبر یا گاہک سے) ← واپسی۔",
    "Sale ki history → bill talash karein (number ya gahak se) → wapsi.",
  ],
  "Choose what came back and how many. Money goes back in cash or to the customer's khata; stock comes back.": [
    "چنیں کہ کیا واپس آیا اور کتنا۔ رقم نقد واپس ہوتی ہے یا گاہک کے کھاتے میں جاتی ہے؛ اسٹاک واپس آ جاتا ہے۔",
    "Chunein ke kya wapas aaya aur kitna. Raqam naqd wapas hoti hai ya gahak ke khate mein jati hai; stock wapas aa jata hai.",
  ],
  "Open Sales History": ["فروخت کھولیں", "Sale ki history kholein"],

  // Cash drawer
  "Cash drawer and day close": ["کیش دراز اور دن بند کرنا", "Cash daraz aur din band karna"],
  "Morning: Cash Drawer → Open drawer with the cash already in it.": [
    "صبح: کیش دراز ← دراز میں پہلے سے موجود رقم کے ساتھ دراز کھولیں۔",
    "Subah: Cash daraz → daraz mein pehle se maujood raqam ke saath daraz kholein.",
  ],
  "Money put in or taken out during the day (bank deposit, change): Cash in / Cash out.": [
    "دن میں ڈالی یا نکالی گئی رقم (بینک میں جمع، کھلے پیسے): کیش اِن / کیش آؤٹ۔",
    "Din mein daali ya nikaali gayi raqam (bank mein jama, khulay paise): cash in / cash out.",
  ],
  "Evening: Close day — count the notes. The Z report shows Exact, Short or Over and prints.": [
    "شام: دن بند کریں — نوٹ گنیں۔ Z رپورٹ بتاتی ہے کہ رقم بالکل ٹھیک ہے، کم ہے یا زیادہ، اور پرنٹ ہو جاتی ہے۔",
    "Shaam: din band karein — note ginein. Z report batati hai ke raqam bilkul theek hai, kam hai ya zyada, aur print ho jati hai.",
  ],
  "Send to the owner on WhatsApp sends the day close; on the dashboard, Send today's summary sends the whole day (sales, profit, udhaar, drawer).": [
    "مالک کو WhatsApp کریں سے دن کا حساب چلا جاتا ہے؛ ڈیش بورڈ پر آج کا خلاصہ بھیجیں سے پورے دن کا حساب (فروخت، منافع، ادھار، دراز) جاتا ہے۔",
    "Malik ko WhatsApp karein se din ka hisaab chala jata hai; dashboard par aaj ka khulasa bhejein se poore din ka hisaab (sale, munafa, udhaar, daraz) jata hai.",
  ],
  "Open Cash Drawer": ["کیش دراز کھولیں", "Cash daraz kholein"],

  // Scanner
  "Barcode scanner and camera": ["بارکوڈ اسکینر اور کیمرہ", "Barcode scanner aur camera"],
  "USB or Bluetooth scanners work as soon as they are plugged in — no setup.": [
    "USB یا Bluetooth اسکینر لگاتے ہی کام کرنے لگتے ہیں — کوئی سیٹنگ نہیں۔",
    "USB ya Bluetooth scanner lagate hi kaam karne lagte hain — koi setting nahi.",
  ],
  "On a phone or laptop you can scan with the camera (camera button next to the search box).": [
    "فون یا لیپ ٹاپ پر کیمرے سے اسکین کر سکتے ہیں (تلاش والے خانے کے ساتھ کیمرہ بٹن)۔",
    "Phone ya laptop par camera se scan kar sakte hain (talash wale khane ke saath camera button).",
  ],

  // Printer
  "Receipt printer": ["رسید پرنٹر", "Raseed printer"],
  "Print a test receipt to check the paper size (80 mm or 58 mm).": [
    "کاغذ کا سائز (80 mm یا 58 mm) چیک کرنے کے لیے ٹیسٹ رسید پرنٹ کریں۔",
    "Kaghaz ka size (80 mm ya 58 mm) check karne ke liye test raseed print karein.",
  ],
  "Turn on Print automatically on the Bill saved screen to print every bill without clicking Print.": [
    "\"بل محفوظ ہو گیا\" والی اسکرین پر خود پرنٹ آن کر دیں، پھر ہر بل پرنٹ دبائے بغیر پرنٹ ہو گا۔",
    "\"Bill save ho gaya\" wali screen par khud print on kar dein, phir har bill print dabaye baghair print ho ga.",
  ],

  // Search
  "Finding anything quickly": ["کچھ بھی جلدی ڈھونڈیں", "Kuch bhi jaldi dhoondein"],
  "Press Ctrl+K (or the Search box in the menu) on any screen.": [
    "کسی بھی اسکرین پر Ctrl+K دبائیں (یا مینو میں تلاش کا خانہ)۔",
    "Kisi bhi screen par Ctrl+K dabayein (ya menu mein talash ka khana).",
  ],
  "Type a name, mobile number, CNIC, IMEI, bill number or job number — dashes don't matter.": [
    "نام، موبائل نمبر، CNIC، IMEI، بل نمبر یا جاب نمبر لکھیں — ڈیش ہوں یا نہ ہوں، فرق نہیں پڑتا۔",
    "Naam, mobile number, CNIC, IMEI, bill number ya job number likhein — dash hon ya na hon, farq nahi parta.",
  ],
  "The bell in the menu lists today's tasks: late installments, phones ready, low balances, udhaar to remind.": [
    "مینو کی گھنٹی میں آج کے کام ہوتے ہیں: لیٹ قسطیں، تیار فون، کم بیلنس، اور جن کو ادھار یاد کروانا ہے۔",
    "Menu ki ghanti mein aaj ke kaam hote hain: late qistein, tayyar phone, kam balance, aur jin ko udhaar yaad karwana hai.",
  ],

  // Staff
  "Staff and branches": ["عملہ اور برانچیں", "Staff aur branches"],
  "Settings → Staff: add a login for each person. Cashiers bill and receive udhaar; managers also handle stock and reports.": [
    "سیٹنگز ← عملہ: ہر شخص کا لاگ اِن بنائیں۔ کیشیئر بل بناتے اور ادھار وصول کرتے ہیں؛ مینیجر اسٹاک اور رپورٹس بھی دیکھتے ہیں۔",
    "Settings → staff: har shakhs ka login banayein. Cashier bill banate aur udhaar wusool karte hain; manager stock aur reports bhi dekhte hain.",
  ],
  "Activity Log shows who changed prices, gave discounts, took returns or cancelled payments.": [
    "سرگرمی میں نظر آتا ہے کہ کس نے قیمت بدلی، رعایت دی، واپسی لی یا وصولی منسوخ کی۔",
    "Activity log mein nazar aata hai ke kis ne qeemat badli, riayat di, wapsi li ya wusooli cancel ki.",
  ],
  "More than one shop? Add branches; each branch has its own stock and you can move stock between them.": [
    "ایک سے زیادہ دکانیں ہیں؟ برانچیں شامل کریں؛ ہر برانچ کا اپنا اسٹاک ہوتا ہے اور آپ ان کے درمیان اسٹاک منتقل کر سکتے ہیں۔",
    "Aik se zyada dukaanein hain? Branches shamil karein; har branch ka apna stock hota hai aur aap un ke darmiyan stock muntaqil kar sakte hain.",
  ],
  "Give each person a 4–6 digit PIN: on a shared counter, Switch user (under your name in the menu) lets the next person take over with their PIN.": [
    "ہر شخص کو 4–6 ہندسوں کا PIN دیں: ایک ہی کاؤنٹر پر، صارف بدلیں (مینو میں آپ کے نام کے نیچے) سے اگلا شخص اپنے PIN سے کام سنبھال لیتا ہے۔",
    "Har shakhs ko 4–6 hindson ka PIN dein: aik hi counter par, user badlein (menu mein aap ke naam ke neeche) se agla shakhs apne PIN se kaam sambhal leta hai.",
  ],
  "Limits per person: the largest discount they may give, and whether they may give udhaar.": [
    "ہر شخص کی حد: وہ زیادہ سے زیادہ کتنی رعایت دے سکتا ہے، اور ادھار دے سکتا ہے یا نہیں۔",
    "Har shakhs ki hadd: wo zyada se zyada kitni riayat de sakta hai, aur udhaar de sakta hai ya nahi.",
  ],
  "Safety: after 5 wrong PINs in a row the PIN stops working (set a new one here); after 10 wrong passwords the account waits 15 minutes. Changing or resetting a password logs that person out everywhere. Someone leaving? Disable their account.": [
    "حفاظت: لگاتار 5 غلط PIN کے بعد PIN بند ہو جاتا ہے (یہاں نیا لگائیں)؛ 10 غلط پاس ورڈ کے بعد اکاؤنٹ 15 منٹ رکا رہتا ہے۔ پاس ورڈ بدلنے یا ری سیٹ کرنے سے وہ شخص ہر جگہ سے لاگ آؤٹ ہو جاتا ہے۔ کوئی کام چھوڑ رہا ہے؟ اس کا اکاؤنٹ بند کر دیں۔",
    "Hifazat: lagataar 5 ghalat PIN ke baad PIN band ho jata hai (yahan naya lagayein); 10 ghalat password ke baad account 15 minute ruka rehta hai. Password badalne ya reset karne se wo shakhs har jagah se logout ho jata hai. Koi kaam chhor raha hai? Us ka account band kar dein.",
  ],

  // Backups
  Backups: ["بیک اپ", "Backup"],
  "Settings → Download backup saves everything in one file. Keep a copy on a USB or in Google Drive.": [
    "سیٹنگز ← بیک اپ ڈاؤن لوڈ کریں سے سب کچھ ایک فائل میں محفوظ ہو جاتا ہے۔ ایک کاپی USB یا Google Drive میں رکھیں۔",
    "Settings → backup download karein se sab kuch aik file mein mehfooz ho jata hai. Aik copy USB ya Google Drive mein rakhein.",
  ],
  "Restore from backup brings a shop back exactly as it was in the file.": [
    "بیک اپ سے بحال کریں سے دکان بالکل ویسی ہو جاتی ہے جیسی فائل میں تھی۔",
    "Backup se bahaal karein se dukaan bilkul waisi ho jati hai jaisi file mein thi.",
  ],
  "The app also saves a copy every night. Settings shows when and where; put that folder inside Google Drive for desktop to keep every copy online too.": [
    "ایپ ہر رات خود بھی ایک کاپی محفوظ کرتی ہے۔ سیٹنگز میں نظر آتا ہے کب اور کہاں؛ وہ فولڈر Google Drive for desktop کے اندر رکھیں تاکہ ہر کاپی آن لائن بھی محفوظ رہے۔",
    "App har raat khud bhi aik copy mehfooz karti hai. Settings mein nazar aata hai kab aur kahan; wo folder Google Drive for desktop ke andar rakhein taake har copy online bhi mehfooz rahe.",
  ],

  // Phones
  "Phones by IMEI and used phones": ["IMEI والے فون اور پرانے فون", "IMEI wale phone aur purane phone"],
  "Phones → Add phones: choose the model and scan each IMEI. On the bill, tap the model and pick the IMEI, or scan it.": [
    "فون ← فون شامل کریں: ماڈل چنیں اور ہر IMEI اسکین کریں۔ بل پر ماڈل پر کلک کر کے IMEI چنیں، یا اسے اسکین کریں۔",
    "Phones → phone shamil karein: model chunein aur har IMEI scan karein. Bill par model par click kar ke IMEI chunein, ya use scan karein.",
  ],
  "Check IMEI shows a phone's full history and warranty.": [
    "IMEI چیک کریں سے فون کی پوری ہسٹری اور وارنٹی نظر آتی ہے۔",
    "IMEI check karein se phone ki poori history aur warranty nazar aati hai.",
  ],
  "Used Phones Bought: record the seller's CNIC, photos and checks; print the agreement for signature.": [
    "پرانے فون: بیچنے والے کا CNIC، تصویریں اور چیک درج کریں؛ دستخط کے لیے معاہدہ پرنٹ کریں۔",
    "Purane phone khareede: bechne wale ka CNIC, tasveerein aur checks darj karein; dastakhat ke liye muahida print karein.",
  ],

  // Repairs
  "Repairs → New repair job: customer, phone, problem, estimate and advance. A slip prints for the customer.": [
    "مرمت ← نیا مرمت جاب: گاہک، فون، خرابی، اندازاً خرچ اور ایڈوانس۔ گاہک کے لیے پرچی پرنٹ ہوتی ہے۔",
    "Repairs → naya repair job: gahak, phone, kharabi, andaazan kharcha aur advance. Gahak ke liye parchi print hoti hai.",
  ],
  "Move the job through the steps; add parts from stock and the labour charge.": [
    "جاب کو ایک ایک مرحلے سے آگے بڑھائیں؛ اسٹاک سے پرزے اور مزدوری شامل کریں۔",
    "Job ko aik aik marhale se aage barhayein; stock se purze aur mazdoori shamil karein.",
  ],
  "Ready? Send the 'ready' WhatsApp. Deliver collects the balance and prints the bill with warranty.": [
    "تیار ہے؟ 'تیار' والا WhatsApp بھیجیں۔ حوالے کریں سے باقی رقم وصول ہوتی ہے اور وارنٹی کے ساتھ بل پرنٹ ہوتا ہے۔",
    "Tayyar hai? 'Tayyar' wala WhatsApp bhejein. Deliver karein se baqi raqam wusool hoti hai aur warranty ke saath bill print hota hai.",
  ],
  "Open Repairs": ["مرمت کھولیں", "Repairs kholein"],

  // Easyload & wallets
  "Easyload, packages and JazzCash / Easypaisa": ["ایزی لوڈ، پیکج اور JazzCash / Easypaisa", "Easyload, package aur JazzCash / Easypaisa"],
  "Add each Easyload SIM and wallet account with its balance and commission.": [
    "ہر ایزی لوڈ سم اور والیٹ اکاؤنٹ اس کے بیلنس اور کمیشن کے ساتھ شامل کریں۔",
    "Har Easyload SIM aur wallet account us ke balance aur commission ke saath shamil karein.",
  ],
  "Easyload, Package, Cash in / send, Cash out and Bill payment each take a few taps; the balance and drawer cash update.": [
    "ایزی لوڈ، پیکج، کیش اِن / رقم بھیجیں، کیش آؤٹ اور بل ادائیگی چند کلک میں ہو جاتے ہیں؛ بیلنس اور دراز کی رقم خود اپڈیٹ ہو جاتی ہے۔",
    "Easyload, package, cash in / raqam bhejein, cash out aur bill adaigi chand click mein ho jate hain; balance aur daraz ki raqam khud update ho jati hai.",
  ],
  "Balance check compares with the SIM / app and records any difference.": [
    "بیلنس چیک سم / ایپ کے بیلنس سے ملاتا ہے اور کوئی فرق ہو تو درج کر لیتا ہے۔",
    "Balance check SIM / app ke balance se milata hai aur koi farq ho to darj kar leta hai.",
  ],
  "Open Easyload & Wallets": ["ایزی لوڈ کھولیں", "Easyload aur wallets kholein"],

  // Installments
  "On the bill: Take Payment → Sell on installments. Enter the advance, markup, months and the customer's CNIC.": [
    "بل پر: رقم وصول کریں ← قسطوں پر بیچیں۔ ایڈوانس، منافع (مارک اپ)، مہینے اور گاہک کا CNIC لکھیں۔",
    "Bill par: raqam wusool karein → qiston par bechein. Advance, markup, mahine aur gahak ka CNIC likhein.",
  ],
  "Print the agreement for signatures. Installments → the plan → Receive installment each month.": [
    "دستخط کے لیے اقرار نامہ پرنٹ کریں۔ قسطیں ← پلان ← ہر مہینے قسط وصول کریں۔",
    "Dastakhat ke liye iqrar nama print karein. Qistein → plan → har mahine qist wusool karein.",
  ],
  "Late customers show in the bell with a one-tap WhatsApp reminder.": [
    "لیٹ گاہک گھنٹی میں نظر آتے ہیں، ایک کلک والی WhatsApp یاد دہانی کے ساتھ۔",
    "Late gahak ghanti mein nazar aate hain, aik click wali WhatsApp yaad-dehani ke saath.",
  ],
  "Open Installments": ["قسطیں کھولیں", "Qistein kholein"],

  // Language
  "Urdu and Roman Urdu": ["اردو اور رومن اردو", "Urdu aur Roman Urdu"],
  "Choose English, اردو or Roman Urdu at the bottom of the menu (or on the login page). Each computer remembers its choice.": [
    "مینو کے نیچے (یا لاگ اِن صفحے پر) English، اردو یا Roman Urdu چنیں۔ ہر کمپیوٹر اپنی پسند یاد رکھتا ہے۔",
    "Menu ke neeche (ya login page par) English, اردو ya Roman Urdu chunein. Har computer apni pasand yaad rakhta hai.",
  ],

  // Keyboard
  "Keyboard shortcuts": ["کی بورڈ شارٹ کٹس", "Keyboard shortcuts"],
  "New Bill: F2 search · F9 take payment · F4 hold · F6 held bills · F8 receive udhaar.": [
    "نیا بل: F2 تلاش · F9 رقم وصول · F4 روکیں · F6 رکے ہوئے بل · F8 ادھار وصولی۔",
    "Naya bill: F2 talash · F9 raqam wusool · F4 rokein · F6 ruke hue bill · F8 udhaar wusooli.",
  ],
  "Anywhere: Ctrl+K search.": ["کہیں بھی: Ctrl+K تلاش۔", "Kahin bhi: Ctrl+K talash."],

  // ----- Date range -----
  to: ["سے", "se"],

  // ----- WhatsApp Desktop / Web picker -----
  "Which WhatsApp opens on this computer": ["اس کمپیوٹر پر کون سا WhatsApp کھلے", "Is computer par kaun sa WhatsApp khule"],
  "Open messages in": ["میسج کہاں کھلیں", "Message kahan khulein"],
  "WhatsApp Desktop": ["WhatsApp ڈیسک ٹاپ ایپ", "WhatsApp Desktop app"],
  "WhatsApp Web": ["WhatsApp ویب", "WhatsApp Web"],
  "Ask each time": ["ہر بار پوچھیں", "Har baar poochein"],
};
