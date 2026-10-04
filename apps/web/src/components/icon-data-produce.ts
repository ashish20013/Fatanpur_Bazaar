import type { IconNode } from './icon-data';

/**
 * Produce glyphs drawn for this shop.
 *
 * Tabler has one `carrot` and one `plant`, so every vegetable on the site was showing the same
 * mark — sixteen tiles in a row that looked like one stamp repeated, which is the fastest way to
 * make a shop look machine-made. These are drawn to the same rules as the rest of the set
 * (24×24 box, 1.4 stroke, round caps, no fills) so they sit together, but each vegetable is its
 * own silhouette: a customer scanning the grid can tell aloo from adrak without reading.
 *
 * They are placeholders for photographs, not a replacement — the moment the owner uploads a real
 * photo of an item, that photo wins and the glyph is never drawn for it again.
 */
export const PRODUCE_ICONS: Record<string, IconNode> = {
  // potato — a lumpy oval with its eyes
  'veg-aloo': [
    ['path', { d: 'M5.2 13.4c-.6 -3.6 2 -6.6 5.6 -7.2c3.4 -.6 7 1.2 7.8 4.4c.8 3.2 -1.2 6.6 -4.6 7.6c-3.4 1 -8 -.4 -8.8 -4.8' }],
    ['path', { d: 'M10 10.4h.01' }],
    ['path', { d: 'M13.6 13.2h.01' }],
    ['path', { d: 'M9.2 14.8h.01' }],
  ],
  // onion — the bulb, its seams, and the shoot
  'veg-pyaz': [
    ['path', { d: 'M12 7.4c3.2 0 5.6 2.8 5.6 6c0 3.2 -2.4 5.6 -5.6 5.6s-5.6 -2.4 -5.6 -5.6c0 -3.2 2.4 -6 5.6 -6' }],
    ['path', { d: 'M12 7.4c-1.4 2.6 -1.4 8.6 0 11.6' }],
    ['path', { d: 'M12 7.4c1.4 2.6 1.4 8.6 0 11.6' }],
    ['path', { d: 'M12 7.4c-.6 -1.6 -.2 -3 1.6 -3.8' }],
  ],
  // tomato — round, with the calyx sitting on top
  'veg-tamatar': [
    ['path', { d: 'M12 8.6a5.6 5.6 0 1 1 0 11.2a5.6 5.6 0 0 1 0 -11.2' }],
    ['path', { d: 'M12 8.6l-2.6 -2m2.6 2l2.6 -2m-2.6 2v-2.8' }],
    ['path', { d: 'M12 5.8c1 -1 2.2 -1.4 3.4 -1.2' }],
  ],
  // brinjal — the teardrop body under a leafy cap
  'veg-baingan': [
    ['path', { d: 'M15.4 9.2c2 2.2 1.8 6 -.8 8.2c-2.6 2.2 -6.4 1.8 -8 -.6c-1.6 -2.4 -.4 -6 2.4 -7.6c2.2 -1.2 4.8 -1.4 6.4 0' }],
    ['path', { d: 'M9.2 9.2c-.6 -1.4 -2 -2 -3.2 -1.8m3.2 1.8c.4 -1.6 1.8 -2.6 3.2 -2.6m-3.2 2.6c1 -1 2.6 -1.2 3.8 -.6' }],
  ],
  // okra — the ridged pod
  'veg-bhindi': [
    ['path', { d: 'M9 5.6c2.2 -.6 3.6 .8 4.4 3c1 2.8 1.6 7.8 1.2 11.2' }],
    ['path', { d: 'M9 5.6c-1.6 1.2 -1.4 3.4 -.6 5.6c1 2.8 3 7.2 4.6 8.6' }],
    ['path', { d: 'M9.6 9.2c1.6 2.6 3 6.6 3.6 9.6' }],
    ['path', { d: 'M9 5.6l-1.4 -1.6' }],
  ],
  // cauliflower — the curd head between two leaves
  'veg-gobhi': [
    ['path', { d: 'M8.4 12.4a2.6 2.6 0 1 1 1.2 -3.4a2.6 2.6 0 0 1 4.8 0a2.6 2.6 0 1 1 1.2 3.4' }],
    ['path', { d: 'M8.4 12.4h7.2' }],
    ['path', { d: 'M9.6 12.4c0 2.4 .8 4.2 2.4 4.2s2.4 -1.8 2.4 -4.2' }],
    ['path', { d: 'M12 16.6v2.6' }],
    ['path', { d: 'M12 18c-1.4 -1.6 -3.2 -2 -5.2 -1.2m5.2 1.2c1.4 -1.6 3.2 -2 5.2 -1.2' }],
  ],
  // green chilli
  'veg-mirch': [
    ['path', { d: 'M15.6 7.8c1.6 2.4 1 6 -1.6 8.4c-2.6 2.4 -6.2 3 -8 1.6c-1.4 -1.2 -.6 -3 1.6 -3.6c2.6 -.8 4.4 -2.6 5 -5.2c.4 -1.8 1.8 -2.4 3 -1.2' }],
    ['path', { d: 'M15.6 7.8c.2 -1.6 -.4 -2.8 -1.8 -3.4m1.8 3.4c1.2 -.8 2.4 -.6 3.2 .6' }],
  ],
  // ginger — knuckles of rhizome
  'veg-adrak': [
    ['path', { d: 'M6.8 13.2a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 0 1 -5.2 0' }],
    ['path', { d: 'M11.2 15.6a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 0 1 -5.2 0' }],
    ['path', { d: 'M12.4 10.4a2.4 2.4 0 1 1 4.8 0a2.4 2.4 0 0 1 -4.8 0' }],
    ['path', { d: 'M14.8 8l1 -2.4' }],
  ],
  // garlic — the dome, its cloves, the stalk
  'veg-lahsun': [
    ['path', { d: 'M12 7.2c3 1.4 4.8 4.2 4.8 7c0 2.8 -2.2 4.8 -4.8 4.8s-4.8 -2 -4.8 -4.8c0 -2.8 1.8 -5.6 4.8 -7' }],
    ['path', { d: 'M12 7.2v11.8' }],
    ['path', { d: 'M9.4 9.6c-.8 2.8 -.6 6.6 .6 9m4 0c1.2 -2.4 1.4 -6.2 .6 -9' }],
    ['path', { d: 'M12 7.2c-.2 -1.4 .4 -2.4 1.6 -2.8' }],
  ],
  // cucumber
  'veg-kheera': [
    ['path', { d: 'M6 18c-1.4 -1.4 -1 -4.2 1.2 -6.6c2.6 -2.8 6.4 -4 8.6 -2.6c1.8 1.2 1.6 4.2 -.8 6.8c-2.6 2.8 -6.8 4 -9 2.4' }],
    ['path', { d: 'M8.6 14.8l1.6 -1.6m1 3l1.6 -1.6m-4.8 -3l1.6 -1.6' }],
  ],
  // bottle gourd — long neck, round belly
  'veg-lauki': [
    ['path', { d: 'M12 12.4c2.6 .8 4.2 3.2 3.6 5.4c-.6 2 -3 3 -5.2 2.4c-2.2 -.6 -3.4 -2.8 -2.8 -4.6c.4 -1.6 2 -2.6 3.4 -3.2' }],
    ['path', { d: 'M12 12.4c-.6 -1.6 -.6 -3.4 .2 -5c.6 -1.2 .4 -2.2 -.6 -3' }],
    ['path', { d: 'M11.6 4.4c1 -.4 1.8 -.2 2.4 .6' }],
  ],
  // pumpkin — ribs and stem
  'veg-kaddu': [
    ['path', { d: 'M12 8.6c3.4 0 6 2.6 6 5.8s-2.6 5.6 -6 5.6s-6 -2.4 -6 -5.6s2.6 -5.8 6 -5.8' }],
    ['path', { d: 'M12 8.6c-1.4 3 -1.4 8.4 0 11.4m0 -11.4c1.4 3 1.4 8.4 0 11.4' }],
    ['path', { d: 'M9 9.4c-1 3 -1 7 0 9.6m6 -9.6c1 3 1 7 0 9.6' }],
    ['path', { d: 'M12 8.6v-2.2c0 -1 .8 -1.8 1.8 -1.8' }],
  ],
  // radish — root and greens
  'veg-mooli': [
    ['path', { d: 'M12 10.4c2.6 0 4.6 1.8 4.4 4c-.2 2.6 -2.6 5.6 -4.4 5.6s-4.2 -3 -4.4 -5.6c-.2 -2.2 1.8 -4 4.4 -4' }],
    ['path', { d: 'M12 10.4c-1.2 -1.6 -3 -2.2 -4.8 -1.6m4.8 1.6c-.2 -2 .8 -3.6 2.6 -4.2m-2.6 4.2c1.2 -1.4 2.8 -1.8 4.4 -1.2' }],
  ],
  // leafy greens — palak, methi, dhaniya
  'veg-saag': [
    ['path', { d: 'M12 20c0 -4.4 .6 -7.6 2 -10' }],
    ['path', { d: 'M14 10c1.4 -2.4 3.6 -3.4 6 -3c.4 2.8 -.8 5 -3 6c-1.4 .6 -2.6 .2 -3 -3' }],
    ['path', { d: 'M12 14c-1.2 -2.4 -3.2 -3.6 -5.6 -3.4c-.4 2.6 .6 4.6 2.6 5.4c1.4 .6 2.6 .2 3 -2' }],
  ],
  // banana
  'fruit-kela': [
    ['path', { d: 'M5.4 11.6c.6 4.6 4.4 7.8 8.8 7.4c3.4 -.4 5.4 -2.6 5.4 -4.6c0 -1 -.8 -1.4 -1.6 -.8c-2.6 1.8 -6.4 1.4 -8.4 -1c-1 -1.2 -1.6 -2.6 -1.6 -4c0 -1 -1 -1.2 -1.6 -.4c-.8 1 -1.2 2.2 -1 3.4' }],
    ['path', { d: 'M18 13.6l1.8 -1' }],
  ],
  // lemon
  'fruit-nimbu': [
    ['path', { d: 'M12 8.8c3.6 0 6.4 2.2 6.4 5s-2.8 5 -6.4 5s-6.4 -2.2 -6.4 -5s2.8 -5 6.4 -5' }],
    ['path', { d: 'M12 8.8c-.4 -1.2 0 -2.2 1 -2.8' }],
    ['path', { d: 'M13 6c1.4 -1 3 -.8 4.2 .4c-.8 1.6 -2.4 2.2 -4.2 1.6' }],
  ],
  // grapes
  'fruit-angoor': [
    ['path', { d: 'M12 6.4v2.4' }],
    ['path', { d: 'M12 6.4c1.2 -1 2.6 -1.2 4 -.6' }],
    ['path', { d: 'M9.6 11a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 0 0 -3.8 0' }],
    ['path', { d: 'M6.6 14.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 0 0 -3.8 0' }],
    ['path', { d: 'M12.6 14.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 0 0 -3.8 0' }],
    ['path', { d: 'M9.6 17.8a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 0 0 -3.8 0' }],
  ],
  // watermelon slice
  'fruit-tarbooz': [
    ['path', { d: 'M4.4 10.6h15.2c0 4.6 -3.4 8.2 -7.6 8.2s-7.6 -3.6 -7.6 -8.2' }],
    ['path', { d: 'M6.8 10.6c0 3.2 2.4 5.8 5.2 5.8s5.2 -2.6 5.2 -5.8' }],
    ['path', { d: 'M10.4 13h.01m3.2 -.6h.01m-1.6 2.4h.01' }],
  ],
  // coconut
  'fruit-nariyal': [
    ['path', { d: 'M12 6.6a6.4 6.4 0 1 1 0 12.8a6.4 6.4 0 0 1 0 -12.8' }],
    ['path', { d: 'M9.8 11h.01m4.4 0h.01m-2.2 3h.01' }],
    ['path', { d: 'M12 6.6c-.4 -1.2 0 -2.2 1.2 -2.8' }],
  ],
  // peas in the pod
  'veg-matar': [
    ['path', { d: 'M6.6 9.6c4 -.4 8.4 1.4 10.8 4.8c-3 2.4 -7.8 2.4 -10.8 -.2c-1.4 -1.2 -1.4 -3.4 0 -4.6' }],
    ['path', { d: 'M9 12.2a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 0 0 -2.6 0' }],
    ['path', { d: 'M12.6 13.4a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 0 0 -2.6 0' }],
    ['path', { d: 'M6.6 9.6c-1 -1 -2.4 -1.4 -3.8 -1' }],
  ],
};
