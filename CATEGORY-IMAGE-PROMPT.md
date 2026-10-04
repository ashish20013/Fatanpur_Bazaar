# कैटेगरी की 20 दुकान-तस्वीरें — ChatGPT से कैसे बनवाएँ

यह पूरी फ़ाइल आपके लिए है। **भाग 1** ChatGPT में चिपकाने वाला प्रॉम्प्ट है, **भाग 2** बीस
कैटेगरी की लाइनें, **भाग 3** नाप-फ़ॉर्मैट, **भाग 4** मुझे कैसे भेजना है।

---

## पहले एक ज़रूरी बात — नाप के बारे में

आपने कहा "Full HD में बनवा लेता हूँ"। सच यह है:

ChatGPT का इमेज टूल **चौकोर में 1024 × 1024 px** बनाता है — यही उसकी असली नाप है।
"Full HD" (1920×1080) चौड़ी-पतली होती है, और हमारा कैटेगरी ख़ाना **गोल** है, इसलिए चौड़ी
तस्वीर के दोनों किनारे कट जाएँगे — यानी नुक़सान, फ़ायदा नहीं।

**1024 × 1024 हमारे लिए ज़रूरत से ज़्यादा है**, क्योंकि:

- साइट पर यह तस्वीर फ़ोन में **62–70 px** के गोल ख़ाने में दिखती है, और हेडिंग में **44 px**
- साइट ख़ुद इसे **200 px का WebP** बना कर भेजती है — यानी ग्राहक के फ़ोन पर लगभग **8–12 KB**
- आप 4000 px की भेजें तो भी ग्राहक तक वही 200 px जाएगा। सिर्फ़ आपका ज़िप भारी होगा

इसलिए: **1024 × 1024, PNG या JPG — बस।** यह न कम है न ज़्यादा।

> मैंने अभी कोड में एक सुधार भी कर दिया है: पहले ये तस्वीरें 600 px वाली फ़ाइल से दिखती थीं
> (20 कैटेगरी × 600px ≈ 600 KB, जो गाँव के 3G पर होम पेज का सबसे भारी हिस्सा बन जाता)। अब
> 200 px वाली जाती है — **क़रीब 10 गुना हल्की**, और दिखने में कोई फ़र्क़ नहीं, क्योंकि ख़ाना
> 70 px का ही है।

---

## भाग 1 — यह पूरा हिस्सा ChatGPT में एक बार चिपकाइए

ChatGPT खोलिए → नई चैट → नीचे वाला पूरा टेक्स्ट एक बार में भेज दीजिए:

```
I need a set of 20 category tile images for a village grocery-delivery website in
Uttar Pradesh, India. They must look like ONE consistent set, made by the same
photographer on the same day.

STYLE — keep these identical across all 20:
- Photorealistic, like a clean, well-lit product photograph of a small Indian
  neighbourhood shop-front or stall.
- Straight-on, eye-level view, as if the customer is standing in front of the shop
  about to walk in. Not from above, not tilted.
- Shallow depth of field: the shop is sharp, the background is softly blurred.
- Warm late-morning daylight, soft shadows, no harsh sun, no night scenes.
- Colour mood: warm cream and sand tones, with deep forest green and muted gold
  accents (roughly #F3EFE6 background, #166B3C green, #CBA954 gold). Nothing neon.
- Background behind the shop: plain, softly blurred warm cream — not a busy street.
- The shop fills about 70% of the frame and is CENTRED, with clear empty margin on
  all four sides.

FRAMING — this matters:
- Square, 1:1, 1024 x 1024 pixels.
- The image will be cropped into a CIRCLE, so nothing important may sit near the
  corners or the edges. Everything that matters must be in the middle.

HARD RULES — never break these:
- NO people. No human beings, no faces, no hands, no arms, no silhouettes, no
  reflections of people. The shop must be open and inviting but empty of humans.
- NO text of any kind. No signboards with writing, no letters, no numbers, no
  price tags, no labels, no watermarks, in any language.
- NO real brand names, logos, or recognisable product packaging. Any packets,
  bottles or tins must be plain and generic, with no writing on them.
- No cartoon, no 3D render, no illustration, no painting. Photographic only.
- No collage, no split frames, no borders, no drop shadows around the image.

OUTPUT:
- One image per message, 1024 x 1024, square.
- I will send you 20 short lines, one at a time. Each line is the subject of one
  image. Apply ALL the rules above to every single one, without me repeating them.

Reply with only "ready" and then wait for my first subject line.
```

फिर ChatGPT के "ready" कहने के बाद, **भाग 2** की लाइनें एक-एक कर के भेजिए।

---

## भाग 2 — बीस लाइनें (एक-एक कर के भेजिए)

हर तस्वीर बनने के बाद उसे डाउनलोड कीजिए और **साथ लिखा नाम** दे दीजिए।

| # | ChatGPT को भेजने वाली लाइन | फ़ाइल का नाम |
| --- | --- | --- |
| 1 | `A small Indian kirana grocery shop front, sacks of rice and wheat flour open at the front, plain tins and jars stacked on wooden shelves behind.` | `kirana.png` |
| 2 | `A fresh fruit and vegetable stall, wooden crates of tomatoes, potatoes, onions, green chillies, bananas and leafy greens, arranged in neat rows.` | `fal-sabzi.png` |
| 3 | `A small roadside snack stall counter, a large steel kadhai, stacked steel plates, samosas and pakoras in a glass-front display case.` | `fast-food.png` |
| 4 | `A small Indian sweet shop counter, steel trays of laddoos, barfi and jalebi behind a clean glass display case.` | `mithai.png` |
| 5 | `A small electrical goods shop front, hanging bulbs, coils of wire, switch boards and plain plastic fittings on a wooden rack.` | `electronics.png` |
| 6 | `A small cosmetics and toiletries shop shelf, plain unlabelled bottles, soap bars, combs and hair-oil bottles neatly arranged.` | `beauty.png` |
| 7 | `A small cloth shop interior, bolts of folded fabric in warm colours stacked on wooden shelves, one roll partly unrolled on the counter.` | `kapde.png` |
| 8 | `A small footwear shop front, rows of simple sandals, chappals and canvas shoes on tiered wooden racks.` | `joote-chappal.png` |
| 9 | `A small farm supply shop front, hand tools — sickle, khurpi, spade — hanging on the wall, coils of rope and a stack of jute sacks below.` | `kheti.png` |
| 10 | `A small building materials shop yard, a neat stack of red bricks, plain cement sacks piled beside them, sand in a wooden frame.` | `building-material.png` |
| 11 | `A small clean pathology sample collection counter, plain glass test tubes in a steel rack, a centrifuge and a clipboard on a white counter.` | `body-checkup.png` |
| 12 | `A small village doctor consulting room, a wooden desk with a stethoscope resting on it, an examination bed with a clean white sheet behind.` | `doctor.png` |
| 13 | `A small Indian medical store counter, plain blister strips and unlabelled medicine bottles arranged in a glass-front cabinet.` | `dawai.png` |
| 14 | `A tractor with a trailer and a small pickup van parked side by side on clean ground, ready for hire.` | `bhada-gadi.png` |
| 15 | `A home-repair workman's kit laid out neatly on a wooden floor — an open tool bag, spanners, a pipe wrench, a coil of wire, a drill.` | `ghar-sewa.png` |
| 16 | `A small party supplies shop shelf, bunches of plain colourful balloons, paper streamers, party caps and a plain tiered cake on a stand.` | `birthday.png` |
| 17 | `A Diwali shop display, rows of clay diyas with small flames, plain firework packets stacked in a wooden crate, marigold garlands above.` | `patakha.png` |
| 18 | `A clean village veterinary clinic corner, a steel examination table, a stethoscope, feed buckets and a bale of fodder beside it.` | `pashu-doctor.png` |
| 19 | `A small seed and fertiliser shop front, plain fertiliser sacks stacked in rows, open bowls of different seeds on the wooden counter.` | `beej-bhandar.png` |
| 20 | `A clean desk with a tablet propped on a stand showing a blank screen, a stethoscope and a notepad beside it, suggesting an online doctor consultation.` | `doctor-consult.png` |

---

## भाग 3 — नाप, फ़ॉर्मैट, और फ़ाइल का वज़न

| | |
| --- | --- |
| **नाप** | **1024 × 1024 px** (चौकोर) — ChatGPT जो देता है वही, बदलिए मत |
| **फ़ॉर्मैट** | **PNG** (ChatGPT यही देता है) — JPG भी चलेगा, WebP भी |
| **❌ चलेगा नहीं** | HEIC, AVIF, PDF, SVG |
| **एक फ़ाइल का वज़न** | 1–3 MB सामान्य है, कोई दिक़्क़त नहीं (हद 8 MB) |
| **ज़िप का कुल वज़न** | 20 × ~2 MB ≈ **40 MB** — एक बार में आराम से भेज देंगे |
| **आपको छोटा करने की ज़रूरत?** | **नहीं।** साइट ख़ुद 200/600/1200 px WebP बनाती है (quality 82) |

### असली नाप — मैंने अभी नाप कर देखी है

एक 1024 × 1024 PNG (355 KB) चढ़ा कर साइट ने जो बनाया:

```
200 px WebP  →  11.4 KB   ← ग्राहक के फ़ोन पर यही जाती है
600 px WebP  →  30.3 KB
1200 px WebP →  50.9 KB
```

और होम पेज पर असल में कितना उतरता है — यह भी नाप लिया (फ़ोन की चौड़ाई पर):

```
पन्ना खुलते ही          →  4 तस्वीरें, 12 KB
पूरी पट्टी घुमाने पर     →  बाक़ी धीरे-धीरे, ज़रूरत पड़ने पर
```

वजह: पट्टी में एक बार में 4 ही दिखती हैं, बाक़ी तभी उतरती हैं जब सामने आती हैं।
**यानी पहला पन्ना 12 KB भारी होगा — इतना कि किसी को पता भी न चले।**

इसीलिए "फ़ाइल छोटी हो पर quality अच्छी हो" की चिंता मत कीजिए — वो काम साइट का है, और वो
हो चुका है। आप बस साफ़ 1024 × 1024 भेजिए।

---

## भाग 4 — मुझे कैसे भेजना है

```
category-images.zip
├── kirana.png
├── fal-sabzi.png
├── fast-food.png
├── mithai.png
├── electronics.png
├── beauty.png
├── kapde.png
├── joote-chappal.png
├── kheti.png
├── building-material.png
├── body-checkup.png
├── doctor.png
├── dawai.png
├── bhada-gadi.png
├── ghar-sewa.png
├── birthday.png
├── patakha.png
├── pashu-doctor.png
├── beej-bhandar.png
└── doctor-consult.png
```

**नाम बिल्कुल यही रखिए** — छोटे अक्षर, बीच में डैश। नाम सही हुआ तो बीसों एक कमांड में चढ़ जाएँगी।

ज़िप मिलते ही मैं: हर नाम मिलाऊँगा · गोल कटाई के लिए चौकोर काटूँगा · 200/600/1200 px WebP
बनाऊँगा · डेटाबेस में चढ़ाऊँगा · और **बीसों का एक स्क्रीनशॉट भेजूँगा** ताकि आप देख लें कि
70 px पर हर एक पहचान में आ रही है या नहीं। जो कमज़ोर लगेगी, उसकी लाइन सुधार कर आप दोबारा
बनवा लीजिएगा।

---

## अगर ChatGPT आनाकानी करे

- **"मैं 20 एक साथ नहीं बना सकता"** — सही है, वो एक बार में एक ही बनाता है। भाग 2 की लाइनें
  एक-एक कर के भेजिए, 20 संदेश।
- **तस्वीर में आदमी आ जाए** — लिखिए: `Regenerate with absolutely no people, no hands, no
  faces. The shop must be completely empty of humans.`
- **साइनबोर्ड पर अक्षर आ जाएँ** — लिखिए: `Regenerate with no text, no letters, no numbers
  anywhere in the image. Blank signboard.`
- **बाद वाली तस्वीरें पहली से अलग दिखने लगें** — लिखिए: `Match the exact style, lighting and
  colour mood of the first image in this set.`
- **ज़िप बना कर माँगें** — कह दीजिए: `Put all the images we made into a single zip file.`
  (अगर वो मना करे तो एक-एक डाउनलोड कर के आप ख़ुद ज़िप बना लीजिए — दोनों बराबर है।)

---

## दो बातें साफ़ रहें

**ये कैटेगरी की सजावटी तस्वीरें हैं, आपकी दुकान की फ़ोटो नहीं।** ये बताती हैं कि इस
कैटेगरी में किस तरह का सामान मिलता है — जैसे बाज़ार में दुकान का दिखना। **आपकी असली दुकान की
फ़ोटो** हेडर की पट्टी में, "हमारे बारे में" पन्ने पर और साझा करने वाली तस्वीर में लगेगी — वो
आप ख़ुद खींचेंगे (`IMAGE-SPEC.md` भाग 1)। ये दो अलग चीज़ें हैं और दोनों चाहिए।

**सामान की फ़ोटो इनसे नहीं बनवानी।** आलू की तस्वीर आपके ही आलू की होनी चाहिए — ग्राहक जो
देख कर ऑर्डर करेगा और थैले में जो पहुँचेगा, वो अलग निकला तो भरोसा वहीं टूटेगा। कैटेगरी की
सजावट अलग बात है, बिकने वाले सामान की तस्वीर अलग।
