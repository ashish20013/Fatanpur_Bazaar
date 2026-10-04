-- Corrections found once the drawings were coloured in.
--
-- A thin grey outline hid the mistake: a masala bowl and a washing-powder packet were the same
-- pale scribble. In colour, "कपड़े धोने का पाउडर" showing a bowl of red chilli is the first thing
-- the eye lands on. These are name-keyed so they are safe to run twice, and they only touch rows
-- the seed itself created — an icon the shopkeeper picked in the admin panel is not in this list.

-- Cleaning, not cooking.
UPDATE products SET icon = 'wash' WHERE name IN ('Kapde Dhone ka Powder') AND icon = 'bowl-spoon';
UPDATE products SET icon = 'spray' WHERE name IN ('Hand Sanitizer 100 ml') AND icon = 'droplet';

-- Pathology tests belong in a test tube, not an oil drop or a toffee.
UPDATE products SET icon = 'test-pipe'
 WHERE name IN ('Blood Sugar Test at Home', 'Blood Sugar - Fasting and PP', 'Blood Sugar Test Strips (25)',
                'CBC with ESR', 'Haemoglobin (Hb) Test')
   AND icon IN ('candy', 'droplet');

-- Tubes, creams and an ORS sachet: medicine, not cooking oil or masala.
UPDATE products SET icon = 'medicine-syrup'
 WHERE name IN ('Anti-fungal Cream 15 g', 'Diclofenac Gel 30 g', 'Pain Relief Balm 25 g', 'ORS Powder')
   AND icon IN ('droplet', 'bowl-spoon');

-- Cosmetics: a sparkle reads better than a spray can for these.
UPDATE products SET icon = 'sparkles' WHERE name IN ('Bindi Packet', 'Kajal') AND icon = 'spray';
UPDATE products SET icon = 'bottle' WHERE name IN ('Cold Cream') AND icon = 'spray';
UPDATE products SET icon = 'bottle' WHERE name IN ('Talcum Powder') AND icon = 'bowl-spoon';

-- Hardware: a sack is a sack, and distemper is paint.
UPDATE products SET icon = 'package' WHERE name IN ('Jute Bag (Bori)') AND icon = 'tool';
UPDATE products SET icon = 'paint' WHERE name IN ('Distemper 10 kg') AND icon = 'tool';
