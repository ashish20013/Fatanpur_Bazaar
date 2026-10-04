/**
 * Launch catalog: 14 categories, 4 suppliers, 80 products + 8 services, 60 search synonyms.
 * Prices are realistic Sept-2026 rural UP retail estimates — the owner edits them in /admin/products.
 */
export const SUPPLIERS = [
  { key: 'sharma', name: 'Sharma Kirana', nameHi: 'शर्मा किराना', type: 'SHOP' },
  { key: 'mandi', name: 'Fatanpur Mandi', nameHi: 'फतनपुर मंडी', type: 'MANDI' },
  { key: 'verma', name: 'Verma Store', nameHi: 'वर्मा स्टोर', type: 'SHOP' },
  { key: 'farmer', name: 'Local Farmer', nameHi: 'स्थानीय किसान', type: 'FARMER' },
] as const;
export type SupplierKey = (typeof SUPPLIERS)[number]['key'];

export const CATEGORIES = [
  { key: 'sabzi', name: 'Vegetables', nameHi: 'सब्ज़ी', slug: 'sabziyan', vertical: 'VEGETABLES', itemType: 'PRODUCT', icon: '🥔' },
  { key: 'hari', name: 'Leafy Greens', nameHi: 'हरी सब्ज़ी', slug: 'hari-sabzi', vertical: 'VEGETABLES', itemType: 'PRODUCT', icon: '🥬' },
  { key: 'phal', name: 'Fruits', nameHi: 'फल', slug: 'fal', vertical: 'FRUITS', itemType: 'PRODUCT', icon: '🍌' },
  { key: 'atta', name: 'Atta, Rice & Dal', nameHi: 'आटा-दाल', slug: 'aata-dal', vertical: 'GROCERY', itemType: 'PRODUCT', icon: '🌾' },
  { key: 'tel', name: 'Oil & Spices', nameHi: 'तेल-मसाला', slug: 'tel-masala', vertical: 'GROCERY', itemType: 'PRODUCT', icon: '🫙' },
  { key: 'chai', name: 'Tea & Sugar', nameHi: 'चाय-चीनी', slug: 'chai-cheeni', vertical: 'GROCERY', itemType: 'PRODUCT', icon: '☕' },
  { key: 'sabun', name: 'Soap & Detergent', nameHi: 'साबुन-डिटर्जेंट', slug: 'sabun-detergent', vertical: 'GROCERY', itemType: 'PRODUCT', icon: '🧼' },
  { key: 'biscuit', name: 'Biscuits & Namkeen', nameHi: 'बिस्किट-नमकीन', slug: 'biscuit-namkeen', vertical: 'GROCERY', itemType: 'PRODUCT', icon: '🍪' },
  { key: 'doodh', name: 'Milk & Dairy', nameHi: 'दूध-डेयरी', slug: 'doodh-dairy', vertical: 'GROCERY', itemType: 'PRODUCT', icon: '🥛' },
  { key: 'dawai', name: 'Medicines', nameHi: 'दवाई', slug: 'dawaiyan', vertical: 'PHARMACY', itemType: 'PRODUCT', icon: '💊' },
  { key: 'khad', name: 'Seeds & Fertiliser', nameHi: 'खाद-बीज', slug: 'khad-beej', vertical: 'AGRI_INPUT', itemType: 'PRODUCT', icon: '🌱' },
  { key: 'marammat', name: 'Home Repair', nameHi: 'घर की मरम्मत', slug: 'ghar-marammat', vertical: 'SERVICE', itemType: 'SERVICE', icon: '🔧' },
  { key: 'gas', name: 'Gas & Appliances', nameHi: 'गैस-अप्लायंस', slug: 'gas-appliance', vertical: 'SERVICE', itemType: 'SERVICE', icon: '🔥' },
  { key: 'dastavez', name: 'Documents Help', nameHi: 'दस्तावेज़', slug: 'dastavez-sahayata', vertical: 'SERVICE', itemType: 'SERVICE', icon: '📄' },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]['key'];

export interface ProductSeed {
  cat: CategoryKey;
  sup: SupplierKey;
  name: string;
  hi: string;
  unit: string;
  uv: number;
  mrp: string;
  price: string;
  stock: number;
  kw: string;
  weighted?: boolean;
  featured?: boolean;
  brand?: string;
  rx?: boolean;
  regulated?: boolean;
  max?: number;
  desc?: string;
}
const V = (name: string, hi: string, mrp: string, price: string, kw: string, extra: Partial<ProductSeed> = {}): ProductSeed => ({ cat: 'sabzi', sup: 'mandi', name, hi, unit: 'kg', uv: 1, mrp, price, stock: 80, kw, weighted: true, max: 20, ...extra });

export const PRODUCTS: ProductSeed[] = [
  // ── सब्ज़ी (16) ──
  V('Aloo (Potato)', 'आलू', '30.00', '25.00', 'aloo alu aalu potato batata', { featured: true, stock: 200 }),
  V('Pyaz (Onion)', 'प्याज़', '45.00', '38.00', 'pyaz pyaaz piyaz onion kanda', { featured: true, stock: 150 }),
  V('Tamatar (Tomato)', 'टमाटर', '40.00', '32.00', 'tamatar tamater tomato', { featured: true, stock: 100 }),
  V('Lauki (Bottle Gourd)', 'लौकी', '30.00', '24.00', 'lauki louki ghiya bottle gourd dudhi', { unit: 'piece', weighted: false, stock: 60 }),
  V('Bhindi (Lady Finger)', 'भिंडी', '60.00', '48.00', 'bhindi bhindee okra ladyfinger', { unit: 'g', uv: 500 }),
  V('Baingan (Brinjal)', 'बैंगन', '40.00', '32.00', 'baingan bengan brinjal eggplant', { unit: 'g', uv: 500 }),
  V('Gobhi (Cauliflower)', 'फूल गोभी', '40.00', '35.00', 'gobhi gobi phool gobhi cauliflower', { unit: 'piece', weighted: false }),
  V('Patta Gobhi (Cabbage)', 'पत्ता गोभी', '30.00', '25.00', 'patta gobhi band gobhi cabbage', { unit: 'piece', weighted: false }),
  V('Hari Mirch (Green Chilli)', 'हरी मिर्च', '20.00', '15.00', 'hari mirch mirchi green chilli', { unit: 'g', uv: 250, featured: true }),
  V('Adrak (Ginger)', 'अदरक', '40.00', '35.00', 'adrak adrakh ginger', { unit: 'g', uv: 250 }),
  V('Lahsun (Garlic)', 'लहसुन', '60.00', '50.00', 'lahsun lehsun garlic', { unit: 'g', uv: 250 }),
  V('Kheera (Cucumber)', 'खीरा', '40.00', '30.00', 'kheera khira cucumber', {}),
  V('Gajar (Carrot)', 'गाजर', '50.00', '40.00', 'gajar gajjar carrot', {}),
  V('Karela (Bitter Gourd)', 'करेला', '35.00', '28.00', 'karela karaila bitter gourd', { unit: 'g', uv: 500 }),
  V('Nimbu (Lemon)', 'नींबू', '30.00', '25.00', 'nimbu neembu lemon', { unit: 'piece', uv: 6, weighted: false }),
  V('Kaddu (Pumpkin)', 'कद्दू', '30.00', '25.00', 'kaddu kadu pumpkin sitaphal', {}),
  // ── हरी सब्ज़ी (8) ──
  V('Palak (Spinach)', 'पालक', '20.00', '15.00', 'palak palag spinach saag', { cat: 'hari', sup: 'farmer', unit: 'bundle', weighted: false }),
  V('Dhaniya (Coriander)', 'धनिया', '15.00', '10.00', 'dhaniya dhania coriander hara dhaniya', { cat: 'hari', sup: 'farmer', unit: 'bundle', weighted: false, featured: true }),
  V('Methi (Fenugreek)', 'मेथी', '20.00', '15.00', 'methi methee fenugreek', { cat: 'hari', sup: 'farmer', unit: 'bundle', weighted: false }),
  V('Pudina (Mint)', 'पुदीना', '15.00', '10.00', 'pudina podina mint', { cat: 'hari', sup: 'farmer', unit: 'bundle', weighted: false }),
  V('Sarson Saag', 'सरसों का साग', '25.00', '20.00', 'sarson saag mustard greens', { cat: 'hari', sup: 'farmer', unit: 'bundle', weighted: false }),
  V('Bathua', 'बथुआ', '20.00', '15.00', 'bathua bathuwa', { cat: 'hari', sup: 'farmer', unit: 'bundle', weighted: false }),
  V('Hara Pyaz (Spring Onion)', 'हरा प्याज़', '20.00', '15.00', 'hara pyaz spring onion', { cat: 'hari', sup: 'farmer', unit: 'bundle', weighted: false }),
  V('Mooli (Radish)', 'मूली', '30.00', '25.00', 'mooli muli radish', { cat: 'hari', sup: 'farmer' }),
  // ── फल (12) ──
  V('Kela (Banana)', 'केला', '60.00', '50.00', 'kela kelaa banana', { cat: 'phal', unit: 'dozen', weighted: false, featured: true }),
  V('Seb (Apple)', 'सेब', '160.00', '140.00', 'seb sev apple', { cat: 'phal' }),
  V('Amrood (Guava)', 'अमरूद', '70.00', '60.00', 'amrood amrud guava', { cat: 'phal', sup: 'farmer' }),
  V('Papita (Papaya)', 'पपीता', '50.00', '40.00', 'papita papaya', { cat: 'phal' }),
  V('Santra (Orange)', 'संतरा', '90.00', '80.00', 'santra santara orange', { cat: 'phal' }),
  V('Mausambi (Sweet Lime)', 'मौसंबी', '90.00', '75.00', 'mausambi mosambi sweet lime', { cat: 'phal' }),
  V('Anar (Pomegranate)', 'अनार', '180.00', '160.00', 'anar anaar pomegranate', { cat: 'phal' }),
  V('Angoor (Grapes)', 'अंगूर', '120.00', '100.00', 'angoor angur grapes', { cat: 'phal', unit: 'g', uv: 500 }),
  V('Tarbooz (Watermelon)', 'तरबूज़', '30.00', '25.00', 'tarbooz tarbuj watermelon', { cat: 'phal' }),
  V('Chikoo (Sapota)', 'चीकू', '80.00', '70.00', 'chikoo chiku sapota', { cat: 'phal' }),
  V('Nashpati (Pear)', 'नाशपाती', '120.00', '100.00', 'nashpati nashpaati pear', { cat: 'phal' }),
  V('Nariyal (Coconut)', 'नारियल', '50.00', '45.00', 'nariyal nariyel coconut', { cat: 'phal', unit: 'piece', weighted: false }),
  // ── आटा-दाल (10) ──
  { cat: 'atta', sup: 'sharma', name: 'Gehun Atta (Wheat Flour)', hi: 'गेहूं का आटा', unit: 'kg', uv: 10, mrp: '420.00', price: '385.00', stock: 40, kw: 'atta aata gehun flour chakki', brand: 'Chakki Fresh', featured: true, max: 5 },
  { cat: 'atta', sup: 'sharma', name: 'Aashirvaad Atta', hi: 'आशीर्वाद आटा', unit: 'kg', uv: 5, mrp: '285.00', price: '265.00', stock: 30, kw: 'atta aata aashirvad ashirwad flour', brand: 'Aashirvaad', max: 5 },
  { cat: 'atta', sup: 'sharma', name: 'Chawal (Rice) Sona Masoori', hi: 'चावल', unit: 'kg', uv: 5, mrp: '320.00', price: '290.00', stock: 40, kw: 'chawal chaval rice', max: 5 },
  { cat: 'atta', sup: 'sharma', name: 'Basmati Chawal', hi: 'बासमती चावल', unit: 'kg', uv: 1, mrp: '140.00', price: '120.00', stock: 40, kw: 'basmati chawal rice', max: 10 },
  { cat: 'atta', sup: 'verma', name: 'Arhar Dal (Toor)', hi: 'अरहर दाल', unit: 'kg', uv: 1, mrp: '180.00', price: '165.00', stock: 50, kw: 'arhar toor tuvar dal daal', featured: true, max: 10 },
  { cat: 'atta', sup: 'verma', name: 'Moong Dal', hi: 'मूंग दाल', unit: 'kg', uv: 1, mrp: '150.00', price: '135.00', stock: 40, kw: 'moong mung dal daal', max: 10 },
  { cat: 'atta', sup: 'verma', name: 'Masoor Dal', hi: 'मसूर दाल', unit: 'kg', uv: 1, mrp: '120.00', price: '105.00', stock: 40, kw: 'masoor masur dal daal', max: 10 },
  { cat: 'atta', sup: 'verma', name: 'Chana Dal', hi: 'चना दाल', unit: 'kg', uv: 1, mrp: '110.00', price: '95.00', stock: 40, kw: 'chana chane dal daal', max: 10 },
  { cat: 'atta', sup: 'verma', name: 'Besan (Gram Flour)', hi: 'बेसन', unit: 'g', uv: 500, mrp: '65.00', price: '58.00', stock: 40, kw: 'besan besen gram flour', max: 10 },
  { cat: 'atta', sup: 'sharma', name: 'Sooji (Semolina)', hi: 'सूजी', unit: 'g', uv: 500, mrp: '35.00', price: '30.00', stock: 40, kw: 'sooji suji rava semolina', max: 10 },
  // ── तेल-मसाला (8) ──
  { cat: 'tel', sup: 'sharma', name: 'Sarson Tel (Mustard Oil)', hi: 'सरसों का तेल', unit: 'l', uv: 1, mrp: '185.00', price: '170.00', stock: 40, kw: 'sarson tel mustard oil kachi ghani', brand: 'Fortune', featured: true, max: 10 },
  { cat: 'tel', sup: 'sharma', name: 'Refined Oil (Soyabean)', hi: 'रिफाइंड तेल', unit: 'l', uv: 1, mrp: '150.00', price: '138.00', stock: 30, kw: 'refined oil soyabean tel', brand: 'Fortune', max: 10 },
  { cat: 'tel', sup: 'sharma', name: 'Desi Ghee', hi: 'देसी घी', unit: 'l', uv: 1, mrp: '650.00', price: '610.00', stock: 15, kw: 'ghee ghi desi ghee', brand: 'Amul', max: 5 },
  { cat: 'tel', sup: 'verma', name: 'Haldi Powder (Turmeric)', hi: 'हल्दी पाउडर', unit: 'g', uv: 200, mrp: '60.00', price: '52.00', stock: 50, kw: 'haldi haldee turmeric masala', max: 10 },
  { cat: 'tel', sup: 'verma', name: 'Lal Mirch Powder (Red Chilli)', hi: 'लाल मिर्च पाउडर', unit: 'g', uv: 200, mrp: '70.00', price: '62.00', stock: 50, kw: 'lal mirch red chilli masala', max: 10 },
  { cat: 'tel', sup: 'verma', name: 'Dhaniya Powder (Coriander)', hi: 'धनिया पाउडर', unit: 'g', uv: 200, mrp: '50.00', price: '44.00', stock: 50, kw: 'dhaniya powder coriander masala', max: 10 },
  { cat: 'tel', sup: 'verma', name: 'Garam Masala', hi: 'गरम मसाला', unit: 'g', uv: 100, mrp: '75.00', price: '68.00', stock: 40, kw: 'garam masala', brand: 'MDH', max: 10 },
  { cat: 'tel', sup: 'sharma', name: 'Namak (Iodised Salt)', hi: 'नमक', unit: 'kg', uv: 1, mrp: '28.00', price: '25.00', stock: 80, kw: 'namak namak salt', brand: 'Tata', max: 10 },
  // ── चाय-चीनी (5) ──
  { cat: 'chai', sup: 'sharma', name: 'Cheeni (Sugar)', hi: 'चीनी', unit: 'kg', uv: 1, mrp: '48.00', price: '44.00', stock: 100, kw: 'cheeni chini shakkar sugar', featured: true, max: 10 },
  { cat: 'chai', sup: 'sharma', name: 'Chai Patti (Tea)', hi: 'चाय पत्ती', unit: 'g', uv: 250, mrp: '140.00', price: '128.00', stock: 40, kw: 'chai patti chaypatti tea', brand: 'Tata Tea', max: 10 },
  { cat: 'chai', sup: 'sharma', name: 'Gud (Jaggery)', hi: 'गुड़', unit: 'kg', uv: 1, mrp: '70.00', price: '60.00', stock: 40, kw: 'gud gur jaggery', max: 10 },
  { cat: 'chai', sup: 'sharma', name: 'Coffee Sachet', hi: 'कॉफ़ी', unit: 'pack', uv: 10, mrp: '50.00', price: '45.00', stock: 30, kw: 'coffee kofi', brand: 'Nescafe', max: 10 },
  { cat: 'chai', sup: 'sharma', name: 'Misri (Rock Sugar)', hi: 'मिश्री', unit: 'g', uv: 250, mrp: '45.00', price: '40.00', stock: 30, kw: 'misri mishri rock sugar', max: 10 },
  // ── साबुन-डिटर्जेंट (6) ──
  { cat: 'sabun', sup: 'verma', name: 'Nahane ka Sabun (Bath Soap)', hi: 'नहाने का साबुन', unit: 'pack', uv: 4, mrp: '160.00', price: '145.00', stock: 40, kw: 'sabun saboon soap nahane', brand: 'Lifebuoy', max: 10 },
  { cat: 'sabun', sup: 'verma', name: 'Kapde Dhone ka Powder', hi: 'कपड़े धोने का पाउडर', unit: 'kg', uv: 1, mrp: '120.00', price: '108.00', stock: 40, kw: 'detergent surf powder kapde', brand: 'Wheel', max: 10 },
  { cat: 'sabun', sup: 'verma', name: 'Bartan Bar (Dishwash)', hi: 'बर्तन साबुन', unit: 'piece', uv: 1, mrp: '30.00', price: '27.00', stock: 60, kw: 'bartan vim dishwash', brand: 'Vim', max: 10 },
  { cat: 'sabun', sup: 'verma', name: 'Toothpaste', hi: 'टूथपेस्ट', unit: 'g', uv: 150, mrp: '110.00', price: '98.00', stock: 40, kw: 'toothpaste manjan', brand: 'Colgate', max: 10 },
  { cat: 'sabun', sup: 'verma', name: 'Shampoo Sachet', hi: 'शैम्पू', unit: 'pack', uv: 16, mrp: '32.00', price: '30.00', stock: 40, kw: 'shampoo sampoo', brand: 'Clinic Plus', max: 10 },
  { cat: 'sabun', sup: 'verma', name: 'Phenyl (Floor Cleaner)', hi: 'फिनाइल', unit: 'l', uv: 1, mrp: '90.00', price: '80.00', stock: 30, kw: 'phenyl phinail floor cleaner', max: 10 },
  // ── बिस्किट-नमकीन (6) ──
  { cat: 'biscuit', sup: 'sharma', name: 'Parle-G Biscuit', hi: 'पारले-जी बिस्किट', unit: 'pack', uv: 1, mrp: '10.00', price: '10.00', stock: 200, kw: 'biscuit biskut parle', brand: 'Parle', max: 30 },
  { cat: 'biscuit', sup: 'sharma', name: 'Marie Biscuit', hi: 'मैरी बिस्किट', unit: 'pack', uv: 1, mrp: '30.00', price: '28.00', stock: 60, kw: 'marie biscuit', brand: 'Britannia', max: 20 },
  { cat: 'biscuit', sup: 'sharma', name: 'Aloo Bhujia', hi: 'आलू भुजिया', unit: 'g', uv: 200, mrp: '55.00', price: '50.00', stock: 50, kw: 'bhujia namkeen aloo bhujia', brand: 'Haldiram', max: 10 },
  { cat: 'biscuit', sup: 'sharma', name: 'Mixture Namkeen', hi: 'नमकीन मिक्सचर', unit: 'g', uv: 200, mrp: '50.00', price: '45.00', stock: 50, kw: 'namkeen mixture', max: 10 },
  { cat: 'biscuit', sup: 'sharma', name: 'Rusk (Toast)', hi: 'रस्क', unit: 'g', uv: 300, mrp: '45.00', price: '40.00', stock: 40, kw: 'rusk toast', max: 10 },
  { cat: 'biscuit', sup: 'sharma', name: 'Chips', hi: 'चिप्स', unit: 'pack', uv: 1, mrp: '20.00', price: '20.00', stock: 60, kw: 'chips wafers', brand: "Lay's", max: 20 },
  // ── दूध-डेयरी (4) ──
  { cat: 'doodh', sup: 'farmer', name: 'Doodh (Milk)', hi: 'दूध', unit: 'l', uv: 1, mrp: '60.00', price: '56.00', stock: 40, kw: 'doodh dudh milk', featured: true, max: 10 },
  { cat: 'doodh', sup: 'farmer', name: 'Dahi (Curd)', hi: 'दही', unit: 'g', uv: 500, mrp: '40.00', price: '36.00', stock: 30, kw: 'dahi dahee curd yogurt', max: 10 },
  { cat: 'doodh', sup: 'farmer', name: 'Paneer', hi: 'पनीर', unit: 'g', uv: 250, mrp: '100.00', price: '90.00', stock: 20, kw: 'paneer panir cottage cheese', max: 10 },
  { cat: 'doodh', sup: 'sharma', name: 'Makhan (Butter)', hi: 'मक्खन', unit: 'g', uv: 100, mrp: '60.00', price: '57.00', stock: 20, kw: 'makhan butter', brand: 'Amul', max: 10 },
  // ── दवाई (3) — vertical OFF until the drug licence ──
  { cat: 'dawai', sup: 'verma', name: 'ORS Powder', hi: 'ओआरएस घोल', unit: 'pack', uv: 1, mrp: '22.00', price: '20.00', stock: 50, kw: 'ors electral dawai', max: 10 },
  { cat: 'dawai', sup: 'verma', name: 'Crepe Bandage', hi: 'पट्टी (बैंडेज)', unit: 'piece', uv: 1, mrp: '60.00', price: '55.00', stock: 20, kw: 'bandage patti', max: 5 },
  { cat: 'dawai', sup: 'verma', name: 'Amoxicillin 500 (Rx)', hi: 'एमोक्सिसिलिन 500', unit: 'pack', uv: 10, mrp: '95.00', price: '90.00', stock: 20, kw: 'amoxicillin antibiotic dawai', rx: true, regulated: true, max: 2 },
  // ── खाद-बीज (2) — vertical OFF until the fertiliser licence ──
  { cat: 'khad', sup: 'sharma', name: 'Gehun Beej (Wheat Seed)', hi: 'गेहूं का बीज', unit: 'kg', uv: 40, mrp: '1600.00', price: '1520.00', stock: 10, kw: 'beej seed gehun wheat', regulated: true, max: 5 },
  { cat: 'khad', sup: 'sharma', name: 'Vermicompost (Organic Khad)', hi: 'केंचुआ खाद', unit: 'kg', uv: 5, mrp: '150.00', price: '130.00', stock: 20, kw: 'khad compost vermicompost organic', max: 10 },
];

export interface ServiceSeed {
  cat: CategoryKey;
  name: string;
  hi: string;
  visiting: string;
  price: string;
  duration: number;
  quote: boolean;
  kw: string;
  note: string;
}
export const SERVICES: ServiceSeed[] = [
  { cat: 'marammat', name: 'Electrician Visit', hi: 'बिजली मिस्त्री', visiting: '99.00', price: '0.00', duration: 60, quote: true, kw: 'electrician bijli mistri wiring', note: 'काम देखकर रेट तय होगा; विज़िटिंग चार्ज अलग।' },
  { cat: 'marammat', name: 'Plumber Visit', hi: 'प्लंबर', visiting: '99.00', price: '0.00', duration: 60, quote: true, kw: 'plumber nal pipe leakage', note: 'नल, पाइप, टंकी की मरम्मत।' },
  { cat: 'marammat', name: 'Fan Repair', hi: 'पंखा मरम्मत', visiting: '79.00', price: '150.00', duration: 45, quote: false, kw: 'fan pankha repair', note: 'पुर्ज़े का दाम अलग।' },
  { cat: 'marammat', name: 'RO / Water Purifier Service', hi: 'आरओ सर्विस', visiting: '99.00', price: '349.00', duration: 60, quote: false, kw: 'ro water purifier service', note: 'फ़िल्टर बदलने का दाम अलग।' },
  { cat: 'gas', name: 'Gas Stove Repair', hi: 'गैस चूल्हा मरम्मत', visiting: '79.00', price: '199.00', duration: 45, quote: false, kw: 'gas chulha stove repair', note: 'बर्नर सफ़ाई और नॉब ठीक करना।' },
  { cat: 'gas', name: 'Gas Pipe & Regulator Check', hi: 'गैस पाइप जाँच', visiting: '49.00', price: '99.00', duration: 30, quote: false, kw: 'gas pipe regulator leakage', note: 'लीकेज जाँच — सुरक्षा के लिए साल में एक बार।' },
  { cat: 'dastavez', name: 'Aadhaar / PAN Form Help', hi: 'आधार/पैन फ़ॉर्म सहायता', visiting: '0.00', price: '100.00', duration: 30, quote: false, kw: 'aadhaar pan form document', note: 'सरकारी फ़ीस अलग; सिर्फ फ़ॉर्म भरने में मदद।' },
  { cat: 'dastavez', name: 'Ration Card / Pension Form Help', hi: 'राशन कार्ड/पेंशन फ़ॉर्म', visiting: '0.00', price: '100.00', duration: 30, quote: false, kw: 'ration card pension form', note: 'दस्तावेज़ों की सूची पहले भेज दी जाएगी।' },
];

/** 60 synonyms: Hinglish spellings → canonical words incl. Devanagari (A10 step 2). */
export const SYNONYMS: [string, string][] = [
  ['alu', 'aloo potato आलू'], ['aalu', 'aloo potato आलू'], ['potato', 'aloo आलू'], ['batata', 'aloo आलू'],
  ['pyaaz', 'pyaz onion प्याज़'], ['piyaz', 'pyaz onion प्याज़'], ['onion', 'pyaz प्याज़'], ['kanda', 'pyaz onion प्याज़'],
  ['tamater', 'tamatar tomato टमाटर'], ['tomato', 'tamatar टमाटर'], ['tamaatar', 'tamatar tomato टमाटर'],
  ['ghiya', 'lauki लौकी'], ['dudhi', 'lauki लौकी'], ['okra', 'bhindi भिंडी'], ['ladyfinger', 'bhindi भिंडी'],
  ['brinjal', 'baingan बैंगन'], ['bengan', 'baingan बैंगन'], ['gobi', 'gobhi गोभी'], ['cauliflower', 'gobhi गोभी'],
  ['cabbage', 'patta gobhi गोभी'], ['chilli', 'mirch मिर्च'], ['mirchi', 'mirch मिर्च'], ['ginger', 'adrak अदरक'],
  ['garlic', 'lahsun लहसुन'], ['lehsun', 'lahsun लहसुन'], ['spinach', 'palak पालक'], ['coriander', 'dhaniya धनिया'],
  ['dhania', 'dhaniya धनिया'], ['mint', 'pudina पुदीना'], ['banana', 'kela केला'], ['apple', 'seb सेब'],
  ['guava', 'amrood अमरूद'], ['amrud', 'amrood अमरूद'], ['orange', 'santra संतरा'], ['grapes', 'angoor अंगूर'],
  ['flour', 'atta आटा'], ['aata', 'atta आटा'], ['rice', 'chawal चावल'], ['chaval', 'chawal चावल'],
  ['daal', 'dal दाल'], ['toor', 'arhar dal अरहर'], ['tuvar', 'arhar dal अरहर'], ['mung', 'moong मूंग'],
  ['oil', 'tel तेल'], ['mustard', 'sarson सरसों'], ['ghi', 'ghee घी'], ['turmeric', 'haldi हल्दी'],
  ['salt', 'namak नमक'], ['sugar', 'cheeni चीनी'], ['chini', 'cheeni चीनी'], ['shakkar', 'cheeni चीनी'],
  ['tea', 'chai चाय'], ['jaggery', 'gud गुड़'], ['gur', 'gud गुड़'], ['soap', 'sabun साबुन'],
  ['surf', 'detergent kapde'], ['milk', 'doodh दूध'], ['dudh', 'doodh दूध'], ['curd', 'dahi दही'], ['panir', 'paneer पनीर'],
];
