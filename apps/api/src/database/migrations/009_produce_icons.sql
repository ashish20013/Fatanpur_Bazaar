-- Sabzi aur phal ke apne chitra (icon-data-produce.ts me haath se banaye gaye).
-- Pehle solah sabziyan ek hi 'plant' ke nishan se dikhti thin; ab har ek alag dikhti hai.
-- Yeh tab tak hi dikhte hain jab tak us saman ki asli photo nahi chadhti — photo hamesha jeetti hai.
UPDATE products SET icon = 'fruit-angoor' WHERE name IN ('Angoor (Grapes)');
UPDATE products SET icon = 'fruit-kela' WHERE name IN ('Kela (Banana)');
UPDATE products SET icon = 'fruit-nariyal' WHERE name IN ('Coconut Hair Oil','Nariyal (Coconut)');
UPDATE products SET icon = 'fruit-nimbu' WHERE name IN ('Mausambi (Sweet Lime)','Nimbu (Lemon)','Santra (Orange)');
UPDATE products SET icon = 'fruit-tarbooz' WHERE name IN ('Tarbooz (Watermelon)');
UPDATE products SET icon = 'veg-adrak' WHERE name IN ('Adrak (Ginger)');
UPDATE products SET icon = 'veg-aloo' WHERE name IN ('Aloo (Potato)','Aloo Bhujia','Aloo Tikki Chaat','Potato Seed 50 kg');
UPDATE products SET icon = 'veg-baingan' WHERE name IN ('Baingan (Brinjal)');
UPDATE products SET icon = 'veg-bhindi' WHERE name IN ('Bhindi (Lady Finger)','Bhindi (Okra) Seed Packet');
UPDATE products SET icon = 'veg-gobhi' WHERE name IN ('Gobhi (Cauliflower)','Patta Gobhi (Cabbage)');
UPDATE products SET icon = 'veg-kaddu' WHERE name IN ('Kaddu (Pumpkin)','Kaddu (Pumpkin) Seed Packet');
UPDATE products SET icon = 'veg-kheera' WHERE name IN ('Kheera (Cucumber)');
UPDATE products SET icon = 'veg-lahsun' WHERE name IN ('Lahsun (Garlic)');
UPDATE products SET icon = 'veg-lauki' WHERE name IN ('Karela (Bitter Gourd)','Karela (Bitter Gourd) Seed Packet','Lauki (Bottle Gourd)','Lauki (Bottle Gourd) Seed Packet','Torai (Ridge Gourd) Seed Packet');
UPDATE products SET icon = 'veg-matar' WHERE name IN ('Pea (Matar) Seed 20 kg');
UPDATE products SET icon = 'veg-mirch' WHERE name IN ('Chilli Seed Packet','Hari Mirch (Green Chilli)','Lal Mirch Powder (Red Chilli)','Mirchi Bomb (20 pcs)');
UPDATE products SET icon = 'veg-mooli' WHERE name IN ('Mooli (Radish)');
UPDATE products SET icon = 'veg-pyaz' WHERE name IN ('Hara Pyaz (Spring Onion)','Onion Seed 250 g','Pyaz (Onion)');
UPDATE products SET icon = 'veg-saag' WHERE name IN ('Bathua','Dhaniya (Coriander)','Fenugreek (Methi) Seed Packet','Methi (Fenugreek)','Palak (Spinach)','Pudina (Mint)','Sarson Saag');
UPDATE products SET icon = 'veg-tamatar' WHERE name IN ('Tamatar (Tomato)','Tomato Seed Packet');
