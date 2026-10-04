/**
 * Catalog v2 (owner's Sept-2026 brief): 15 top-level categories in the owner's order, the original
 * 14 categories re-parented under them, and starter items for the new categories.
 *
 * Idempotent by slug — `seedCatalogV2` only INSERTS what is missing and never overwrites prices,
 * names or stock the owner has edited. Prices are typical rural-UP retail estimates (Sept 2026);
 * the owner corrects them in /admin/products. Generic item names on purpose (no brand claims).
 * Icons are Tabler icon keys (MIT) drawn by the website — see apps/web/src/components/icons.tsx.
 */
export interface RootSeed {
  slug: string;
  name: string;
  nameHi: string;
  vertical: 'VEGETABLES' | 'FRUITS' | 'GROCERY' | 'PHARMACY' | 'AGRI_INPUT' | 'SERVICE' | 'OTHER';
  itemType: 'PRODUCT' | 'SERVICE';
  icon: string;
  intro: string;
}

export const ROOTS: RootSeed[] = [
  { slug: 'kirana', name: 'Kirana & Grocery', nameHi: 'किराना', vertical: 'GROCERY', itemType: 'PRODUCT', icon: 'basket', intro: 'आटा, दाल, चावल, तेल, मसाला, चाय-चीनी और रोज़ की ज़रूरत का हर सामान — एक ही ऑर्डर में घर तक।' },
  { slug: 'fal-sabzi', name: 'Fruits & Vegetables', nameHi: 'फल-सब्ज़ी', vertical: 'VEGETABLES', itemType: 'PRODUCT', icon: 'carrot', intro: 'रोज़ सुबह मंडी से आई सब्ज़ी और मौसम के फल। तौल में कम निकले तो बिल अपने आप कम होता है।' },
  { slug: 'fast-food', name: 'Fast Food', nameHi: 'फ़ास्ट फ़ूड', vertical: 'GROCERY', itemType: 'PRODUCT', icon: 'burger', intro: 'समोसा, चाउमीन, टिक्की, पकौड़े — बाज़ार की गरम चीज़ें, पैक करके घर तक।' },
  { slug: 'mithai', name: 'Sweets', nameHi: 'मिठाई', vertical: 'GROCERY', itemType: 'PRODUCT', icon: 'cake', intro: 'लड्डू, पेड़ा, बर्फ़ी, रसगुल्ला — त्योहार हो या मेहमान, हलवाई की ताज़ी मिठाई।' },
  { slug: 'electronics', name: 'Electronics & Electricals', nameHi: 'बिजली का सामान', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'bulb', intro: 'बल्ब, ट्यूबलाइट, एक्सटेंशन बोर्ड, चार्जर, टॉर्च, बैटरी — घर की बिजली की ज़रूरतें।' },
  { slug: 'beauty', name: 'Beauty & Personal Care', nameHi: 'सौंदर्य व देखभाल', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'sparkles', intro: 'बालों का तेल, क्रीम, पाउडर, काजल, मेहंदी, सिंदूर — रोज़ की देखभाल का सामान।' },
  { slug: 'kapde', name: 'Clothes', nameHi: 'कपड़े', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'shirt', intro: 'गमछा, लुंगी, तौलिया, चादर, साड़ी और बच्चों के कपड़े — रोज़ पहनने वाले, सही दाम पर।' },
  { slug: 'joote-chappal', name: 'Footwear', nameHi: 'जूते-चप्पल', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'shoe', intro: 'हवाई चप्पल, सैंडल, स्कूल के जूते, गमबूट — पूरे परिवार के लिए।' },
  { slug: 'kheti', name: 'Farming Tools', nameHi: 'खेती-किसानी', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'tractor', intro: 'खुरपी, फावड़ा, हँसिया, स्प्रे पंप, पाइप, तिरपाल — खेत का ज़रूरी सामान। खाद-बीज लाइसेंस मिलने के बाद जुड़ेंगे।' },
  { slug: 'building-material', name: 'Building Material', nameHi: 'बिल्डिंग मटेरियल', vertical: 'OTHER', itemType: 'PRODUCT', icon: 'wall', intro: 'सीमेंट, सरिया, ईंट, बालू, पाइप, पेंट — घर बनाने और मरम्मत का सामान। भारी सामान का भाड़ा अलग लग सकता है।' },
  { slug: 'body-checkup', name: 'Health Check-up', nameHi: 'बॉडी चेकअप', vertical: 'SERVICE', itemType: 'SERVICE', icon: 'heartbeat', intro: 'शुगर, बीपी, खून की जाँच — घर से सैंपल। रिपोर्ट जाँच केंद्र से आती है।' },
  { slug: 'doctor', name: 'Doctor', nameHi: 'डॉक्टर', vertical: 'SERVICE', itemType: 'SERVICE', icon: 'stethoscope', intro: 'डॉक्टर से मिलने का समय बुक करें या घर पर बुलाएं। आपात स्थिति में सीधे 108 पर कॉल करें।' },
  { slug: 'dawai', name: 'Medicines', nameHi: 'दवाइयाँ', vertical: 'PHARMACY', itemType: 'PRODUCT', icon: 'pill', intro: 'दवा की सेवा ड्रग लाइसेंस मिलने के बाद शुरू होगी। पर्ची वाली दवाएँ सिर्फ़ पर्ची देखकर ही दी जाएंगी।' },
  { slug: 'bhada-gadi', name: 'Vehicle on Hire', nameHi: 'भाड़ा गाड़ी', vertical: 'SERVICE', itemType: 'SERVICE', icon: 'truck', intro: 'ट्रैक्टर-ट्रॉली, पिकअप, ई-रिक्शा, बोलेरो — सामान ढुलाई और सवारी के लिए गाड़ी बुक करें। किराया दूरी देखकर तय होता है।' },
  { slug: 'ghar-sewa', name: 'Home Repair & Help', nameHi: 'घर की सेवाएँ', vertical: 'SERVICE', itemType: 'SERVICE', icon: 'tool', intro: 'बिजली मिस्त्री, प्लंबर, पंखा-आरओ-गैस की मरम्मत और फ़ॉर्म भरवाने में मदद — घर बैठे।' },
];

/** Existing (v1) category slug → [new root slug, Tabler icon]. */
export const REPARENT: Record<string, [string, string]> = {
  sabziyan: ['fal-sabzi', 'carrot'],
  'hari-sabzi': ['fal-sabzi', 'leaf'],
  fal: ['fal-sabzi', 'apple'],
  'aata-dal': ['kirana', 'grain'],
  'tel-masala': ['kirana', 'bottle'],
  'chai-cheeni': ['kirana', 'cup'],
  'sabun-detergent': ['kirana', 'wash'],
  'biscuit-namkeen': ['kirana', 'cookie'],
  'doodh-dairy': ['kirana', 'milk'],
  dawaiyan: ['dawai', 'pill'],
  'khad-beej': ['kheti', 'seedling'],
  'ghar-marammat': ['ghar-sewa', 'tool'],
  'gas-appliance': ['ghar-sewa', 'flame'],
  'dastavez-sahayata': ['ghar-sewa', 'file-text'],
};

export const V2_SUPPLIERS = [
  { key: 'halwai', name: 'Local Halwai', nameHi: 'स्थानीय हलवाई', type: 'SHOP' },
  { key: 'bijli', name: 'Electric Shop', nameHi: 'बिजली की दुकान', type: 'SHOP' },
  { key: 'kapda', name: 'Cloth Store', nameHi: 'कपड़े की दुकान', type: 'SHOP' },
  { key: 'hardware', name: 'Hardware Store', nameHi: 'हार्डवेयर स्टोर', type: 'SHOP' },
] as const;

export interface ItemSeed {
  root: string;
  sup?: string;
  name: string;
  hi: string;
  unit: string;
  uv: number;
  mrp: string;
  price: string;
  stock: number;
  kw: string;
  max?: number;
}
const I = (root: string, sup: string | undefined, name: string, hi: string, unit: string, uv: number, mrp: string, price: string, kw: string, stock = 30, max = 10): ItemSeed => ({ root, sup, name, hi, unit, uv, mrp, price, stock, kw, max });

export const V2_ITEMS: ItemSeed[] = [
  // फ़ास्ट फ़ूड
  I('fast-food', 'halwai', 'Samosa (2 pcs)', 'समोसा (2 पीस)', 'plate', 1, '20.00', '20.00', 'samosa samose nashta', 40),
  I('fast-food', 'halwai', 'Kachori (2 pcs)', 'कचौड़ी (2 पीस)', 'plate', 1, '25.00', '25.00', 'kachori kachauri nashta', 30),
  I('fast-food', 'halwai', 'Veg Chowmein', 'चाउमीन', 'plate', 1, '50.00', '40.00', 'chowmein chaumin noodles', 30),
  I('fast-food', 'halwai', 'Aloo Tikki Chaat', 'आलू टिक्की चाट', 'plate', 1, '35.00', '30.00', 'tikki chaat aloo tikki', 30),
  I('fast-food', 'halwai', 'Mixed Pakode', 'मिक्स पकौड़े', 'g', 250, '60.00', '50.00', 'pakode pakora bhajiya', 20),
  I('fast-food', 'halwai', 'Bread Pakoda', 'ब्रेड पकौड़ा', 'piece', 1, '15.00', '15.00', 'bread pakoda pakora', 30),
  I('fast-food', 'halwai', 'Veg Momos', 'वेज मोमोज़', 'plate', 1, '50.00', '50.00', 'momos momo', 25),
  I('fast-food', 'halwai', 'Veg Burger', 'वेज बर्गर', 'piece', 1, '45.00', '40.00', 'burger', 20),
  // मिठाई
  I('mithai', 'halwai', 'Besan Laddoo', 'बेसन के लड्डू', 'g', 250, '100.00', '90.00', 'laddoo laddu ladoo besan mithai', 20),
  I('mithai', 'halwai', 'Khoya Peda', 'खोया पेड़ा', 'g', 250, '120.00', '110.00', 'peda pera khoya mithai', 20),
  I('mithai', 'halwai', 'Kaju Barfi', 'काजू बर्फ़ी', 'g', 250, '250.00', '230.00', 'barfi burfi kaju katli mithai', 15),
  I('mithai', 'halwai', 'Rasgulla', 'रसगुल्ला', 'g', 500, '130.00', '120.00', 'rasgulla rasgola mithai', 20),
  I('mithai', 'halwai', 'Gulab Jamun', 'गुलाब जामुन', 'g', 500, '130.00', '120.00', 'gulab jamun mithai', 20),
  I('mithai', 'halwai', 'Jalebi', 'जलेबी', 'g', 250, '70.00', '60.00', 'jalebi jilebi mithai', 20),
  I('mithai', 'halwai', 'Soan Papdi', 'सोन पापड़ी', 'g', 250, '80.00', '70.00', 'soan papdi son papri mithai', 25),
  I('mithai', 'halwai', 'Imarti', 'इमरती', 'g', 250, '70.00', '60.00', 'imarti amriti mithai', 15),
  // बिजली का सामान
  I('electronics', 'bijli', 'LED Bulb 9W', 'एलईडी बल्ब 9 वॉट', 'piece', 1, '120.00', '90.00', 'bulb led light batti', 40),
  I('electronics', 'bijli', 'LED Tube Light 20W', 'एलईडी ट्यूबलाइट 20 वॉट', 'piece', 1, '299.00', '220.00', 'tubelight tube light led', 20),
  I('electronics', 'bijli', 'Extension Board (4 socket)', 'एक्सटेंशन बोर्ड (4 सॉकेट)', 'piece', 1, '320.00', '250.00', 'extension board socket', 15),
  I('electronics', 'bijli', 'Rechargeable Torch', 'चार्ज वाली टॉर्च', 'piece', 1, '299.00', '250.00', 'torch tarch light rechargeable', 15),
  I('electronics', 'bijli', 'Mobile Charger (Type-C)', 'मोबाइल चार्जर (टाइप-C)', 'piece', 1, '249.00', '199.00', 'charger mobile type c', 20),
  I('electronics', 'bijli', 'Earphones', 'ईयरफ़ोन', 'piece', 1, '199.00', '149.00', 'earphone headphone', 20),
  I('electronics', 'bijli', 'AA Battery (pack of 4)', 'बैटरी AA (4 का पैक)', 'pack', 1, '90.00', '80.00', 'battery cell aa', 30),
  I('electronics', 'bijli', 'Table Fan', 'टेबल पंखा', 'piece', 1, '1650.00', '1450.00', 'table fan pankha', 5, 2),
  I('electronics', 'bijli', 'Electric Iron (Press)', 'बिजली प्रेस', 'piece', 1, '750.00', '650.00', 'iron press istri', 5, 2),
  // सौंदर्य व देखभाल
  I('beauty', 'verma', 'Coconut Hair Oil', 'नारियल का तेल (बालों के लिए)', 'ml', 200, '100.00', '90.00', 'coconut oil nariyal tel hair', 30),
  I('beauty', 'verma', 'Cold Cream', 'कोल्ड क्रीम', 'ml', 100, '130.00', '120.00', 'cream cold cream face', 20),
  I('beauty', 'verma', 'Talcum Powder', 'टैल्कम पाउडर', 'g', 100, '120.00', '110.00', 'powder talc', 20),
  I('beauty', 'verma', 'Kajal', 'काजल', 'piece', 1, '90.00', '80.00', 'kajal kajol', 20),
  I('beauty', 'verma', 'Mehendi Cone (pack of 4)', 'मेहंदी कोन (4 का पैक)', 'pack', 1, '60.00', '50.00', 'mehndi mehendi henna cone', 20),
  I('beauty', 'verma', 'Sindoor', 'सिंदूर', 'piece', 1, '35.00', '30.00', 'sindoor sindur', 20),
  I('beauty', 'verma', 'Bindi Packet', 'बिंदी पैकेट', 'pack', 1, '20.00', '20.00', 'bindi', 30),
  I('beauty', 'verma', 'Shaving Cream', 'शेविंग क्रीम', 'g', 70, '80.00', '70.00', 'shaving cream dadhi', 20),
  I('beauty', 'verma', 'Comb', 'कंघी', 'piece', 1, '30.00', '25.00', 'comb kanghi', 30),
  // कपड़े
  I('kapde', 'kapda', 'Cotton Gamchha', 'सूती गमछा', 'piece', 1, '100.00', '80.00', 'gamchha gamcha towel', 30),
  I('kapde', 'kapda', 'Lungi', 'लुंगी', 'piece', 1, '220.00', '180.00', 'lungi', 20),
  I('kapde', 'kapda', "Men's Vest (Baniyan)", 'बनियान', 'piece', 1, '140.00', '120.00', 'baniyan vest banyan', 30),
  I('kapde', 'kapda', 'Bath Towel', 'नहाने का तौलिया', 'piece', 1, '220.00', '180.00', 'towel tauliya', 20),
  I('kapde', 'kapda', 'Double Bedsheet', 'डबल चादर', 'piece', 1, '550.00', '450.00', 'bedsheet chadar chaddar', 15),
  I('kapde', 'kapda', 'Cotton Saree', 'सूती साड़ी', 'piece', 1, '650.00', '550.00', 'saree sari', 10),
  I('kapde', 'kapda', "Men's Cotton Shirt", 'पुरुषों की सूती शर्ट', 'piece', 1, '550.00', '450.00', 'shirt kameez', 10),
  I('kapde', 'kapda', 'Track Pant', 'लोअर (ट्रैक पैंट)', 'piece', 1, '350.00', '299.00', 'lower track pant pajama', 15),
  I('kapde', 'kapda', 'Socks (3 pairs)', 'मोज़े (3 जोड़ी)', 'pack', 1, '120.00', '99.00', 'socks moze moja', 20),
  I('kapde', 'kapda', 'Woollen Shawl', 'ऊनी शॉल', 'piece', 1, '450.00', '350.00', 'shawl shal woollen', 10),
  // जूते-चप्पल
  I('joote-chappal', 'kapda', 'Hawai Chappal', 'हवाई चप्पल', 'pair', 1, '140.00', '120.00', 'chappal hawai slipper', 30),
  I('joote-chappal', 'kapda', "Men's Sandal", 'पुरुषों की सैंडल', 'pair', 1, '420.00', '350.00', 'sandal chappal', 15),
  I('joote-chappal', 'kapda', "Women's Sandal", 'महिलाओं की सैंडल', 'pair', 1, '360.00', '300.00', 'sandal ladies chappal', 15),
  I('joote-chappal', 'kapda', 'School Shoes', 'स्कूल के जूते', 'pair', 1, '550.00', '450.00', 'school shoes joote', 15),
  I('joote-chappal', 'kapda', 'Gumboot', 'गमबूट', 'pair', 1, '550.00', '450.00', 'gumboot rain boot', 10),
  I('joote-chappal', 'kapda', 'Sports Shoes', 'स्पोर्ट्स जूते', 'pair', 1, '850.00', '699.00', 'sports shoes running joote', 10),
  // खेती-किसानी (औज़ार — लाइसेंस नहीं चाहिए)
  I('kheti', 'hardware', 'Khurpi', 'खुरपी', 'piece', 1, '100.00', '80.00', 'khurpi khurpa weeder', 20),
  I('kheti', 'hardware', 'Phawda (Spade)', 'फावड़ा', 'piece', 1, '520.00', '450.00', 'phawda fawda spade', 10),
  I('kheti', 'hardware', 'Hasiya (Sickle)', 'हँसिया', 'piece', 1, '140.00', '120.00', 'hasiya hasua sickle', 20),
  I('kheti', 'hardware', 'Manual Sprayer Pump 16L', 'स्प्रे पंप 16 लीटर', 'piece', 1, '1800.00', '1600.00', 'spray pump sprayer machine', 5, 2),
  I('kheti', 'hardware', 'Garden Pipe 1 inch (per metre)', 'पाइप 1 इंच (प्रति मीटर)', 'metre', 1, '30.00', '25.00', 'pipe paip hose', 200, 100),
  I('kheti', 'hardware', 'Tarpaulin 12x15 ft', 'तिरपाल 12x15 फ़ुट', 'piece', 1, '900.00', '750.00', 'tirpal tarpaulin', 10),
  I('kheti', 'hardware', 'Rope 20 metre', 'रस्सी 20 मीटर', 'piece', 1, '180.00', '150.00', 'rassi rope', 15),
  I('kheti', 'hardware', 'Jute Bag (Bori)', 'बोरी', 'piece', 1, '35.00', '30.00', 'bori bora jute bag', 100, 50),
  // बिल्डिंग मटेरियल
  I('building-material', 'hardware', 'Cement 50 kg bag', 'सीमेंट (50 किलो बोरी)', 'bag', 1, '430.00', '400.00', 'cement siment', 50, 50),
  I('building-material', 'hardware', 'TMT Sariya (per kg)', 'सरिया (प्रति किलो)', 'kg', 1, '78.00', '70.00', 'sariya saria tmt rod', 500, 500),
  I('building-material', 'hardware', 'Bricks (100 pcs)', 'ईंट (100 नग)', 'pack', 1, '950.00', '850.00', 'eent int bricks', 50, 100),
  I('building-material', 'hardware', 'PVC Pipe 4 inch (10 ft)', 'पीवीसी पाइप 4 इंच (10 फ़ुट)', 'piece', 1, '750.00', '650.00', 'pvc pipe', 10),
  I('building-material', 'hardware', 'Wall Putty 20 kg', 'वॉल पुट्टी 20 किलो', 'bag', 1, '800.00', '700.00', 'putty wall', 10),
  I('building-material', 'hardware', 'Distemper 10 kg', 'डिस्टेंपर 10 किलो', 'bag', 1, '1100.00', '950.00', 'paint distemper rang', 10),
  I('building-material', 'hardware', 'Brass Tap', 'पीतल की टोंटी', 'piece', 1, '300.00', '250.00', 'tap tonti nal', 15),
  // दवाइयाँ (PHARMACY — vertical OFF until the drug licence; stays hidden)
  I('dawai', 'verma', 'Digital Thermometer', 'डिजिटल थर्मामीटर', 'piece', 1, '180.00', '150.00', 'thermometer bukhar', 10, 2),
  I('dawai', 'verma', 'Antiseptic Liquid', 'एंटीसेप्टिक लिक्विड', 'ml', 125, '70.00', '60.00', 'antiseptic dettol', 10),
];

export interface ServiceSeedV2 {
  root: string;
  name: string;
  hi: string;
  visiting: string;
  price: string;
  duration: number;
  quote: boolean;
  kw: string;
  note: string;
}
export const V2_SERVICES: ServiceSeedV2[] = [
  // बॉडी चेकअप
  { root: 'body-checkup', name: 'Blood Sugar Test at Home', hi: 'घर पर शुगर जाँच', visiting: '0.00', price: '100.00', duration: 20, quote: false, kw: 'sugar test diabetes madhumeh', note: 'खाली पेट जाँच हो तो सुबह का समय चुनें।' },
  { root: 'body-checkup', name: 'BP Check at Home', hi: 'घर पर बीपी जाँच', visiting: '0.00', price: '50.00', duration: 15, quote: false, kw: 'bp blood pressure', note: 'पुरानी पर्ची हो तो पास रखें।' },
  { root: 'body-checkup', name: 'Blood Test (CBC) Sample Pickup', hi: 'खून की जाँच (CBC) — सैंपल घर से', visiting: '50.00', price: '300.00', duration: 20, quote: false, kw: 'cbc blood test khoon jaanch', note: 'रिपोर्ट जाँच केंद्र से 24 घंटे में।' },
  { root: 'body-checkup', name: 'Thyroid Test Sample Pickup', hi: 'थायरॉइड जाँच — सैंपल घर से', visiting: '50.00', price: '400.00', duration: 20, quote: false, kw: 'thyroid test', note: 'रिपोर्ट जाँच केंद्र से 24–48 घंटे में।' },
  { root: 'body-checkup', name: 'Full Body Check-up Sample Pickup', hi: 'पूरे शरीर की जाँच — सैंपल घर से', visiting: '0.00', price: '999.00', duration: 30, quote: false, kw: 'full body checkup health', note: '10–12 घंटे खाली पेट ज़रूरी। कौन-कौन सी जाँचें होंगी, बुकिंग के बाद फ़ोन पर बताया जाएगा।' },
  // डॉक्टर
  { root: 'doctor', name: 'Doctor Appointment (Clinic)', hi: 'डॉक्टर से मिलने का समय (क्लिनिक)', visiting: '0.00', price: '200.00', duration: 30, quote: false, kw: 'doctor daktar appointment clinic', note: 'डॉक्टर की फ़ीस इसी में है। दवा का ख़र्च अलग।' },
  { root: 'doctor', name: 'Doctor Home Visit', hi: 'डॉक्टर घर पर', visiting: '100.00', price: '400.00', duration: 45, quote: false, kw: 'doctor home visit daktar ghar', note: 'बुज़ुर्ग या चलने में दिक्कत वाले मरीज़ों के लिए। आपात स्थिति में 108 पर कॉल करें।' },
  { root: 'doctor', name: 'Phone Consultation', hi: 'फ़ोन पर डॉक्टर से बात', visiting: '0.00', price: '150.00', duration: 15, quote: false, kw: 'doctor phone consultation salah', note: 'तय समय पर डॉक्टर आपको फ़ोन करेंगे।' },
  { root: 'doctor', name: 'Nurse Visit (Dressing / Injection)', hi: 'नर्स घर पर (पट्टी / इंजेक्शन)', visiting: '50.00', price: '150.00', duration: 30, quote: false, kw: 'nurse dressing injection patti', note: 'इंजेक्शन सिर्फ़ डॉक्टर की पर्ची पर।' },
  // भाड़ा गाड़ी
  { root: 'bhada-gadi', name: 'Tractor Trolley (per trip)', hi: 'ट्रैक्टर-ट्रॉली (एक फेरा)', visiting: '0.00', price: '0.00', duration: 120, quote: true, kw: 'tractor trolley bhada', note: 'किराया दूरी और सामान देखकर तय होगा।' },
  { root: 'bhada-gadi', name: 'Pickup / Chhota Hathi (per trip)', hi: 'पिकअप / छोटा हाथी (एक फेरा)', visiting: '0.00', price: '0.00', duration: 90, quote: true, kw: 'pickup chhota hathi tempo bhada', note: 'किराया दूरी देखकर तय होगा।' },
  { root: 'bhada-gadi', name: 'E-Rickshaw Booking', hi: 'ई-रिक्शा बुकिंग', visiting: '0.00', price: '0.00', duration: 60, quote: true, kw: 'e rickshaw erickshaw tempo', note: 'सवारी या हल्का सामान — किराया दूरी से।' },
  { root: 'bhada-gadi', name: 'Car / Bolero (per day)', hi: 'कार / बोलेरो (एक दिन)', visiting: '0.00', price: '0.00', duration: 480, quote: true, kw: 'car bolero gadi booking shaadi', note: 'शादी, अस्पताल या बाहर जाने के लिए — डीज़ल/किलोमीटर से किराया तय।' },
  { root: 'bhada-gadi', name: 'JCB (per hour)', hi: 'जेसीबी (प्रति घंटा)', visiting: '0.00', price: '0.00', duration: 60, quote: true, kw: 'jcb khudai', note: 'खुदाई/मिट्टी का काम — घंटे के हिसाब से।' },
];
