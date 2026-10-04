import type { IconNode } from './icon-data';

/**
 * Coloured product art, drawn for this shop.
 *
 * Until the shopkeeper photographs his stock (FOTO-KAISE-KHINCHEN.md), every tile falls back to a
 * drawing. A thin grey line glyph is honest but unreadable at 150 px on a cheap phone: forty tiles
 * of the same pale outline give the eye nothing to catch. These are filled and coloured, so आलू is
 * recognised as a potato before the word is read — which is the whole point for customers who read
 * slowly or not at all.
 *
 * Keyed by the product's icon name with an `art-` prefix, so a product needs no new column: give it
 * `icon = 'bottle'` and it gets the oil bottle here; give it an icon with no drawing yet and it
 * keeps its line glyph. Nothing here pretends to be a photograph — no brand, no wordmark, no
 * packaging anyone could mistake for the real packet.
 *
 * House rules, so 60 drawings read as one family:
 *   • 64-unit box, one object centred, filling roughly 44 units
 *   • flat fills only — a gradient turns to mud at 40 px on a 3-year-old screen
 *   • at most four colours per drawing, one of them a darker shade for depth
 *   • the site's own muted palette; nothing neon, nothing that fights the green
 */
export const PRODUCT_ART: Record<string, IconNode> = {
  // ---- सब्ज़ी ------------------------------------------------------------------
  'art-veg-aloo': [
    ['ellipse', { cx: '32', cy: '35', rx: '21', ry: '16', fill: '#c9a46d' }],
    ['path', { d: 'M13 32c3-8 13-13 23-11 7 1 12 5 15 10-4-8-12-12-21-12-7 0-14 5-17 13z', fill: '#dcb87f' }],
    ['ellipse', { cx: '24', cy: '32', rx: '2.4', ry: '1.8', fill: '#a07f4d' }],
    ['ellipse', { cx: '38', cy: '39', rx: '2.2', ry: '1.6', fill: '#a07f4d' }],
    ['ellipse', { cx: '41', cy: '29', rx: '1.8', ry: '1.4', fill: '#a07f4d' }],
  ],
  'art-veg-pyaz': [
    ['path', { d: 'M32 19c10 0 17 8 17 18 0 9-7 16-17 16s-17-7-17-16c0-10 7-18 17-18z', fill: '#9b6f9e' }],
    ['path', { d: 'M32 19c4 4 6 12 6 18s-2 13-6 16c-4-3-6-10-6-16s2-14 6-18z', fill: '#bc90bd' }],
    ['path', { d: 'M32 19l-4-7m4 7l4-7', stroke: '#6d9a56', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-veg-tamatar': [
    ['circle', { cx: '32', cy: '37', r: '18', fill: '#c9503a' }],
    ['path', { d: 'M22 31c-2 3-3 7-2 11', stroke: '#e08a74', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M32 22c-4-4-9-5-13-4 1 4 5 7 9 7zm0 0c4-4 9-5 13-4-1 4-5 7-9 7z', fill: '#4f8046' }],
    ['path', { d: 'M32 18v5', stroke: '#4f8046', 'stroke-width': '3.2', 'stroke-linecap': 'round' }],
  ],
  'art-veg-baingan': [
    ['path', { d: 'M40 25c7 4 10 12 7 19-4 9-14 13-22 10s-11-13-6-20c4-6 13-11 21-9z', fill: '#6b4a7d' }],
    ['path', { d: 'M27 37c-3 4-4 9-2 13', stroke: '#9878a8', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M38 24c-3-4-2-8 1-10 3 3 4 7 2 10z', fill: '#4f8046' }],
    ['path', { d: 'M39 25c4-2 8-1 10 2-3 3-7 3-10 1z', fill: '#6d9a56' }],
  ],
  'art-veg-bhindi': [
    ['path', { d: 'M25 13c3-1 6 1 6 4l6 30c1 3-1 6-4 6s-6-2-6-5l-6-29c-1-3 1-5 4-6z', fill: '#6d9a56' }],
    ['path', { d: 'M41 17c3 1 4 3 4 6l-4 28c-1 3-3 5-6 4s-4-3-4-6l5-28c1-3 3-5 5-4z', fill: '#84b167' }],
    ['path', { d: 'M25 13l-3-4m19 8l3-5', stroke: '#4f8046', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-veg-gobhi': [
    ['path', { d: 'M14 37c0-3 2-6 5-7 0-6 6-11 13-11s13 5 13 11c3 1 5 4 5 7 0 5-5 9-11 9H25c-6 0-11-4-11-9z', fill: '#ece9d8' }],
    ['circle', { cx: '24', cy: '33', r: '4', fill: '#d2cdb2' }],
    ['circle', { cx: '34', cy: '30', r: '4.5', fill: '#d2cdb2' }],
    ['circle', { cx: '41', cy: '36', r: '4', fill: '#d2cdb2' }],
    ['path', { d: 'M17 43c-4 3-5 8-2 11 5 2 11-1 13-6z', fill: '#5f9243' }],
    ['path', { d: 'M47 43c4 3 5 8 2 11-5 2-11-1-13-6z', fill: '#6d9a56' }],
  ],
  'art-veg-mirch': [
    ['path', { d: 'M47 20c1 14-10 27-24 29-4 1-7-2-6-6 1-5 7-7 12-9 8-3 12-8 14-15 1-3 4-3 4 1z', fill: '#5f9243' }],
    ['path', { d: 'M41 24c-1 8-6 15-13 19', stroke: '#86b866', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M46 20c-2-5-1-8 2-10 2 3 2 7 0 10z', fill: '#4f8046' }],
  ],
  'art-veg-adrak': [
    ['path', { d: 'M11 41a9 9 0 0 1 9-9h7a8.5 8.5 0 0 1 0 17h-7a9 9 0 0 1-9-8z', fill: '#c09c5e' }],
    ['path', { d: 'M24 33a9.5 9.5 0 0 1 9.5-9.5h7a9.5 9.5 0 0 1 0 19h-7A9.5 9.5 0 0 1 24 33z', fill: '#dcb87f' }],
    ['path', { d: 'M39 24a8 8 0 0 1 8-8h4a8 8 0 0 1 0 16h-4a8 8 0 0 1-8-8z', fill: '#cfa96b' }],
    ['path', { d: 'M46 15c1-4 4-6 7-5-1 4-4 6-7 5z', fill: '#8fae63' }],
  ],
  'art-veg-lahsun': [
    ['path', { d: 'M32 21c9 0 16 9 16 18 0 7-7 12-16 12s-16-5-16-12c0-9 7-18 16-18z', fill: '#ece2cf' }],
    ['path', { d: 'M32 21c3 5 4 12 4 18s-1 10-4 12c-3-2-4-6-4-12s1-13 4-18z', fill: '#cbbd9e' }],
    ['path', { d: 'M32 21l-2-6m2 6l2-6', stroke: '#9c8f74', 'stroke-width': '2.8', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-veg-kheera': [
    ['rect', { x: '11', y: '26', width: '42', height: '15', rx: '7.5', fill: '#5f9243', transform: 'rotate(-22 32 33)' }],
    ['rect', { x: '18', y: '30', width: '18', height: '4', rx: '2', fill: '#89bb68', transform: 'rotate(-22 32 33)' }],
  ],
  'art-veg-lauki': [
    ['path', { d: 'M38 27c8 3 12 12 9 20-3 8-12 11-19 8s-10-12-7-19c2-4 6-7 9-9 2-3 3-8 2-12 4 0 6 5 6 12z', fill: '#8fb56a' }],
    ['path', { d: 'M30 36c-4 3-6 8-5 13', stroke: '#abcb87', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M36 13c2 0 3 2 3 4', stroke: '#5f9243', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-veg-kaddu': [
    ['ellipse', { cx: '32', cy: '38', rx: '21', ry: '16', fill: '#dd8a33' }],
    ['ellipse', { cx: '32', cy: '38', rx: '8', ry: '16', fill: '#eda149' }],
    ['path', { d: 'M32 22v-6', stroke: '#5f7a3f', 'stroke-width': '3.4', 'stroke-linecap': 'round' }],
    ['path', { d: 'M33 17c4-3 8-2 9 1-3 2-7 2-9-1z', fill: '#6d9a56' }],
  ],
  'art-veg-mooli': [
    ['path', { d: 'M32 24c6 0 10 4 10 10 0 10-5 22-10 22s-10-12-10-22c0-6 4-10 10-10z', fill: '#f7eff1' }],
    ['path', { d: 'M22 34c0-6 4-10 10-10s10 4 10 10c-3 2-7 3-10 3s-7-1-10-3z', fill: '#dfabb8' }],
    ['path', { d: 'M28 40c0 6 1 11 3 15', stroke: '#e3d6d9', 'stroke-width': '2.4', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M32 24c-5-6-11-8-16-6 2 6 8 9 14 8z', fill: '#5f9243' }],
    ['path', { d: 'M32 24c5-6 11-8 16-6-2 6-8 9-14 8z', fill: '#7fab63' }],
  ],
  'art-veg-saag': [
    ['path', { d: 'M32 54V32', stroke: '#4f8046', 'stroke-width': '3.4', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M32 35C23 35 15 28 13 18c11-2 19 5 19 17z', fill: '#5f9243' }],
    ['path', { d: 'M32 35c9 0 17-7 19-17-11-2-19 5-19 17z', fill: '#6d9a56' }],
    ['path', { d: 'M32 43c-6 0-12-5-13-12 8-1 13 4 13 12z', fill: '#84b167' }],
  ],
  'art-veg-matar': [
    ['path', { d: 'M13 26c11-8 27-8 38 0-4 13-15 20-25 18-9-2-14-10-13-18z', fill: '#5f9243' }],
    ['circle', { cx: '24', cy: '33', r: '5', fill: '#8fc06a' }],
    ['circle', { cx: '34', cy: '35', r: '5', fill: '#8fc06a' }],
    ['circle', { cx: '43', cy: '32', r: '4.4', fill: '#8fc06a' }],
  ],
  'art-carrot': [
    ['path', { d: 'M45 21L25 50c-2 3-6 2-6-2l-2-18c0-2 2-4 4-4z', fill: '#dd8a33' }],
    ['path', { d: 'M38 29l-6 4m9 3l-6 4', stroke: '#b86c22', 'stroke-width': '2.6', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M45 21c4-5 10-6 13-4-2 5-7 7-13 6z', fill: '#5f9243' }],
    ['path', { d: 'M45 21c-2-6-1-11 2-13 3 5 2 10-2 13z', fill: '#6d9a56' }],
  ],

  // ---- फल ----------------------------------------------------------------------
  'art-fruit-kela': [
    ['path', { d: 'M13 28c3 15 15 25 29 25 6 0 10-3 10-7 0-3-3-5-8-5-11 0-19-7-22-17-2-5-10-3-9 4z', fill: '#e4c04b' }],
    ['path', { d: 'M18 31c4 11 13 18 24 19', stroke: '#f0d777', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M13 25l-2-6', stroke: '#8a7434', 'stroke-width': '3.4', 'stroke-linecap': 'round' }],
  ],
  'art-fruit-nimbu': [
    ['ellipse', { cx: '32', cy: '37', rx: '19', ry: '15', fill: '#e2c64a' }],
    ['path', { d: 'M17 33c3-6 9-10 16-10', stroke: '#efdc86', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M32 22c-3-4-2-7 1-8 2 3 2 6-1 8z', fill: '#5f9243' }],
  ],
  'art-fruit-angoor': [
    ['path', { d: 'M32 16v6', stroke: '#8a6224', 'stroke-width': '3', 'stroke-linecap': 'round' }],
    ['path', { d: 'M33 18c4-4 9-5 12-3-3 4-8 5-12 3z', fill: '#5f9243' }],
    ['circle', { cx: '25', cy: '30', r: '6', fill: '#7b5b8f' }],
    ['circle', { cx: '39', cy: '30', r: '6', fill: '#7b5b8f' }],
    ['circle', { cx: '32', cy: '36', r: '6.4', fill: '#8e6ba3' }],
    ['circle', { cx: '21', cy: '41', r: '5.6', fill: '#7b5b8f' }],
    ['circle', { cx: '43', cy: '41', r: '5.6', fill: '#7b5b8f' }],
    ['circle', { cx: '32', cy: '48', r: '5.6', fill: '#8e6ba3' }],
  ],
  'art-fruit-tarbooz': [
    ['path', { d: 'M6 24h52a26 26 0 0 1-52 0z', fill: '#4f8046' }],
    ['path', { d: 'M11 27h42a21 21 0 0 1-42 0z', fill: '#f3efe3' }],
    ['path', { d: 'M15 31h34a17 17 0 0 1-34 0z', fill: '#c9503a' }],
    ['circle', { cx: '25', cy: '37', r: '1.7', fill: '#3b2a22' }],
    ['circle', { cx: '32', cy: '41', r: '1.7', fill: '#3b2a22' }],
    ['circle', { cx: '39', cy: '37', r: '1.7', fill: '#3b2a22' }],
  ],
  'art-fruit-nariyal': [
    ['circle', { cx: '32', cy: '36', r: '18', fill: '#8a6224' }],
    ['path', { d: 'M32 18c-6 4-10 10-10 18s4 14 10 18c-10 0-18-8-18-18s8-18 18-18z', fill: '#6f4e1c' }],
    ['circle', { cx: '28', cy: '29', r: '2.2', fill: '#3d2a10' }],
    ['circle', { cx: '38', cy: '31', r: '2.2', fill: '#3d2a10' }],
    ['circle', { cx: '33', cy: '38', r: '2.2', fill: '#3d2a10' }],
  ],
  'art-apple': [
    ['path', { d: 'M32 23c5-3 12-2 15 3 4 6 2 17-3 23-3 4-7 5-12 3-5 2-9 1-12-3-5-6-7-17-3-23 3-5 10-6 15-3z', fill: '#c9503a' }],
    ['path', { d: 'M24 29c-2 4-3 9-1 14', stroke: '#e08a74', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M32 23v-7', stroke: '#7a5a2a', 'stroke-width': '3', 'stroke-linecap': 'round' }],
    ['path', { d: 'M33 18c4-4 9-4 12-2-3 4-8 5-12 2z', fill: '#5f9243' }],
  ],

  // ---- किराना -------------------------------------------------------------------
  'art-wheat': [
    ['rect', { x: '15', y: '19', width: '34', height: '37', rx: '4', fill: '#ead9b6' }],
    ['path', { d: 'M15 23c6-4 12-6 17-6s11 2 17 6v4H15z', fill: '#d8c294' }],
    ['rect', { x: '21', y: '32', width: '22', height: '15', rx: '3', fill: '#b8873c' }],
    ['path', { d: 'M32 34v11m0-9l3-2m-3 5l3-2m-3 5l3-2m-3-6l-3-2m3 5l-3-2m3 5l-3-2', stroke: '#f3e6c8', 'stroke-width': '1.8', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-grain': [
    ['path', { d: 'M20 25h24c4 6 6 13 6 19 0 7-8 11-18 11s-18-4-18-11c0-6 2-13 6-19z', fill: '#cdb488' }],
    ['path', { d: 'M20 25c3-4 8-6 12-6s9 2 12 6z', fill: '#a98f63' }],
    ['ellipse', { cx: '32', cy: '43', rx: '9', ry: '7', fill: '#f5efe2' }],
    ['path', { d: 'M28 42h2m3 0h2m-6 3h2m3 0h2', stroke: '#c9b58c', 'stroke-width': '2', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-bowl': [
    ['path', { d: 'M12 32h40c0 12-9 20-20 20s-20-8-20-20z', fill: '#c3cfd2' }],
    ['path', { d: 'M15 40h34c-3 8-9 12-17 12s-14-4-17-12z', fill: '#a5b3b7' }],
    ['ellipse', { cx: '32', cy: '32', rx: '20', ry: '6', fill: '#e0ab45' }],
    ['path', { d: 'M7 32h50', stroke: '#8c9a9e', 'stroke-width': '3.4', 'stroke-linecap': 'round' }],
  ],
  'art-bowl-spoon': [
    ['path', { d: 'M9 32h36c0 11-8 19-18 19s-18-8-18-19z', fill: '#c3cfd2' }],
    ['path', { d: 'M12 40h30c-3 7-8 11-15 11s-12-4-15-11z', fill: '#a5b3b7' }],
    ['ellipse', { cx: '27', cy: '32', rx: '18', ry: '5.5', fill: '#b8442c' }],
    ['path', { d: 'M43 47l9-21', stroke: '#a9793c', 'stroke-width': '4', 'stroke-linecap': 'round' }],
    ['ellipse', { cx: '53', cy: '21', rx: '6', ry: '4.5', fill: '#c2914b', transform: 'rotate(-25 53 21)' }],
  ],
  'art-bottle': [
    ['rect', { x: '26', y: '7', width: '12', height: '7', rx: '2', fill: '#8a6224' }],
    ['path', { d: 'M27 13h10v8c6 3 9 8 9 14v17a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5V35c0-6 3-11 9-14z', fill: '#e6b23c' }],
    ['rect', { x: '22', y: '34', width: '20', height: '13', rx: '2', fill: '#f8efd6' }],
    ['path', { d: 'M27 40h10', stroke: '#c08f2a', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
  ],
  'art-droplet': [
    ['path', { d: 'M32 9c9 13 15 21 15 28 0 9-7 15-15 15s-15-6-15-15c0-7 6-15 15-28z', fill: '#dfa03f' }],
    ['path', { d: 'M25 39c0 6 3 9 7 10', stroke: '#f2d68a', 'stroke-width': '3.4', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-milk': [
    ['path', { d: 'M20 23h24v29a5 5 0 0 1-5 5H25a5 5 0 0 1-5-5z', fill: '#eef2f4' }],
    ['path', { d: 'M20 23l6-11h12l6 11z', fill: '#cfe2ea' }],
    ['rect', { x: '24', y: '33', width: '16', height: '13', rx: '2', fill: '#5b8fa8' }],
    ['path', { d: 'M28 39h8', stroke: '#eef2f4', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
  ],
  'art-egg': [
    ['ellipse', { cx: '42', cy: '40', rx: '11', ry: '13', fill: '#c9b48c' }],
    ['ellipse', { cx: '24', cy: '38', rx: '12', ry: '15', fill: '#eaddc0' }],
    ['path', { d: 'M19 33c1-4 3-6 6-7', stroke: '#fbf7ec', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-bread': [
    ['path', { d: 'M12 31c0-9 9-15 20-15s20 6 20 15v17a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z', fill: '#d79a52' }],
    ['path', { d: 'M17 32c0-6 7-11 15-11s15 5 15 11z', fill: '#eabb7c' }],
    ['path', { d: 'M22 41h20m-20 6h20', stroke: '#c0873f', 'stroke-width': '2.6', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-cookie': [
    ['circle', { cx: '32', cy: '34', r: '19', fill: '#c08843' }],
    ['circle', { cx: '32', cy: '34', r: '15', fill: '#dba85f' }],
    ['circle', { cx: '27', cy: '29', r: '2', fill: '#8a5f28' }],
    ['circle', { cx: '37', cy: '31', r: '2', fill: '#8a5f28' }],
    ['circle', { cx: '30', cy: '39', r: '2', fill: '#8a5f28' }],
    ['circle', { cx: '38', cy: '40', r: '2', fill: '#8a5f28' }],
  ],
  'art-candy': [
    ['path', { d: 'M18 31l-9-7v21l9-7z', fill: '#e0805f' }],
    ['path', { d: 'M46 31l9-7v21l-9-7z', fill: '#e0805f' }],
    ['rect', { x: '18', y: '25', width: '28', height: '19', rx: '6', fill: '#c9503a' }],
    ['path', { d: 'M26 31l12 7m0-7l-12 7', stroke: '#eec6b8', 'stroke-width': '2.6', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-cake': [
    ['path', { d: 'M14 37h36v14a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5z', fill: '#e6c79e' }],
    ['path', { d: 'M14 37c0-6 8-11 18-11s18 5 18 11c-4 4-8 1-12 3s-8 2-12 0-8 1-12-3z', fill: '#e0805f' }],
    ['rect', { x: '30', y: '15', width: '4', height: '10', rx: '2', fill: '#f0d777' }],
    ['path', { d: 'M32 11c2 2 2 4 0 5-2-1-2-3 0-5z', fill: '#dd8a33' }],
  ],
  'art-cup': [
    ['path', { d: 'M44 31h4a6 6 0 0 1 0 12h-5', fill: 'none', stroke: '#b0764a', 'stroke-width': '4' }],
    ['path', { d: 'M14 27h30v14c0 8-6 13-15 13s-15-5-15-13z', fill: '#c58a5c' }],
    ['path', { d: 'M17 40h24c-1 7-6 11-12 11s-11-4-12-11z', fill: '#a9713f' }],
    ['ellipse', { cx: '29', cy: '28', rx: '15', ry: '4.4', fill: '#6b4522' }],
    ['path', { d: 'M24 16c-2 3 2 5 0 8m10-9c-2 3 2 5 0 8', stroke: '#d3ddd7', 'stroke-width': '2.6', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-coffee': [
    ['path', { d: 'M44 31h4a6 6 0 0 1 0 12h-5', fill: 'none', stroke: '#b8ac92', 'stroke-width': '4' }],
    ['path', { d: 'M14 27h30v14c0 8-6 13-15 13s-15-5-15-13z', fill: '#d2c7ad' }],
    ['ellipse', { cx: '29', cy: '28', rx: '15', ry: '4.4', fill: '#5d3f21' }],
  ],
  'art-glass-full': [
    ['path', { d: 'M20 15h24l-3 38a5 5 0 0 1-5 4h-8a5 5 0 0 1-5-4z', fill: '#e4eef2' }],
    ['path', { d: 'M22 29h20l-2 24a5 5 0 0 1-5 4h-6a5 5 0 0 1-5-4z', fill: '#dd8a33' }],
    ['path', { d: 'M26 20v-8', stroke: '#9aa5a0', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
  ],
  'art-cheese': [
    ['path', { d: 'M12 29l40-11v25a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z', fill: '#f0e4c0' }],
    ['path', { d: 'M12 29l40-11v5l-40 11z', fill: '#ddcc9c' }],
    ['circle', { cx: '23', cy: '38', r: '3', fill: '#ddcc9c' }],
    ['circle', { cx: '35', cy: '35', r: '2.4', fill: '#ddcc9c' }],
    ['circle', { cx: '42', cy: '41', r: '3', fill: '#ddcc9c' }],
  ],

  // ---- खाने-पीने की दुकान -------------------------------------------------------
  'art-burger': [
    ['path', { d: 'M12 27c0-8 9-14 20-14s20 6 20 14z', fill: '#d79a52' }],
    ['rect', { x: '12', y: '28', width: '40', height: '6', rx: '3', fill: '#8fae63' }],
    ['rect', { x: '12', y: '34', width: '40', height: '7', rx: '3', fill: '#a4543a' }],
    ['path', { d: 'M12 42h40c0 7-6 11-20 11s-20-4-20-11z', fill: '#d79a52' }],
    ['circle', { cx: '24', cy: '21', r: '1.7', fill: '#f6e6c8' }],
    ['circle', { cx: '33', cy: '18', r: '1.7', fill: '#f6e6c8' }],
    ['circle', { cx: '41', cy: '22', r: '1.7', fill: '#f6e6c8' }],
  ],
  'art-pizza': [
    ['path', { d: 'M32 11l21 37a3 3 0 0 1-3 5H14a3 3 0 0 1-3-5z', fill: '#e6c79e' }],
    ['path', { d: 'M32 20l16 28H16z', fill: '#dd8a33' }],
    ['circle', { cx: '27', cy: '38', r: '3', fill: '#c9503a' }],
    ['circle', { cx: '37', cy: '40', r: '3', fill: '#c9503a' }],
    ['circle', { cx: '32', cy: '29', r: '2.6', fill: '#c9503a' }],
  ],

  // ---- साबुन-सफ़ाई ----------------------------------------------------------------
  'art-wash': [
    ['rect', { x: '12', y: '29', width: '40', height: '22', rx: '6', fill: '#5b8fa8' }],
    ['rect', { x: '12', y: '29', width: '40', height: '8', rx: '4', fill: '#8bb4c8' }],
    ['circle', { cx: '22', cy: '20', r: '5', fill: '#dceaf1' }],
    ['circle', { cx: '33', cy: '15', r: '3.4', fill: '#dceaf1' }],
    ['circle', { cx: '41', cy: '21', r: '4', fill: '#dceaf1' }],
  ],
  'art-spray': [
    ['path', { d: 'M27 17l-11-4v7l11 2z', fill: '#3f6d85' }],
    ['rect', { x: '27', y: '14', width: '10', height: '11', rx: '2', fill: '#3f6d85' }],
    ['path', { d: 'M24 25h16v27a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z', fill: '#5b8fa8' }],
    ['rect', { x: '27', y: '33', width: '10', height: '13', rx: '2', fill: '#eef2f4' }],
  ],

  // ---- दवाई ---------------------------------------------------------------------
  'art-pill': [
    ['rect', { x: '10', y: '22', width: '44', height: '22', rx: '5', fill: '#cdd7d2' }],
    ['circle', { cx: '21', cy: '29', r: '4', fill: '#f6f8f7' }],
    ['circle', { cx: '32', cy: '29', r: '4', fill: '#f6f8f7' }],
    ['circle', { cx: '43', cy: '29', r: '4', fill: '#f6f8f7' }],
    ['circle', { cx: '21', cy: '38', r: '4', fill: '#f6f8f7' }],
    ['circle', { cx: '32', cy: '38', r: '4', fill: '#f6f8f7' }],
    ['circle', { cx: '43', cy: '38', r: '4', fill: '#f6f8f7' }],
  ],
  'art-capsule': [
    ['rect', { x: '14', y: '26', width: '18', height: '16', rx: '8', fill: '#e0b062', transform: 'rotate(-32 32 34)' }],
    ['rect', { x: '32', y: '26', width: '18', height: '16', rx: '8', fill: '#c2603f', transform: 'rotate(-32 32 34)' }],
  ],
  'art-medicine-syrup': [
    ['rect', { x: '27', y: '11', width: '10', height: '11', rx: '2', fill: '#8a4a2c' }],
    ['rect', { x: '20', y: '21', width: '24', height: '33', rx: '5', fill: '#c2603f' }],
    ['rect', { x: '24', y: '31', width: '16', height: '15', rx: '2', fill: '#f8f1e4' }],
    ['path', { d: 'M28 37h8m-8 5h8', stroke: '#c2603f', 'stroke-width': '2.2', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-first-aid-kit': [
    ['path', { d: 'M24 25v-4a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v4', fill: 'none', stroke: '#a4432f', 'stroke-width': '4' }],
    ['rect', { x: '10', y: '25', width: '44', height: '28', rx: '5', fill: '#c9503a' }],
    ['path', { d: 'M29 32h6v5h5v6h-5v5h-6v-5h-5v-6h5z', fill: '#f8f1e4' }],
  ],

  // ---- कपड़े-जूते ------------------------------------------------------------------
  'art-shirt': [
    ['path', { d: 'M24 14l8 6 8-6 13 7-4 11-4-2v24a2 2 0 0 1-2 2H21a2 2 0 0 1-2-2V30l-4 2-4-11z', fill: '#5b8fa8' }],
    ['path', { d: 'M24 14l8 6 8-6-4-2h-8z', fill: '#3f6d85' }],
  ],
  'art-shoe': [
    ['path', { d: 'M10 43c0-6 3-11 8-14l8-5 5 8 12 3c8 2 11 5 11 9v2H14a4 4 0 0 1-4-3z', fill: '#5f6f66' }],
    ['path', { d: 'M10 45h44v4a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z', fill: '#3d4a44' }],
    ['path', { d: 'M28 30l4 6m3-4l4 5', stroke: '#8d9a93', 'stroke-width': '2.4', 'stroke-linecap': 'round', fill: 'none' }],
  ],

  // ---- घर, खेत, गाड़ी -------------------------------------------------------------
  'art-bulb': [
    ['path', { d: 'M32 11c9 0 16 7 16 15 0 6-3 9-6 12-2 2-3 4-3 6H25c0-2-1-4-3-6-3-3-6-6-6-12 0-8 7-15 16-15z', fill: '#e6c35c' }],
    ['path', { d: 'M32 11c-5 4-8 9-8 15 0 6 2 11 5 14-4-3-7-6-7-14 0-6 3-11 10-15z', fill: '#f0d78c' }],
    ['rect', { x: '25', y: '45', width: '14', height: '5', rx: '2', fill: '#9aa5a0' }],
    ['rect', { x: '27', y: '50', width: '10', height: '4', rx: '2', fill: '#7d8882' }],
  ],
  'art-package': [
    ['path', { d: 'M32 11l22 11v20L32 53 10 42V22z', fill: '#c9954a' }],
    ['path', { d: 'M10 22l22 11 22-11', fill: 'none', stroke: '#8a6224', 'stroke-width': '3' }],
    ['path', { d: 'M32 33v20', stroke: '#8a6224', 'stroke-width': '3' }],
    ['path', { d: 'M21 16l22 11', stroke: '#e0b062', 'stroke-width': '3' }],
  ],
  'art-tool': [
    ['path', { d: 'M45 11a13 13 0 0 0-12 17L15 46a5.5 5.5 0 0 0 8 8l18-18a13 13 0 0 0 15-18l-8 8-7-1-1-7z', fill: '#8f9a94' }],
    ['path', { d: 'M20 47a2.4 2.4 0 1 1 0 .1z', fill: '#f1ece0' }],
  ],
  'art-leaf': [
    ['path', { d: 'M51 13C28 13 13 26 13 42c0 5 1 8 3 10 13 2 35-6 35-39z', fill: '#5f9243' }],
    ['path', { d: 'M46 18C34 26 25 37 21 49', stroke: '#3f6b3a', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-plant-2': [
    ['path', { d: 'M14 52h36', stroke: '#8a6224', 'stroke-width': '5', 'stroke-linecap': 'round' }],
    ['path', { d: 'M32 52V30', stroke: '#4f8046', 'stroke-width': '3.4', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M32 34c-9 0-15-6-16-15 10-1 16 5 16 15z', fill: '#5f9243' }],
    ['path', { d: 'M32 39c8 0 14-5 15-13-9-1-15 4-15 13z', fill: '#84b167' }],
  ],
  'art-flask': [
    ['rect', { x: '24', y: '8', width: '16', height: '5', rx: '2', fill: '#9aa5a0' }],
    ['path', { d: 'M26 12h12v13l12 21a5 5 0 0 1-4 8H18a5 5 0 0 1-4-8l12-21z', fill: '#dceaf1' }],
    ['path', { d: 'M20 37h24l6 9a5 5 0 0 1-4 8H18a5 5 0 0 1-4-8z', fill: '#5f9243' }],
  ],
  'art-test-pipe': [
    ['rect', { x: '22', y: '7', width: '18', height: '5', rx: '2', fill: '#9aa5a0', transform: 'rotate(20 31 9)' }],
    ['path', { d: 'M24 10h13v38a6.5 6.5 0 0 1-13 0z', fill: '#dceaf1', transform: 'rotate(20 31 30)' }],
    ['path', { d: 'M24 33h13v15a6.5 6.5 0 0 1-13 0z', fill: '#c2603f', transform: 'rotate(20 31 30)' }],
  ],
  'art-car': [
    ['path', { d: 'M11 41v-7l5-12a6 6 0 0 1 6-4h20a6 6 0 0 1 6 4l5 12v7z', fill: '#5b8fa8' }],
    ['path', { d: 'M21 23h22l3 9H18z', fill: '#dceaf1' }],
    ['circle', { cx: '20', cy: '43', r: '5.5', fill: '#3d4a44' }],
    ['circle', { cx: '44', cy: '43', r: '5.5', fill: '#3d4a44' }],
  ],
  'art-scooter': [
    ['circle', { cx: '17', cy: '44', r: '8', fill: '#3d4a44' }],
    ['circle', { cx: '47', cy: '44', r: '8', fill: '#3d4a44' }],
    ['path', { d: 'M17 44h22l8-17h5', fill: 'none', stroke: '#4f8046', 'stroke-width': '5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ['rect', { x: '20', y: '26', width: '16', height: '9', rx: '3', fill: '#6d9a56' }],
  ],
  'art-tractor': [
    ['path', { d: 'M14 36v-9h13l4-10h11v19z', fill: '#5f9243' }],
    ['circle', { cx: '21', cy: '43', r: '10', fill: '#3d4a44' }],
    ['circle', { cx: '21', cy: '43', r: '4', fill: '#7d8882' }],
    ['circle', { cx: '46', cy: '46', r: '7', fill: '#3d4a44' }],
    ['circle', { cx: '46', cy: '46', r: '2.8', fill: '#7d8882' }],
  ],
  'art-flame': [
    ['path', { d: 'M32 8c10 10 16 18 16 27 0 11-7 18-16 18s-16-7-16-18c0-7 3-12 8-17 1 5 3 8 5 8 2 0 3-8 3-18z', fill: '#dd8a33' }],
    ['path', { d: 'M32 34c4 5 6 8 6 12 0 4-3 7-6 7s-6-3-6-7c0-4 2-7 6-12z', fill: '#e6c35c' }],
  ],
  'art-sparkles': [
    ['path', { d: 'M28 11l5 13 13 5-13 5-5 13-5-13-13-5 13-5z', fill: '#dfa03f' }],
    ['path', { d: 'M48 36l2.6 6.4 6.4 2.6-6.4 2.6L48 54l-2.6-6.4-6.4-2.6 6.4-2.6z', fill: '#e8b45c' }],
  ],
  // ---- सेहत, मरम्मत, खेत और त्योहार ---------------------------------------------
  'art-report-medical': [
    ['path', { d: 'M16 10h26l8 8v38a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z', fill: '#f2ede0' }],
    ['path', { d: 'M42 10l8 8h-8z', fill: '#d5cdb8' }],
    ['path', { d: 'M28 27h6v6h6v6h-6v6h-6v-6h-6v-6h6z', fill: '#c9503a' }],
    ['path', { d: 'M20 51h22', stroke: '#c8bfa8', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
  ],
  'art-stethoscope': [
    ['path', { d: 'M18 12v12a10 10 0 0 0 20 0V12', fill: 'none', stroke: '#4f7a8c', 'stroke-width': '4', 'stroke-linecap': 'round' }],
    ['path', { d: 'M28 34v8a11 11 0 0 0 22 0v-4', fill: 'none', stroke: '#4f7a8c', 'stroke-width': '4', 'stroke-linecap': 'round' }],
    ['circle', { cx: '50', cy: '28', r: '7', fill: '#c9503a' }],
    ['circle', { cx: '18', cy: '11', r: '3.4', fill: '#3f6d85' }],
    ['circle', { cx: '38', cy: '11', r: '3.4', fill: '#3f6d85' }],
  ],
  'art-heart-rate-monitor': [
    ['rect', { x: '9', y: '17', width: '46', height: '31', rx: '5', fill: '#3f6d85' }],
    ['rect', { x: '14', y: '22', width: '36', height: '21', rx: '3', fill: '#dceaf1' }],
    ['path', { d: 'M18 33h6l4-7 5 14 4-7h9', fill: 'none', stroke: '#c9503a', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
  ],
  'art-virus': [
    ['circle', { cx: '32', cy: '33', r: '15', fill: '#a4543a' }],
    ['path', { d: 'M32 18V9m0 48v-9m-14-15H9m46 0h-9M22 23l-6-6m32 32l6 6m0-38l-6 6M22 43l-6 6', stroke: '#a4543a', 'stroke-width': '4', 'stroke-linecap': 'round' }],
    ['circle', { cx: '27', cy: '29', r: '3', fill: '#e0b062' }],
    ['circle', { cx: '37', cy: '36', r: '3', fill: '#e0b062' }],
  ],
  'art-dental': [
    ['path', { d: 'M20 12c4 0 6 2 12 2s8-2 12-2c5 0 8 4 8 10 0 9-3 16-5 22-1 4-3 6-5 6-3 0-4-4-5-9-1-4-2-6-5-6s-4 2-5 6c-1 5-2 9-5 9-2 0-4-2-5-6-2-6-5-13-5-22 0-6 3-10 8-10z', fill: '#f2f0e6' }],
    ['path', { d: 'M20 18c3 0 5 2 7 4', stroke: '#d3cfbc', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' }],
  ],
  'art-bone': [
    ['rect', { x: '20', y: '28', width: '24', height: '9', rx: '4.5', fill: '#e6dcc4', transform: 'rotate(-30 32 32)' }],
    ['circle', { cx: '18', cy: '35', r: '6.5', fill: '#e6dcc4' }],
    ['circle', { cx: '18', cy: '44', r: '6.5', fill: '#e6dcc4' }],
    ['circle', { cx: '46', cy: '20', r: '6.5', fill: '#e6dcc4' }],
    ['circle', { cx: '46', cy: '29', r: '6.5', fill: '#e6dcc4' }],
    ['path', { d: 'M25 37l14-8', stroke: '#cdbf9e', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
  ],
  'art-wall': [
    ['rect', { x: '9', y: '18', width: '46', height: '10', rx: '2', fill: '#c07a55' }],
    ['rect', { x: '9', y: '30', width: '22', height: '10', rx: '2', fill: '#ac6a48' }],
    ['rect', { x: '33', y: '30', width: '22', height: '10', rx: '2', fill: '#ac6a48' }],
    ['rect', { x: '9', y: '42', width: '46', height: '10', rx: '2', fill: '#c07a55' }],
  ],
  'art-shovel': [
    ['rect', { x: '26', y: '6', width: '12', height: '6', rx: '3', fill: '#8f9a94' }],
    ['rect', { x: '29', y: '9', width: '6', height: '27', rx: '3', fill: '#a9793c' }],
    ['path', { d: 'M22 34h20v11c0 7-4 12-10 12s-10-5-10-12z', fill: '#8f9a94' }],
    ['path', { d: 'M22 40h20v5c0 7-4 12-10 12s-10-5-10-12z', fill: '#78847e' }],
  ],
  'art-bolt': [
    ['path', { d: 'M36 7L16 35h12l-4 22 22-30H34z', fill: '#e6c35c' }],
    ['path', { d: 'M36 7L16 35h6L36 13z', fill: '#f0d78c' }],
  ],
  'art-candle': [
    ['rect', { x: '25', y: '22', width: '14', height: '32', rx: '3', fill: '#f0e6cf' }],
    ['rect', { x: '25', y: '22', width: '6', height: '32', rx: '3', fill: '#e0d2b4' }],
    ['path', { d: 'M32 20c4-4 5-8 3-12-4 3-6 7-3 12z', fill: '#dd8a33' }],
    ['path', { d: 'M32 20c2-2 2-4 1-6-2 2-3 4-1 6z', fill: '#e6c35c' }],
  ],
  'art-flare': [
    ['path', { d: 'M18 52L44 26', stroke: '#a9793c', 'stroke-width': '6', 'stroke-linecap': 'round' }],
    ['path', { d: 'M46 24l4-4m-2 10l6-2m-14-10l2-6', stroke: '#dd8a33', 'stroke-width': '4', 'stroke-linecap': 'round' }],
    ['circle', { cx: '45', cy: '25', r: '6', fill: '#e6c35c' }],
  ],
  'art-balloon': [
    ['path', { d: 'M24 10c7 0 12 6 12 14 0 9-7 16-12 16s-12-7-12-16c0-8 5-14 12-14z', fill: '#c9503a' }],
    ['path', { d: 'M24 40c3 6 1 10-2 14', fill: 'none', stroke: '#c8bfa8', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
    ['path', { d: 'M45 22c6 0 10 5 10 12s-6 13-10 13-10-6-10-13 4-12 10-12z', fill: '#5b8fa8' }],
    ['path', { d: 'M45 47c2 5 1 8-2 11', fill: 'none', stroke: '#c8bfa8', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
  ],
  'art-gift': [
    ['rect', { x: '10', y: '24', width: '44', height: '10', rx: '3', fill: '#c9503a' }],
    ['rect', { x: '14', y: '34', width: '36', height: '21', rx: '3', fill: '#b8442c' }],
    ['rect', { x: '28', y: '24', width: '8', height: '31', fill: '#e0b062' }],
    ['path', { d: 'M32 24c-6 0-11-3-11-7s6-5 8-2 3 6 3 9zm0 0c6 0 11-3 11-7s-6-5-8-2-3 6-3 9z', fill: '#e0b062' }],
  ],
  'art-paint': [
    ['path', { d: 'M16 24h32v27a5 5 0 0 1-5 5H21a5 5 0 0 1-5-5z', fill: '#8f9a94' }],
    ['path', { d: 'M16 24c0-5 7-9 16-9s16 4 16 9z', fill: '#a8b2ad' }],
    ['path', { d: 'M20 34h24v17a3 3 0 0 1-3 3H23a3 3 0 0 1-3-3z', fill: '#5b8fa8' }],
    ['path', { d: 'M48 20c6-2 10 1 10 6', fill: 'none', stroke: '#8f9a94', 'stroke-width': '3.4', 'stroke-linecap': 'round' }],
  ],
  'art-plant': [
    ['path', { d: 'M18 34h28l-3 19a4 4 0 0 1-4 3H25a4 4 0 0 1-4-3z', fill: '#c07a55' }],
    ['rect', { x: '15', y: '28', width: '34', height: '8', rx: '3', fill: '#ac6a48' }],
    ['path', { d: 'M32 28V16', stroke: '#4f8046', 'stroke-width': '3.4', 'stroke-linecap': 'round' }],
    ['path', { d: 'M32 20c-8 0-13-5-13-12 9-1 13 4 13 12z', fill: '#5f9243' }],
    ['path', { d: 'M32 24c7 0 12-5 12-11-8-1-12 4-12 11z', fill: '#84b167' }],
  ],
  // The same picture serves both names — at 40 px a bike and a scooter are one drawing.
  'art-motorbike': [
    ['circle', { cx: '17', cy: '44', r: '8', fill: '#3d4a44' }],
    ['circle', { cx: '47', cy: '44', r: '8', fill: '#3d4a44' }],
    ['path', { d: 'M17 44h22l8-17h5', fill: 'none', stroke: '#4f8046', 'stroke-width': '5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ['rect', { x: '20', y: '26', width: '16', height: '9', rx: '3', fill: '#6d9a56' }],
  ],
};
