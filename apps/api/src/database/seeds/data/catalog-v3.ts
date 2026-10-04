/**
 * Catalog v3 (owner's Sept-2026 brief, part 2): birthday goods, Diwali & fireworks, a cattle doctor,
 * a seed-and-fertiliser shop, a real medicine list, pathology / X-ray / ultrasound bookings, video
 * doctor consultations, more hired vehicles, and a fuller sweets + fast-food menu.
 *
 * ⚠️ EVERY shop, doctor and driver name below is a PLACEHOLDER. The owner renames them in
 * /admin/suppliers and /admin/products before launch — nothing here is a real business.
 *
 * The rule that shapes this file: for anything that needs a licence (medicine, fertiliser and
 * pesticide, fireworks, pathology) the shop does NOT provide the service itself — it is only the
 * delivery partner / mediator. So every such item carries a licensed supplier whose
 * `mediator_note` says so on the card and the product page, and the caution also sits in the
 * product description, where a customer who never reads the small print still meets it.
 *
 * Idempotent by slug (products/categories) and by name (suppliers) — `seedCatalogV3` only INSERTs
 * what is missing and never overwrites a price, name or stock the owner has edited.
 * Prices are typical rural-UP retail estimates (Sept 2026). Icons are Tabler icon keys drawn by the
 * website — see apps/web/src/components/icon-data.ts.
 */
import type { RootSeed } from './catalog-v2';

/** Appended AFTER the 15 v2 roots, in the owner's order. */
export const V3_ROOTS: RootSeed[] = [
  { slug: 'birthday', name: 'Birthday', nameHi: 'जन्मदिन', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'gift', intro: 'केक, मोमबत्ती, गुब्बारे, बैनर और रिटर्न गिफ़्ट — जन्मदिन की पूरी तैयारी एक ही ऑर्डर में। केक एक दिन पहले बुक करें।' },
  { slug: 'patakha', name: 'Fireworks & Diwali', nameHi: 'पटाखे व दीपावली', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'flare', intro: 'दीये, झालर, रंगोली, पूजा सामग्री और लाइसेंसी दुकान के पटाखे। पटाखे 18 साल से कम उम्र वालों को नहीं दिए जाते।' },
  { slug: 'pashu-doctor', name: 'Cattle Doctor', nameHi: 'पशु डॉक्टर (गाय-भैंस)', vertical: 'SERVICE', itemType: 'SERVICE', icon: 'paw', intro: 'गाय-भैंस की जाँच, टीकाकरण, गर्भ जाँच और इलाज — पशु चिकित्सक घर पर। आपात स्थिति में सरकारी पशु अस्पताल भी ज़रूर बताएं।' },
  { slug: 'beej-bhandar', name: 'Seeds & Fertiliser', nameHi: 'खाद-बीज भंडार', vertical: 'AGRI_INPUT', itemType: 'PRODUCT', icon: 'seedling', intro: 'यूरिया, डीएपी, पोटाश, गोबर खाद, गेहूँ-धान-सब्ज़ी के बीज और खेत की दवा — लाइसेंसी बीज भंडार से, बिल के साथ।' },
  { slug: 'doctor-consult', name: 'Video Doctor Consultation', nameHi: 'वीडियो पर डॉक्टर', vertical: 'SERVICE', itemType: 'SERVICE', icon: 'video', intro: 'घर बैठे वीडियो कॉल पर डॉक्टर से बात करें — पर्ची व्हाट्सएप पर मिलती है। आपात स्थिति में 108 पर कॉल करें।' },
];

export interface SupplierSeedV3 {
  key: string;
  name: string;
  nameHi: string;
  type: 'SHOP' | 'MANDI' | 'FARMER' | 'DISTRIBUTOR' | 'OTHER';
  /** Shown under the price, Hindi. Why: the customer must see WHO sells, not just who delivers. */
  note: string;
  noteEn: string;
}

const partner = (shopHi: string): string => `${shopHi} से — हम सिर्फ़ पहुँचाने का काम करते हैं`;
const partnerEn = (shop: string): string => `By ${shop} — we are only the delivery partner`;
const centre = (centreHi: string): string => `जाँच और रिपोर्ट ${centreHi} की — हम सिर्फ़ बुकिंग और सैंपल लाने का काम करते हैं`;
const centreEn = (name: string): string => `Test and report by ${name} — we only book it and collect the sample`;

export const V3_SUPPLIERS: SupplierSeedV3[] = [
  { key: 'gift-house', name: 'Raj Gift House', nameHi: 'राज गिफ्ट हाउस', type: 'SHOP', note: partner('राज गिफ्ट हाउस'), noteEn: partnerEn('Raj Gift House') },
  { key: 'patakha1', name: 'Gupta Patakha Bhandar', nameHi: 'गुप्ता पटाखा भंडार', type: 'SHOP', note: `${partner('गुप्ता पटाखा भंडार')} (लाइसेंसी दुकान)`, noteEn: `${partnerEn('Gupta Patakha Bhandar')} (licensed shop)` },
  { key: 'patakha2', name: 'Shanti Fireworks', nameHi: 'शांति फ़ायरवर्क्स', type: 'SHOP', note: `${partner('शांति फ़ायरवर्क्स')} (लाइसेंसी दुकान)`, noteEn: `${partnerEn('Shanti Fireworks')} (licensed shop)` },
  { key: 'patakha3', name: 'Maa Durga Diwali Store', nameHi: 'माँ दुर्गा दीपावली स्टोर', type: 'SHOP', note: partner('माँ दुर्गा दीपावली स्टोर'), noteEn: partnerEn('Maa Durga Diwali Store') },
  { key: 'medical', name: 'Sharma Medical Store', nameHi: 'शर्मा मेडिकल स्टोर', type: 'SHOP', note: `${partner('शर्मा मेडिकल स्टोर')} (ड्रग लाइसेंस पर)`, noteEn: `${partnerEn('Sharma Medical Store')} (sold on their drug licence)` },
  { key: 'beej', name: 'Anil Beej Bhandar', nameHi: 'अनिल बीज भंडार', type: 'SHOP', note: `${partner('अनिल बीज भंडार')} (लाइसेंस व बिल उनका)`, noteEn: `${partnerEn('Anil Beej Bhandar')} (their licence, their bill)` },
  { key: 'inder-path', name: 'Inder Pathology', nameHi: 'इंदर पैथोलॉजी', type: 'OTHER', note: centre('इंदर पैथोलॉजी'), noteEn: centreEn('Inder Pathology') },
  { key: 'mulayam-xray', name: 'Mulayam X-Ray (near Gaura Hospital)', nameHi: 'मुलायम एक्स-रे (गौरा हॉस्पिटल के पास)', type: 'OTHER', note: 'एक्स-रे मुलायम एक्स-रे सेंटर पर होता है — हम सिर्फ़ समय बुक करते हैं', noteEn: 'X-ray is done at Mulayam X-Ray centre — we only book the appointment' },
  { key: 'harshit-path', name: 'Harshit Pathology', nameHi: 'हर्षित पैथोलॉजी', type: 'OTHER', note: 'अल्ट्रासाउंड हर्षित पैथोलॉजी पर होता है — हम सिर्फ़ समय बुक करते हैं', noteEn: 'Ultrasound is done at Harshit Pathology — we only book the appointment' },
  { key: 'fastfood2', name: 'Guddu Fast Food Corner', nameHi: 'गुड्डू फ़ास्ट फ़ूड कॉर्नर', type: 'SHOP', note: partner('गुड्डू फ़ास्ट फ़ूड कॉर्नर'), noteEn: partnerEn('Guddu Fast Food Corner') },
];

/**
 * The v1/v2 suppliers had no note and some had placeholder names. `rename` is applied ONLY while the
 * row still carries the exact seeded name, so an owner rename always wins. `show` turns the name on
 * the product page on — pointless to write a mediator note nobody can see.
 */
export interface SupplierPatchV3 {
  match: string;
  rename?: string;
  renameHi?: string;
  show?: boolean;
  note: string;
  noteEn: string;
}
export const V3_SUPPLIER_PATCHES: SupplierPatchV3[] = [
  { match: 'Local Halwai', rename: 'Pandey Sweets & Namkeen', renameHi: 'पांडेय स्वीट्स एंड नमकीन', show: true, note: partner('पांडेय स्वीट्स एंड नमकीन'), noteEn: partnerEn('Pandey Sweets & Namkeen') },
  { match: 'Sharma Kirana', note: partner('शर्मा किराना'), noteEn: partnerEn('Sharma Kirana') },
  { match: 'Fatanpur Mandi', note: 'फतनपुर मंडी से — रोज़ सुबह की ताज़ी आवक', noteEn: 'From Fatanpur Mandi — fresh arrival every morning' },
  { match: 'Verma Store', note: partner('वर्मा स्टोर'), noteEn: partnerEn('Verma Store') },
  { match: 'Local Farmer', note: 'गाँव के किसान से सीधे — बिचौलिया कोई नहीं', noteEn: 'Straight from a village farmer — no middleman' },
  { match: 'Electric Shop', note: partner('बिजली की दुकान'), noteEn: partnerEn('the electric shop') },
  { match: 'Cloth Store', note: partner('कपड़े की दुकान'), noteEn: partnerEn('the cloth store') },
  { match: 'Hardware Store', note: partner('हार्डवेयर स्टोर'), noteEn: partnerEn('the hardware store') },
];

/**
 * Old name → new name for the suppliers v3 renames. The v2 seeder looks suppliers up BY NAME, so
 * without this a renamed row would look missing on the next run and be inserted a second time.
 */
export const V3_RENAMES: Record<string, string> = Object.fromEntries(
  V3_SUPPLIER_PATCHES.filter((p) => p.rename).map((p) => [p.match, p.rename as string]),
);

// ── Compliance lines that go INSIDE the description, so the caution survives even if the
//    supplier name is hidden or the page is copied elsewhere. ──────────────────────────────
const RX_NOTE = 'शर्मा मेडिकल स्टोर अपने ड्रग लाइसेंस पर देता है — फतनपुर बाज़ार सिर्फ़ पहुँचाने का काम करता है। डॉक्टर की सलाह के बिना कोई दवा न लें और सामान मिलते ही एक्सपायरी तारीख़ ज़रूर देखें।';
const FIREWORK_NOTE = 'पटाखे लाइसेंसी दुकान अपने बिल के साथ ही बेचती है — फतनपुर बाज़ार सिर्फ़ पहुँचाने का काम करता है। 18 साल से कम उम्र वालों को नहीं दिया जाएगा। खुली जगह में, बड़ों के सामने ही चलाएं और पानी की बाल्टी पास रखें।';
const AGRI_CHEM_NOTE = 'अनिल बीज भंडार अपने लाइसेंस और बिल पर बेचता है — फतनपुर बाज़ार सिर्फ़ पहुँचाने का काम करता है। खाद डालने से पहले मिट्टी की जाँच करवा लें, और दवा छिड़कते समय मुँह-हाथ ढककर रखें।';
const SEED_NOTE = 'अनिल बीज भंडार से, बिल के साथ — फतनपुर बाज़ार सिर्फ़ पहुँचाने का काम करता है। बोने से पहले बीज का अंकुरण ज़रूर देख लें।';
const CAKE_NOTE = 'केक कम से कम 24 घंटे पहले ऑर्डर करें — ताज़ा बनाकर भेजा जाता है। नाम लिखवाना हो तो ऑर्डर के नोट में लिख दें।';

export interface ItemSeedV3 {
  root: string;
  sup?: string;
  name: string;
  hi: string;
  icon: string;
  unit: string;
  uv: number;
  mrp: string;
  price: string;
  stock: number;
  kw: string;
  max: number;
  rx: boolean;
  regulated: boolean;
  /** Appended to the auto description — the compliance / handling line for this item. */
  note?: string;
}
interface Extra {
  stock?: number;
  max?: number;
  rx?: boolean;
  regulated?: boolean;
  note?: string;
}
const P = (root: string, sup: string | undefined, name: string, hi: string, icon: string, unit: string, uv: number, mrp: string, price: string, kw: string, x: Extra = {}): ItemSeedV3 => ({
  root, sup, name, hi, icon, unit, uv, mrp, price, kw,
  stock: x.stock ?? 30, max: x.max ?? 10, rx: x.rx ?? false, regulated: x.regulated ?? false, note: x.note,
});

/** Group helpers — they only pin the fixed columns (category, supplier, licence note) of a group. */
const GIFT = (name: string, hi: string, icon: string, unit: string, uv: number, mrp: string, price: string, kw: string, x: Extra = {}): ItemSeedV3 => P('birthday', 'gift-house', name, hi, icon, unit, uv, mrp, price, kw, x);
const FIRE = (sup: string, name: string, hi: string, icon: string, unit: string, uv: number, mrp: string, price: string, kw: string, x: Extra = {}): ItemSeedV3 => P('patakha', sup, name, hi, icon, unit, uv, mrp, price, kw, { max: 5, ...x, regulated: true, note: FIREWORK_NOTE });
const DIWALI = (sup: string, name: string, hi: string, icon: string, unit: string, uv: number, mrp: string, price: string, kw: string, x: Extra = {}): ItemSeedV3 => P('patakha', sup, name, hi, icon, unit, uv, mrp, price, kw, x);
const AGRI = (name: string, hi: string, icon: string, unit: string, uv: number, mrp: string, price: string, kw: string, x: Extra = {}): ItemSeedV3 => P('beej-bhandar', 'beej', name, hi, icon, unit, uv, mrp, price, kw, { note: x.regulated ? AGRI_CHEM_NOTE : SEED_NOTE, ...x });
const MED = (name: string, hi: string, icon: string, unit: string, uv: number, mrp: string, price: string, kw: string, x: Extra = {}): ItemSeedV3 => P('dawai', 'medical', name, hi, icon, unit, uv, mrp, price, kw, { max: 5, note: RX_NOTE, ...x });

const BIRTHDAY_ITEMS: ItemSeedV3[] = [
  GIFT('Vanilla Cake 500 g', 'वनीला केक 500 ग्राम', 'cake', 'g', 500, '400.00', '350.00', 'cake kek vanilla birthday केक जन्मदिन', { stock: 10, max: 3, note: CAKE_NOTE }),
  GIFT('Chocolate Cake 1 kg', 'चॉकलेट केक 1 किलो', 'cake', 'kg', 1, '750.00', '650.00', 'cake kek chocolate चॉकलेट केक', { stock: 10, max: 3, note: CAKE_NOTE }),
  GIFT('Pineapple Cake 1 kg', 'पाइनएप्पल केक 1 किलो', 'cake', 'kg', 1, '700.00', '600.00', 'cake kek pineapple ananas अनानास केक', { stock: 10, max: 3, note: CAKE_NOTE }),
  GIFT('Birthday Candles (10 pcs)', 'जन्मदिन की मोमबत्ती (10 नग)', 'candle', 'pack', 1, '40.00', '30.00', 'candle mombatti मोमबत्ती कैंडल', { stock: 60 }),
  GIFT('Number Candle (0-9)', 'नंबर वाली मोमबत्ती (0-9)', 'candle', 'piece', 1, '50.00', '40.00', 'number candle ank mombatti नंबर कैंडल', { stock: 40 }),
  GIFT('Balloons (pack of 50)', 'गुब्बारे (50 का पैक)', 'balloon', 'pack', 1, '120.00', '99.00', 'gubbara balloon गुब्बारा बैलून', { stock: 40 }),
  GIFT('Foil Balloon - Happy Birthday', 'फ़ॉइल बैलून — Happy Birthday', 'balloon', 'set', 1, '250.00', '199.00', 'foil balloon letter gubbara फ़ॉइल गुब्बारा', { stock: 20 }),
  GIFT('Happy Birthday Banner', 'Happy Birthday बैनर', 'flag', 'piece', 1, '80.00', '60.00', 'banner poster banner जन्मदिन बैनर', { stock: 30 }),
  GIFT('Party Caps (10 pcs)', 'पार्टी टोपी (10 नग)', 'crown', 'pack', 1, '80.00', '60.00', 'party cap topi टोपी पार्टी', { stock: 30 }),
  GIFT('Party Blowers (10 pcs)', 'पार्टी सीटी / ब्लोअर (10 नग)', 'speakerphone', 'pack', 1, '90.00', '70.00', 'party horn blower seeti सीटी', { stock: 30 }),
  GIFT('Ribbon and Bow Set', 'रिबन व बो सेट', 'gift', 'set', 1, '70.00', '55.00', 'ribbon bow रिबन', { stock: 30 }),
  GIFT('Gift Wrapping Paper (5 sheets)', 'गिफ़्ट रैपिंग पेपर (5 शीट)', 'gift-card', 'pack', 1, '60.00', '50.00', 'wrapping paper gift kagaz रैपिंग पेपर', { stock: 40 }),
  GIFT('Greeting Card', 'शुभकामना कार्ड', 'mail', 'piece', 1, '50.00', '40.00', 'greeting card badhai कार्ड', { stock: 40 }),
  GIFT('Paper Plates and Glasses (25 each)', 'पेपर प्लेट व गिलास (25-25)', 'glass', 'pack', 1, '150.00', '120.00', 'paper plate glass dona पेपर प्लेट गिलास', { stock: 40 }),
  GIFT('Cake Knife and Base Set', 'केक चाकू व बेस सेट', 'tools-kitchen-2', 'set', 1, '90.00', '70.00', 'cake knife base chaku चाकू', { stock: 20 }),
  GIFT('Decoration Light String (10 m)', 'सजावट की लड़ी लाइट (10 मीटर)', 'bulb', 'piece', 1, '250.00', '199.00', 'light string jhalar ladi लड़ी लाइट', { stock: 20 }),
  GIFT('Return Gift Pack (10 pcs)', 'रिटर्न गिफ़्ट पैक (10 नग)', 'gift', 'pack', 1, '500.00', '450.00', 'return gift pack रिटर्न गिफ्ट', { stock: 15, max: 5 }),
  GIFT('Party Popper (5 pcs)', 'पार्टी पॉपर (5 नग)', 'confetti', 'pack', 1, '120.00', '99.00', 'party popper confetti पॉपर', { stock: 25 }),
  GIFT('Birthday Sash', 'जन्मदिन की पट्टी (सैश)', 'medal', 'piece', 1, '120.00', '99.00', 'sash patti birthday सैश', { stock: 20 }),
  GIFT('Cake Topper', 'केक टॉपर', 'star', 'piece', 1, '80.00', '60.00', 'cake topper टॉपर', { stock: 25 }),
];

const PATAKHA_ITEMS: ItemSeedV3[] = [
  FIRE('patakha1', 'Anar / Flower Pot (5 pcs)', 'अनार (5 नग)', 'flare', 'pack', 1, '200.00', '180.00', 'anar flower pot patakha अनार पटाखा', { stock: 40 }),
  FIRE('patakha1', 'Chakri / Ground Spinner (10 pcs)', 'चकरी (10 नग)', 'refresh', 'pack', 1, '120.00', '100.00', 'chakri chakkar patakha चकरी', { stock: 40 }),
  FIRE('patakha2', 'Phuljhadi / Sparklers (50 pcs)', 'फुलझड़ी (50 नग)', 'sparkles', 'pack', 1, '100.00', '80.00', 'phuljhadi fuljhadi sparkler फुलझड़ी', { stock: 60 }),
  FIRE('patakha2', 'Colour Sparkler 30 cm (10 pcs)', 'रंगीन स्पार्कलर 30 सेमी (10 नग)', 'sparkles', 'pack', 1, '150.00', '120.00', 'sparkler rangeen phuljhadi स्पार्कलर', { stock: 40 }),
  FIRE('patakha1', 'Rassi Bomb / Ladi (1000 shots)', 'रस्सी बम / लड़ी (1000 शॉट)', 'bolt', 'piece', 1, '450.00', '400.00', 'rassi bomb ladi patakha रस्सी बम लड़ी', { stock: 25 }),
  FIRE('patakha3', 'Sutli Bomb (10 pcs)', 'सुतली बम (10 नग)', 'bolt', 'pack', 1, '180.00', '150.00', 'sutli bomb patakha सुतली बम', { stock: 30 }),
  FIRE('patakha3', 'Mirchi Bomb (20 pcs)', 'मिर्ची बम (20 नग)', 'bolt', 'pack', 1, '120.00', '100.00', 'mirchi bomb patakha मिर्ची बम', { stock: 30 }),
  FIRE('patakha2', 'Rocket (10 pcs)', 'रॉकेट (10 नग)', 'rocket', 'pack', 1, '250.00', '220.00', 'rocket raket patakha रॉकेट', { stock: 30 }),
  FIRE('patakha3', 'Zameen Chakkar (10 pcs)', 'ज़मीन चक्कर (10 नग)', 'refresh', 'pack', 1, '130.00', '110.00', 'zameen chakkar bhui patakha ज़मीन चक्कर', { stock: 30 }),
  FIRE('patakha2', 'Sky Shot (12 shot)', 'आसमानी शॉट (12 शॉट)', 'rocket', 'piece', 1, '650.00', '550.00', 'sky shot aasmani patakha स्काई शॉट', { stock: 15, max: 3 }),
  FIRE('patakha1', 'Family Pack (mixed)', 'फैमिली पैक (मिला-जुला)', 'box', 'pack', 1, '1200.00', '999.00', 'family pack patakha diwali फैमिली पैक', { stock: 15, max: 3 }),
  DIWALI('patakha3', 'Mitti ke Diye (25 pcs)', 'मिट्टी के दीये (25 नग)', 'lamp', 'pack', 1, '100.00', '80.00', 'diya diye mitti deepak दीया दीपक', { stock: 80, max: 20 }),
  DIWALI('patakha3', 'Diwali Candles (10 pcs)', 'दीपावली मोमबत्ती (10 नग)', 'candle', 'pack', 1, '60.00', '50.00', 'candle mombatti मोमबत्ती', { stock: 60, max: 20 }),
  DIWALI('patakha3', 'Laxmi-Ganesh Murti (pair)', 'लक्ष्मी-गणेश मूर्ति (जोड़ी)', 'om', 'set', 1, '300.00', '250.00', 'laxmi ganesh murti puja लक्ष्मी गणेश मूर्ति', { stock: 25, max: 3 }),
  DIWALI('patakha3', 'Rangoli Colours (8 colours)', 'रंगोली के रंग (8 रंग)', 'paint', 'pack', 1, '120.00', '99.00', 'rangoli rang colour रंगोली रंग', { stock: 40 }),
  DIWALI('patakha1', 'Jhalar LED Light (10 m)', 'झालर एलईडी लाइट (10 मीटर)', 'bulb', 'piece', 1, '250.00', '199.00', 'jhalar light ladi led झालर लाइट', { stock: 40 }),
  DIWALI('patakha3', 'Toran / Bandanwar', 'तोरण / बंदनवार', 'leaf', 'piece', 1, '150.00', '120.00', 'toran bandanwar door hanging तोरण बंदनवार', { stock: 30 }),
  DIWALI('patakha3', 'Kheel-Batasha (500 g)', 'खील-बताशा (500 ग्राम)', 'candy', 'g', 500, '90.00', '80.00', 'kheel batasha puja खील बताशा', { stock: 40 }),
  DIWALI('patakha3', 'Puja Thali (steel)', 'पूजा थाली (स्टील)', 'bowl', 'piece', 1, '350.00', '300.00', 'puja thali thaali पूजा थाली', { stock: 20, max: 3 }),
  DIWALI('patakha3', 'Roli-Chawal Packet', 'रोली-चावल पैकेट', 'grain', 'pack', 1, '30.00', '25.00', 'roli chawal tilak puja रोली चावल', { stock: 60, max: 20 }),
  DIWALI('patakha3', 'Kapoor / Camphor (50 g)', 'कपूर (50 ग्राम)', 'flame', 'g', 50, '90.00', '80.00', 'kapoor camphor puja कपूर', { stock: 40 }),
  DIWALI('patakha3', 'Agarbatti (2 packs)', 'अगरबत्ती (2 पैकेट)', 'flame', 'pack', 1, '70.00', '60.00', 'agarbatti dhoop incense अगरबत्ती धूप', { stock: 60, max: 20 }),
  DIWALI('patakha3', 'Laxmi Pujan Samagri Pack', 'लक्ष्मी पूजन सामग्री पैक', 'pray', 'pack', 1, '300.00', '250.00', 'puja samagri laxmi pujan पूजा सामग्री', { stock: 25, max: 3 }),
];

const BEEJ_ITEMS: ItemSeedV3[] = [
  AGRI('Urea 45 kg Bag', 'यूरिया (45 किलो बोरी)', 'package', 'bag', 1, '300.00', '275.00', 'urea khad यूरिया खाद', { stock: 60, max: 20, regulated: true }),
  AGRI('DAP 50 kg Bag', 'डीएपी (50 किलो बोरी)', 'package', 'bag', 1, '1400.00', '1350.00', 'dap khad डीएपी खाद', { stock: 40, max: 10, regulated: true }),
  AGRI('Potash (MOP) 50 kg Bag', 'पोटाश MOP (50 किलो बोरी)', 'package', 'bag', 1, '1750.00', '1700.00', 'potash mop khad पोटाश खाद', { stock: 30, max: 10, regulated: true }),
  AGRI('NPK 12:32:16 (50 kg)', 'एनपीके 12:32:16 (50 किलो)', 'package', 'bag', 1, '1600.00', '1550.00', 'npk khad एनपीके खाद', { stock: 30, max: 10, regulated: true }),
  AGRI('Zinc Sulphate 5 kg', 'जिंक सल्फेट (5 किलो)', 'flask', 'kg', 5, '450.00', '400.00', 'zinc sulphate jink जिंक सल्फेट', { stock: 30, regulated: true }),
  AGRI('Single Super Phosphate 50 kg', 'सिंगल सुपर फॉस्फेट (50 किलो)', 'package', 'bag', 1, '600.00', '550.00', 'ssp super phosphate khad फॉस्फेट', { stock: 30, max: 10, regulated: true }),
  AGRI('Vermi / Gobar Compost 40 kg', 'वर्मी / गोबर कम्पोस्ट (40 किलो)', 'plant-2', 'bag', 1, '350.00', '300.00', 'gobar vermi compost khad गोबर खाद', { stock: 40, max: 20 }),
  AGRI('Neem Khali 40 kg', 'नीम खली (40 किलो)', 'leaf', 'bag', 1, '900.00', '850.00', 'neem khali नीम खली', { stock: 20, max: 10 }),
  AGRI('Improved Wheat Seed 40 kg', 'उन्नत गेहूँ बीज (40 किलो)', 'wheat', 'bag', 1, '1600.00', '1500.00', 'gehun wheat beej गेहूँ बीज', { stock: 40, max: 10 }),
  AGRI('Paddy Seed 10 kg', 'धान बीज (10 किलो)', 'grain', 'bag', 1, '700.00', '650.00', 'dhan paddy rice beej धान बीज', { stock: 40, max: 10 }),
  AGRI('Maize Seed 5 kg', 'मक्का बीज (5 किलो)', 'plant', 'bag', 1, '900.00', '850.00', 'makka maize corn beej मक्का बीज', { stock: 25, max: 10 }),
  AGRI('Mustard Seed 1 kg', 'सरसों बीज (1 किलो)', 'flower', 'kg', 1, '200.00', '180.00', 'sarson mustard beej सरसों बीज', { stock: 30 }),
  AGRI('Gram (Chana) Seed 20 kg', 'चना बीज (20 किलो)', 'grain', 'bag', 1, '1800.00', '1700.00', 'chana gram beej चना बीज', { stock: 20, max: 5 }),
  AGRI('Pea (Matar) Seed 20 kg', 'मटर बीज (20 किलो)', 'grain', 'bag', 1, '1900.00', '1800.00', 'matar pea beej मटर बीज', { stock: 20, max: 5 }),
  AGRI('Arhar (Tur) Seed 5 kg', 'अरहर बीज (5 किलो)', 'grain', 'bag', 1, '700.00', '650.00', 'arhar tur dal beej अरहर बीज', { stock: 20, max: 5 }),
  AGRI('Berseem Fodder Seed 5 kg', 'बरसीम (चारा) बीज (5 किलो)', 'plant-2', 'bag', 1, '900.00', '850.00', 'berseem chara fodder beej बरसीम चारा बीज', { stock: 20, max: 5 }),
  AGRI('Potato Seed 50 kg', 'आलू बीज (50 किलो)', 'package', 'bag', 1, '1500.00', '1400.00', 'aloo potato beej आलू बीज', { stock: 20, max: 5 }),
  AGRI('Onion Seed 250 g', 'प्याज़ बीज (250 ग्राम)', 'seedling', 'g', 250, '500.00', '450.00', 'pyaz onion beej प्याज़ बीज', { stock: 25 }),
  AGRI('Tomato Seed Packet', 'टमाटर बीज पैकेट', 'seedling', 'pack', 1, '60.00', '50.00', 'tamatar tomato beej टमाटर बीज', { stock: 50 }),
  AGRI('Chilli Seed Packet', 'मिर्च बीज पैकेट', 'seedling', 'pack', 1, '60.00', '50.00', 'mirch mirchi chilli beej मिर्च बीज', { stock: 50 }),
  AGRI('Bhindi (Okra) Seed Packet', 'भिंडी बीज पैकेट', 'seedling', 'pack', 1, '50.00', '40.00', 'bhindi okra beej भिंडी बीज', { stock: 50 }),
  AGRI('Lauki (Bottle Gourd) Seed Packet', 'लौकी बीज पैकेट', 'seedling', 'pack', 1, '50.00', '40.00', 'lauki gourd beej लौकी बीज', { stock: 50 }),
  AGRI('Kaddu (Pumpkin) Seed Packet', 'कद्दू बीज पैकेट', 'seedling', 'pack', 1, '50.00', '40.00', 'kaddu pumpkin beej कद्दू बीज', { stock: 50 }),
  AGRI('Torai (Ridge Gourd) Seed Packet', 'तरोई बीज पैकेट', 'seedling', 'pack', 1, '50.00', '40.00', 'torai tarui gourd beej तरोई बीज', { stock: 50 }),
  AGRI('Karela (Bitter Gourd) Seed Packet', 'करेला बीज पैकेट', 'seedling', 'pack', 1, '60.00', '50.00', 'karela bitter gourd beej करेला बीज', { stock: 50 }),
  AGRI('Coriander Seed Packet', 'धनिया बीज पैकेट', 'leaf', 'pack', 1, '40.00', '30.00', 'dhaniya coriander beej धनिया बीज', { stock: 50 }),
  AGRI('Fenugreek (Methi) Seed Packet', 'मेथी बीज पैकेट', 'leaf', 'pack', 1, '40.00', '30.00', 'methi fenugreek beej मेथी बीज', { stock: 50 }),
  AGRI('Weedicide 500 ml', 'खरपतवारनाशक (500 मि.ली.)', 'spray', 'ml', 500, '450.00', '400.00', 'kharpatwar weedicide nashak खरपतवारनाशक दवा', { stock: 25, max: 5, regulated: true }),
  AGRI('Insecticide 250 ml', 'कीटनाशक (250 मि.ली.)', 'bug', 'ml', 250, '350.00', '300.00', 'keetnashak insecticide dawa कीटनाशक', { stock: 25, max: 5, regulated: true }),
  AGRI('Fungicide 250 g', 'फफूंदनाशक (250 ग्राम)', 'spray', 'g', 250, '400.00', '350.00', 'fafundnashak fungicide dawa फफूंदनाशक', { stock: 25, max: 5, regulated: true }),
  AGRI('Sulphur Dust 5 kg', 'सल्फर डस्ट (5 किलो)', 'flask', 'kg', 5, '300.00', '250.00', 'sulphur dust gandhak सल्फर गंधक', { stock: 25, max: 5, regulated: true }),
];

const DAWAI_ITEMS: ItemSeedV3[] = [
  MED('Paracetamol 500 mg (10 tablets)', 'पैरासिटामोल 500 (10 गोली)', 'pill', 'strip', 1, '25.00', '22.00', 'paracetamol bukhar dard पैरासिटामोल बुख़ार', { stock: 80 }),
  MED('ORS Sachet (5 packets)', 'ORS घोल (5 पैकेट)', 'glass-full', 'pack', 1, '100.00', '90.00', 'ors ghol dast diarrhoea ओआरएस घोल', { stock: 60, max: 10 }),
  MED('Antacid Tablets (10 tablets)', 'एसिडिटी / पेट दर्द की गोली (10 गोली)', 'pill', 'strip', 1, '30.00', '28.00', 'antacid acidity gas pet dard एसिडिटी गैस', { stock: 60 }),
  MED('Cough Syrup 100 ml', 'खाँसी का सिरप (100 मि.ली.)', 'medicine-syrup', 'ml', 100, '120.00', '110.00', 'cough syrup khansi खाँसी सिरप', { stock: 40 }),
  MED('Cetirizine 10 mg (10 tablets)', 'सेटिरिज़िन 10 (एंटी-एलर्जिक, 10 गोली)', 'pill', 'strip', 1, '35.00', '30.00', 'cetirizine allergy antiallergic सेटिरिज़िन एलर्जी', { stock: 50, rx: true }),
  MED('Pain Relief Balm 25 g', 'दर्द निवारक बाम (25 ग्राम)', 'droplet', 'g', 25, '90.00', '80.00', 'balm dard nivarak pain बाम दर्द', { stock: 40 }),
  MED('Antiseptic Liquid 500 ml', 'एंटीसेप्टिक लिक्विड (500 मि.ली.)', 'bottle', 'ml', 500, '190.00', '175.00', 'antiseptic dettol savlon एंटीसेप्टिक', { stock: 30 }),
  MED('Bandage, Cotton and Gauze Set', 'पट्टी, रुई व गॉज़ सेट', 'bandage', 'set', 1, '120.00', '100.00', 'bandage patti rui cotton gauze पट्टी रुई', { stock: 40 }),
  MED('Glucose Powder 500 g', 'ग्लूकोज़ पाउडर (500 ग्राम)', 'glass-full', 'g', 500, '110.00', '100.00', 'glucose glucon powder ग्लूकोज़', { stock: 50, max: 10 }),
  MED('Calcium Tablets (30 tablets)', 'कैल्शियम की गोली (30 गोली)', 'pill', 'pack', 1, '180.00', '160.00', 'calcium kaishiyam कैल्शियम', { stock: 40 }),
  MED('Iron and Folic Acid Tablets (30 tablets)', 'आयरन व फोलिक एसिड की गोली (30 गोली)', 'pill', 'pack', 1, '150.00', '130.00', 'iron folic khoon ki kami आयरन खून', { stock: 40 }),
  MED('Multivitamin Tablets (30 tablets)', 'मल्टीविटामिन की गोली (30 गोली)', 'pill', 'pack', 1, '200.00', '180.00', 'multivitamin vitamin मल्टीविटामिन', { stock: 40 }),
  MED('Anti-fungal Cream 15 g', 'खुजली / फंगल क्रीम (15 ग्राम)', 'droplet', 'g', 15, '95.00', '85.00', 'antifungal khujli daad cream खुजली दाद क्रीम', { stock: 40 }),
  MED('Lubricant Eye Drops 10 ml', 'आँख के ड्रॉप (जलन-सूखापन, 10 मि.ली.)', 'eye-check', 'ml', 10, '90.00', '80.00', 'eye drop aankh आँख ड्रॉप', { stock: 30 }),
  MED('Ear Drops 10 ml', 'कान के ड्रॉप (10 मि.ली.)', 'ear', 'ml', 10, '95.00', '85.00', 'ear drop kaan कान ड्रॉप', { stock: 25, rx: true }),
  MED('Albendazole 400 mg (1 tablet)', 'पेट के कीड़े की दवा — एल्बेंडाज़ोल 400 (1 गोली)', 'capsule', 'strip', 1, '25.00', '20.00', 'albendazole pet ke kide deworm कीड़े की दवा', { stock: 60 }),
  MED('Cold and Cough Tablets (10 tablets)', 'सर्दी-ज़ुकाम की गोली (10 गोली)', 'pill', 'strip', 1, '45.00', '40.00', 'cold cough sardi zukam सर्दी ज़ुकाम', { stock: 50 }),
  MED('Antiflatulent Syrup 170 ml', 'गैस की दवा — सिरप (170 मि.ली.)', 'medicine-syrup', 'ml', 170, '160.00', '150.00', 'gas syrup antacid गैस सिरप', { stock: 30 }),
  MED('Zinc Tablets for Diarrhoea (14 tablets)', 'दस्त के लिए ज़िंक की गोली (14 गोली)', 'pill', 'strip', 1, '40.00', '35.00', 'zinc diarrhoea dast ज़िंक दस्त', { stock: 40 }),
  MED('3-ply Face Mask (10 pcs)', 'मास्क (10 नग)', 'mask', 'pack', 1, '60.00', '50.00', 'mask face mask मास्क', { stock: 60, max: 10 }),
  MED('Hand Sanitizer 100 ml', 'सैनिटाइज़र (100 मि.ली.)', 'droplet', 'ml', 100, '60.00', '50.00', 'sanitizer hand सैनिटाइज़र', { stock: 50, max: 10 }),
  MED('Sanitary Pads XL (8 pcs)', 'सैनिटरी पैड XL (8 नग)', 'shield-check', 'pack', 1, '70.00', '60.00', 'sanitary pad napkin सैनिटरी पैड', { stock: 60, max: 10 }),
  MED('Pregnancy Test Kit', 'प्रेगनेंसी टेस्ट किट', 'test-pipe', 'piece', 1, '100.00', '90.00', 'pregnancy test kit garbh प्रेगनेंसी जाँच', { stock: 30, max: 3 }),
  MED('Blood Sugar Test Strips (25)', 'शुगर टेस्ट स्ट्रिप (25 नग)', 'droplet', 'pack', 1, '600.00', '550.00', 'sugar strip glucometer शुगर स्ट्रिप', { stock: 20, max: 3 }),
  MED('Digital BP Machine', 'डिजिटल बीपी मशीन', 'heart-rate-monitor', 'piece', 1, '1800.00', '1600.00', 'bp machine blood pressure बीपी मशीन', { stock: 8, max: 2 }),
  MED('Salbutamol Inhaler', 'इनहेलर (साल्बुटामोल)', 'lungs', 'piece', 1, '250.00', '230.00', 'inhaler asthma dama इनहेलर दमा', { stock: 15, max: 2, rx: true }),
  MED('Amoxicillin 500 mg (10 capsules)', 'एमोक्सिसिलिन 500 (10 कैप्सूल)', 'capsule', 'strip', 1, '120.00', '110.00', 'amoxicillin antibiotic एंटीबायोटिक', { stock: 30, rx: true }),
  MED('Azithromycin 500 mg (3 tablets)', 'एज़िथ्रोमाइसिन 500 (3 गोली)', 'capsule', 'strip', 1, '90.00', '80.00', 'azithromycin antibiotic एंटीबायोटिक', { stock: 30, rx: true }),
  MED('Metformin 500 mg (15 tablets)', 'मेटफॉर्मिन 500 — शुगर की गोली (15 गोली)', 'pill', 'strip', 1, '40.00', '35.00', 'metformin sugar diabetes शुगर की गोली', { stock: 30, rx: true }),
  MED('Amlodipine 5 mg (15 tablets)', 'एम्लोडिपिन 5 — बीपी की गोली (15 गोली)', 'pill', 'strip', 1, '40.00', '35.00', 'amlodipine bp blood pressure बीपी की गोली', { stock: 30, rx: true }),
  MED('Pantoprazole 40 mg (15 tablets)', 'पैंटोप्राज़ोल 40 (15 गोली)', 'pill', 'strip', 1, '90.00', '80.00', 'pantoprazole acidity पैंटोप्राज़ोल', { stock: 30, rx: true }),
  MED('Diclofenac Gel 30 g', 'डाइक्लोफेनाक जेल (30 ग्राम)', 'droplet', 'g', 30, '120.00', '110.00', 'diclofenac gel dard जेल दर्द', { stock: 30 }),
  MED('Povidone-Iodine Ointment 20 g', 'पोविडोन-आयोडीन मरहम (20 ग्राम)', 'first-aid-kit', 'g', 20, '110.00', '100.00', 'betadine povidone ointment marham मरहम', { stock: 30 }),
];

const FOOD_ITEMS: ItemSeedV3[] = [
  P('fast-food', 'halwai', 'Chole Bhature', 'छोले-भटूरे', 'bowl-spoon', 'plate', 1, '70.00', '60.00', 'chole bhature छोले भटूरे', { stock: 30 }),
  P('fast-food', 'fastfood2', 'Pav Bhaji', 'पाव भाजी', 'bowl', 'plate', 1, '70.00', '60.00', 'pav bhaji पाव भाजी', { stock: 30 }),
  P('fast-food', 'halwai', 'Dahi Bhalla', 'दही-भल्ला', 'bowl', 'plate', 1, '50.00', '40.00', 'dahi bhalla vada दही भल्ला', { stock: 30 }),
  P('fast-food', 'fastfood2', 'Golgappe / Pani Puri (6 pcs)', 'गोलगप्पे / पानी पूरी (6 नग)', 'bowl', 'plate', 1, '30.00', '25.00', 'golgappa pani puri batasha गोलगप्पे पानी पूरी', { stock: 40 }),
  P('fast-food', 'fastfood2', 'Veg Roll', 'वेज रोल', 'bread', 'piece', 1, '50.00', '45.00', 'veg roll frankie रोल', { stock: 30 }),
  P('fast-food', 'fastfood2', 'Egg Roll', 'एग रोल', 'egg', 'piece', 1, '60.00', '55.00', 'egg roll anda एग रोल अंडा', { stock: 25 }),
  P('fast-food', 'fastfood2', 'French Fries', 'फ्रेंच फ्राइज़', 'burger', 'plate', 1, '70.00', '60.00', 'french fries aloo फ्रेंच फ्राइज़', { stock: 30 }),
  P('fast-food', 'fastfood2', 'Veg Sandwich', 'वेज सैंडविच', 'bread', 'piece', 1, '50.00', '40.00', 'sandwich सैंडविच', { stock: 30 }),
  P('fast-food', 'halwai', 'Idli Sambhar', 'इडली-सांभर', 'bowl-spoon', 'plate', 1, '60.00', '50.00', 'idli sambhar इडली सांभर', { stock: 25 }),
  P('fast-food', 'halwai', 'Masala Dosa', 'मसाला डोसा', 'pizza', 'plate', 1, '80.00', '70.00', 'dosa masala dosa डोसा', { stock: 25 }),
  P('fast-food', 'halwai', 'Paneer Pakoda', 'पनीर पकौड़ा', 'cheese', 'g', 250, '100.00', '90.00', 'paneer pakoda pakora पनीर पकौड़ा', { stock: 25 }),
  P('fast-food', 'fastfood2', 'Chai (cutting)', 'चाय', 'cup', 'cup', 1, '12.00', '10.00', 'chai tea चाय', { stock: 80, max: 20 }),
  P('fast-food', 'fastfood2', 'Coffee', 'कॉफ़ी', 'coffee', 'cup', 1, '25.00', '20.00', 'coffee कॉफ़ी', { stock: 50, max: 20 }),
  P('mithai', 'halwai', 'Rasmalai (500 g)', 'रसमलाई (500 ग्राम)', 'bowl', 'g', 500, '260.00', '240.00', 'rasmalai ras malai रसमलाई मिठाई', { stock: 20 }),
  P('mithai', 'halwai', 'Milk Cake (250 g)', 'मिल्क केक (250 ग्राम)', 'cake', 'g', 250, '130.00', '120.00', 'milk cake kalakand मिल्क केक मिठाई', { stock: 20 }),
  P('mithai', 'halwai', 'Balushahi (250 g)', 'बालूशाही (250 ग्राम)', 'cookie', 'g', 250, '90.00', '80.00', 'balushahi बालूशाही मिठाई', { stock: 20 }),
  P('mithai', 'halwai', 'Motichoor Laddoo (500 g)', 'मोतीचूर लड्डू (500 ग्राम)', 'candy', 'g', 500, '220.00', '200.00', 'motichoor laddoo ladoo मोतीचूर लड्डू मिठाई', { stock: 20 }),
  P('mithai', 'halwai', 'Gujiya (250 g)', 'गुझिया (250 ग्राम)', 'cookie', 'g', 250, '110.00', '100.00', 'gujiya gujhiya गुझिया मिठाई', { stock: 20 }),
  P('mithai', 'halwai', 'Kaju Roll (250 g)', 'काजू रोल (250 ग्राम)', 'candy', 'g', 250, '260.00', '240.00', 'kaju roll katli काजू रोल मिठाई', { stock: 15 }),
  P('mithai', 'halwai', 'Petha (500 g)', 'पेठा (500 ग्राम)', 'candy', 'g', 500, '120.00', '110.00', 'petha agra पेठा मिठाई', { stock: 20 }),
  P('mithai', 'halwai', 'Namkeen Mixture (250 g)', 'नमकीन मिक्सचर (250 ग्राम)', 'cookie', 'g', 250, '70.00', '60.00', 'namkeen mixture नमकीन मिक्सचर', { stock: 30 }),
  P('mithai', 'halwai', 'Dalmoth (250 g)', 'दालमोठ (250 ग्राम)', 'cookie', 'g', 250, '80.00', '70.00', 'dalmoth dalmoot दालमोठ नमकीन', { stock: 30 }),
  P('mithai', 'halwai', 'Bhujia (250 g)', 'भुजिया (250 ग्राम)', 'cookie', 'g', 250, '70.00', '60.00', 'bhujia sev भुजिया नमकीन', { stock: 30 }),
];

export const V3_ITEMS: ItemSeedV3[] = [...BIRTHDAY_ITEMS, ...PATAKHA_ITEMS, ...BEEJ_ITEMS, ...DAWAI_ITEMS, ...FOOD_ITEMS];

export interface ServiceSeedV3 {
  root: string;
  sup?: string;
  name: string;
  hi: string;
  icon: string;
  visiting: string;
  price: string;
  duration: number;
  quote: boolean;
  kw: string;
  note: string;
}
const S = (root: string, sup: string | undefined, name: string, hi: string, icon: string, visiting: string, price: string, duration: number, quote: boolean, kw: string, note: string): ServiceSeedV3 => ({ root, sup, name, hi, icon, visiting, price, duration, quote, kw, note });

const VET_EMERGENCY = 'आपात स्थिति में पहुँचने का समय पक्का नहीं कहा जा सकता — साथ ही नज़दीकी सरकारी पशु अस्पताल को भी ज़रूर फ़ोन करें।';
const LAB_HOME = 'सैंपल घर से लिया जाएगा। रिपोर्ट व्हाट्सएप पर और जाँच केंद्र से मिलेगी। फतनपुर बाज़ार सिर्फ़ बुकिंग और सैंपल पहुँचाने का काम करता है।';
const LAB_CENTRE = 'यह जाँच केंद्र पर ही होती है, घर पर नहीं — हम सिर्फ़ आपका समय बुक करते हैं। जाते समय डॉक्टर की पर्ची और पहचान पत्र साथ ले जाएं।';
const VIDEO_FLOW = 'समय चुनें → भुगतान करें → तय समय पर आपके व्हाट्सएप नंबर पर वीडियो मीटिंग का लिंक आएगा → डॉक्टर से बात करें → पर्ची व्हाट्सएप पर मिलेगी। यह आपात स्थिति के लिए नहीं है — उसके लिए 108 या नज़दीकी अस्पताल।';

const VET_SERVICES: ServiceSeedV3[] = [
  S('pashu-doctor', undefined, 'Cattle Check-up at Home (Dr. Ramkumar Verma)', 'घर पर पशु की जाँच — डॉ. रामकुमार वर्मा', 'stethoscope', '100.00', '300.00', 30, false, 'pashu doctor gaay bhains जाँच पशु चिकित्सक', 'डॉ. रामकुमार वर्मा (पशु चिकित्सक) घर आकर पशु को देखेंगे। दवा का ख़र्च अलग है।'),
  S('pashu-doctor', undefined, 'Vaccination - FMD / HS (Dr. Suresh Maurya)', 'टीकाकरण (खुरपका-मुँहपका / गलाघोंटू) — डॉ. सुरेश मौर्य', 'vaccine', '100.00', '250.00', 20, false, 'tika vaccination khurpaka galaghotu टीका पशु', 'डॉ. सुरेश मौर्य (पशु चिकित्सक) टीका लगाएंगे। एक बार में कितने पशु हैं, बुकिंग में लिख दें।'),
  S('pashu-doctor', undefined, 'Pregnancy / Infertility Check (Dr. Ramkumar Verma)', 'बाँझपन व गर्भ जाँच — डॉ. रामकुमार वर्मा', 'clipboard-heart', '150.00', '400.00', 30, false, 'banjhpan garbh pregnancy jaanch बाँझपन गर्भ जाँच', 'डॉ. रामकुमार वर्मा (पशु चिकित्सक) जाँच करेंगे और आगे का इलाज बताएंगे।'),
  S('pashu-doctor', undefined, 'Calving Help - Emergency (Dr. Anil Yadav)', 'ब्याने (डिलीवरी) में मदद — आपातकालीन — डॉ. अनिल यादव', 'emergency-bed', '200.00', '0.00', 90, true, 'byane delivery calving emergency ब्याना आपातकाल पशु', `डॉ. अनिल यादव (पशु चिकित्सक)। ख़र्च हालत देखकर तय होगा। ${VET_EMERGENCY}`),
  S('pashu-doctor', undefined, 'Mastitis (Thanaila) Treatment (Dr. Suresh Maurya)', 'थनैला का इलाज — डॉ. सुरेश मौर्य', 'milk', '100.00', '350.00', 30, false, 'thanaila mastitis than थनैला थन', 'डॉ. सुरेश मौर्य (पशु चिकित्सक)। दवा का ख़र्च अलग। दूध निकालने से पहले थन ज़रूर धोएं।'),
  S('pashu-doctor', undefined, 'Deworming Dose (Dr. Anil Yadav)', 'कृमिनाशक दवा-खुराक — डॉ. अनिल यादव', 'medicine-syrup', '100.00', '200.00', 15, false, 'krimi deworming pet ke kide कृमि कीड़े पशु', 'डॉ. अनिल यादव (पशु चिकित्सक)। पशु का वज़न बता दें ताकि खुराक सही बने।'),
  S('pashu-doctor', undefined, 'Yearly General Check-up (Dr. Ramkumar Verma)', 'पशु का सामान्य चेकअप (साल भर में एक बार) — डॉ. रामकुमार वर्मा', 'paw', '100.00', '250.00', 20, false, 'checkup general pashu सामान्य जाँच पशु', 'डॉ. रामकुमार वर्मा (पशु चिकित्सक) पूरा चेकअप करेंगे और खान-पान की सलाह देंगे।'),
  S('pashu-doctor', undefined, 'Treatment of a Sick Animal (Dr. Anil Yadav)', 'बीमार पशु का इलाज (दवा सहित) — डॉ. अनिल यादव', 'first-aid-kit', '150.00', '0.00', 60, true, 'bimar pashu ilaj dawa बीमार पशु इलाज', `डॉ. अनिल यादव (पशु चिकित्सक)। ख़र्च बीमारी और दवा देखकर तय होगा। ${VET_EMERGENCY}`),
];

const LAB_SERVICES: ServiceSeedV3[] = [
  S('body-checkup', 'inder-path', 'Blood Sugar - Fasting and PP', 'शुगर जाँच (फ़ास्टिंग + PP)', 'droplet', '50.00', '150.00', 20, false, 'sugar fasting pp diabetes शुगर जाँच', `सुबह खाली पेट पहला सैंपल, खाने के 2 घंटे बाद दूसरा। ${LAB_HOME}`),
  S('body-checkup', 'inder-path', 'HbA1c - 3 Month Sugar', 'HbA1c (3 महीने की शुगर)', 'report-medical', '50.00', '600.00', 20, false, 'hba1c sugar 3 mahine एचबीए1सी शुगर', `खाली पेट होना ज़रूरी नहीं। ${LAB_HOME}`),
  S('body-checkup', 'inder-path', 'CBC with ESR', 'खून की पूरी जाँच (CBC + ESR)', 'droplet', '50.00', '350.00', 20, false, 'cbc esr blood khoon jaanch सीबीसी खून', LAB_HOME),
  S('body-checkup', 'inder-path', 'Lipid Profile', 'लिपिड प्रोफ़ाइल (कोलेस्ट्रॉल)', 'heart-rate-monitor', '50.00', '700.00', 20, false, 'lipid cholesterol profile लिपिड कोलेस्ट्रॉल', `12 घंटे खाली पेट ज़रूरी। ${LAB_HOME}`),
  S('body-checkup', 'inder-path', 'Thyroid Profile - T3 T4 TSH', 'थायरॉइड प्रोफ़ाइल (T3, T4, TSH)', 'flask', '50.00', '450.00', 20, false, 'thyroid tsh t3 t4 थायरॉइड', LAB_HOME),
  S('body-checkup', 'inder-path', 'Liver Function Test (LFT)', 'लिवर की जाँच (LFT)', 'flask', '50.00', '800.00', 20, false, 'lft liver jigar लिवर जिगर जाँच', LAB_HOME),
  S('body-checkup', 'inder-path', 'Kidney Function Test (KFT)', 'किडनी की जाँच (KFT)', 'flask', '50.00', '800.00', 20, false, 'kft kidney gurda किडनी गुर्दा जाँच', LAB_HOME),
  S('body-checkup', 'inder-path', 'Uric Acid Test', 'यूरिक एसिड जाँच', 'test-pipe', '50.00', '300.00', 20, false, 'uric acid joint dard यूरिक एसिड', LAB_HOME),
  S('body-checkup', 'inder-path', 'Vitamin D Test', 'विटामिन D जाँच', 'sun', '50.00', '1200.00', 20, false, 'vitamin d जाँच विटामिन डी', LAB_HOME),
  S('body-checkup', 'inder-path', 'Vitamin B12 Test', 'विटामिन B12 जाँच', 'capsule', '50.00', '1100.00', 20, false, 'vitamin b12 जाँच विटामिन बी12', LAB_HOME),
  S('body-checkup', 'inder-path', 'Haemoglobin (Hb) Test', 'हीमोग्लोबिन (Hb) जाँच', 'droplet', '50.00', '120.00', 15, false, 'hb haemoglobin khoon ki kami हीमोग्लोबिन खून', LAB_HOME),
  S('body-checkup', 'inder-path', 'Typhoid (Widal) Test', 'टाइफ़ाइड (विडाल) जाँच', 'virus', '50.00', '350.00', 20, false, 'typhoid widal motijhara टाइफ़ाइड विडाल', LAB_HOME),
  S('body-checkup', 'inder-path', 'Dengue Test (NS1 + IgM)', 'डेंगू जाँच (NS1 + IgM)', 'virus', '50.00', '800.00', 20, false, 'dengue ns1 igm डेंगू जाँच', LAB_HOME),
  S('body-checkup', 'inder-path', 'Malaria Test', 'मलेरिया जाँच', 'virus', '50.00', '250.00', 20, false, 'malaria mlaria मलेरिया जाँच', LAB_HOME),
  S('body-checkup', 'inder-path', 'Urine Routine Test', 'यूरिन रूटीन जाँच', 'flask', '50.00', '250.00', 20, false, 'urine peshab routine यूरिन पेशाब जाँच', `सैंपल के लिए साफ़ डिब्बी साथ लाई जाएगी। ${LAB_HOME}`),
  S('body-checkup', 'inder-path', 'Pregnancy Test (Beta-HCG)', 'प्रेगनेंसी जाँच (Beta-HCG)', 'test-pipe', '50.00', '600.00', 20, false, 'pregnancy beta hcg garbh प्रेगनेंसी जाँच', LAB_HOME),
  S('body-checkup', 'inder-path', 'Full Body Package (60+ tests)', 'फुल बॉडी पैकेज (60+ जाँच)', 'report-medical', '100.00', '1999.00', 30, false, 'full body package checkup फुल बॉडी पैकेज', `10–12 घंटे खाली पेट ज़रूरी। ${LAB_HOME}`),
  S('body-checkup', 'mulayam-xray', 'Chest X-Ray', 'छाती का एक्स-रे', 'bone', '0.00', '350.00', 20, false, 'chest xray seena छाती एक्स-रे', LAB_CENTRE),
  S('body-checkup', 'mulayam-xray', 'Hand / Leg X-Ray', 'हाथ या पैर का एक्स-रे', 'bone', '0.00', '350.00', 20, false, 'hand leg xray hath pair हाथ पैर एक्स-रे', LAB_CENTRE),
  S('body-checkup', 'mulayam-xray', 'Spine X-Ray', 'रीढ़ का एक्स-रे', 'bone', '0.00', '500.00', 20, false, 'spine xray reedh कमर रीढ़ एक्स-रे', LAB_CENTRE),
  S('body-checkup', 'harshit-path', 'Abdomen Ultrasound', 'पेट का अल्ट्रासाउंड', 'report-medical', '0.00', '800.00', 30, false, 'ultrasound pet abdomen अल्ट्रासाउंड पेट', LAB_CENTRE),
  S('body-checkup', 'harshit-path', 'Pregnancy Ultrasound', 'गर्भावस्था का अल्ट्रासाउंड', 'baby-carriage', '0.00', '900.00', 30, false, 'ultrasound pregnancy garbh अल्ट्रासाउंड गर्भ', `${LAB_CENTRE} PCPNDT कानून लागू है: जाँच सिर्फ़ पंजीकृत केंद्र पर, डॉक्टर की पर्ची पर ही होगी। भ्रूण का लिंग न बताया जाता है न पूछा जा सकता है — यह अपराध है।`),
  S('body-checkup', 'harshit-path', 'KUB / Kidney Ultrasound', 'KUB / किडनी का अल्ट्रासाउंड', 'report-medical', '0.00', '900.00', 30, false, 'ultrasound kub kidney गुर्दा किडनी अल्ट्रासाउंड', LAB_CENTRE),
];

const VIDEO_SERVICES: ServiceSeedV3[] = [
  S('doctor-consult', undefined, 'Video Consultation - General Physician', 'वीडियो पर डॉक्टर — जनरल फिजिशियन (डॉ. ए. के. सिंह)', 'video', '0.00', '200.00', 15, false, 'video doctor general physician वीडियो डॉक्टर', `डॉ. ए. के. सिंह, 15 मिनट। ${VIDEO_FLOW}`),
  S('doctor-consult', undefined, 'Video Consultation - Paediatrician', 'वीडियो पर डॉक्टर — बच्चों के डॉक्टर (डॉ. प्रीति गुप्ता)', 'mood-kid', '0.00', '300.00', 15, false, 'video doctor bachche paediatrician बच्चों के डॉक्टर', `डॉ. प्रीति गुप्ता, 15 मिनट। ${VIDEO_FLOW}`),
  S('doctor-consult', undefined, 'Video Consultation - Skin (Dermatologist)', 'वीडियो पर डॉक्टर — चर्म रोग (डॉ. एम. के. पांडेय)', 'medical-cross', '0.00', '400.00', 20, false, 'video doctor skin charm rog dermatologist चर्म रोग', `डॉ. एम. के. पांडेय, 20 मिनट। दिक्कत वाली जगह की साफ़ फ़ोटो पहले भेज दें। ${VIDEO_FLOW}`),
  S('doctor-consult', undefined, 'Video Consultation - Orthopaedic', 'वीडियो पर डॉक्टर — हड्डी (डॉ. आर. एस. यादव)', 'bone', '0.00', '500.00', 20, false, 'video doctor haddi bone orthopaedic हड्डी डॉक्टर', `डॉ. आर. एस. यादव, 20 मिनट। पुराना एक्स-रे हो तो पहले भेज दें। ${VIDEO_FLOW}`),
  S('doctor-consult', undefined, 'Video Consultation - Gynaecologist', 'वीडियो पर डॉक्टर — स्त्री रोग (डॉ. शालिनी वर्मा)', 'user-heart', '0.00', '500.00', 20, false, 'video doctor stri rog gynaecologist महिला डॉक्टर', `डॉ. शालिनी वर्मा, 20 मिनट। ${VIDEO_FLOW}`),
  S('doctor-consult', undefined, 'Video Consultation - Dental', 'वीडियो पर डॉक्टर — दाँत (डॉ. नीरज गुप्ता)', 'dental', '0.00', '300.00', 15, false, 'video doctor dant dental दाँत डॉक्टर', `डॉ. नीरज गुप्ता, 15 मिनट। दाँत की फ़ोटो पहले भेज दें। ${VIDEO_FLOW}`),
];

const HIRE_SERVICES: ServiceSeedV3[] = [
  S('bhada-gadi', undefined, 'Bolero / 4-Wheeler - Akhilesh Yadav', 'अखिलेश यादव — बोलेरो / 4 पहिया (बुकिंग)', 'car', '0.00', '0.00', 480, true, 'bolero car gadi booking akhilesh बोलेरो गाड़ी', 'गाड़ी मालिक: अखिलेश यादव। किराया दूरी और डीज़ल देखकर फ़ोन पर तय होगा।'),
  S('bhada-gadi', undefined, '4-Wheeler - K.D. Yadav', 'के.डी. यादव — 4 पहिया (बुकिंग)', 'car', '0.00', '0.00', 480, true, 'car gadi booking kd yadav कार गाड़ी', 'गाड़ी मालिक: के.डी. यादव। किराया दूरी और डीज़ल देखकर फ़ोन पर तय होगा।'),
  S('bhada-gadi', undefined, 'E-Rickshaw - Rinku', 'रिंकू — ई-रिक्शा', 'scooter', '0.00', '0.00', 60, true, 'e rickshaw erickshaw rinku ई-रिक्शा', 'चालक: रिंकू। सवारी या हल्का सामान — किराया दूरी से तय।'),
  S('bhada-gadi', undefined, 'E-Rickshaw - Munna', 'मुन्ना — ई-रिक्शा', 'scooter', '0.00', '0.00', 60, true, 'e rickshaw erickshaw munna ई-रिक्शा', 'चालक: मुन्ना। सवारी या हल्का सामान — किराया दूरी से तय।'),
  S('bhada-gadi', undefined, 'Motorcycle for a Day - Rahul', 'राहुल — बाइक (एक दिन)', 'motorbike', '0.00', '500.00', 480, false, 'bike motorcycle bhada rahul बाइक किराया', 'मालिक: राहुल। एक दिन का किराया; पेट्रोल आपका। आधार कार्ड की कॉपी देनी होगी।'),
  S('bhada-gadi', undefined, 'Motorcycle for a Day - Vikas', 'विकास — बाइक (एक दिन)', 'motorbike', '0.00', '500.00', 480, false, 'bike motorcycle bhada vikas बाइक किराया', 'मालिक: विकास। एक दिन का किराया; पेट्रोल आपका। आधार कार्ड की कॉपी देनी होगी।'),
  S('bhada-gadi', undefined, 'Tractor Ploughing per Hour - Sonu', 'सोनू ट्रैक्टर — खेत जुताई (प्रति घंटा)', 'tractor', '0.00', '0.00', 60, true, 'tractor jutai khet sonu ट्रैक्टर जुताई', 'मालिक: सोनू। घंटे का रेट खेत और डीज़ल देखकर फ़ोन पर तय होगा।'),
  S('bhada-gadi', undefined, 'Rice Milling - Sonu Rice Mill', 'सोनू राइस मिल — धान कुटाई / धराई', 'engine', '0.00', '0.00', 120, true, 'rice mill dhan kutai dharai सोनू राइस मिल धान कुटाई', 'सोनू राइस मिल। रेट बोरी के हिसाब से — फ़ोन पर तय होगा। धान मिल तक पहुँचाना अलग से तय करें।'),
  S('bhada-gadi', undefined, 'Wheat Threshing per Hour', 'गेहूँ मड़ाई — थ्रेशर (प्रति घंटा)', 'wheat', '0.00', '0.00', 60, true, 'thresher gehun madai threshing थ्रेशर गेहूँ मड़ाई', 'थ्रेशर घंटे के हिसाब से। रेट फ़सल और डीज़ल देखकर फ़ोन पर तय होगा।'),
];

export const V3_SERVICES: ServiceSeedV3[] = [...VET_SERVICES, ...LAB_SERVICES, ...VIDEO_SERVICES, ...HIRE_SERVICES];
