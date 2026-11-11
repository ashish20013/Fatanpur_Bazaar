import type { IconNode } from './icon-data';

/**
 * Coloured category art, drawn for this shop.
 *
 * The rest of the icon set is thin monochrome line work — right for buttons and labels, but on the
 * category rail it made twenty identical grey-green circles that a customer's eye slides straight
 * past. The big grocery apps solve this with a small COLOURED picture per category, and they are
 * right: colour is what lets someone find "दवाई" on a moving rail without reading.
 *
 * So these are filled and coloured rather than stroked, on a 64×64 box. They live in the shared
 * sprite like every other icon, so twenty of them on a page cost one cached file and twenty
 * `<use>` references — not twenty copies of path data in the HTML.
 *
 * Rules kept across the set so they read as one family:
 *   • one clear object, centred, filling roughly 44 of the 64 units
 *   • flat fills, no gradients, no outlines — a gradient turns to mud at 40 px on a cheap screen
 *   • a muted palette from the site's own tokens; nothing neon
 *   • one darker shade per object for depth, never more than four colours
 */
export const CATEGORY_ART: Record<string, IconNode> = {
  // किराना — a full shopping basket
  'cat-kirana': [
    ['path', { d: 'M14 24h36l-4 26a6 6 0 0 1-6 5H24a6 6 0 0 1-6-5z', fill: '#e0b062' }],
    ['path', { d: 'M14 24h36l-1.2 8H15.2z', fill: '#c9954a' }],
    ['path', { d: 'M24 24l4-12h8l4 12', fill: 'none', stroke: '#8a6224', 'stroke-width': '3.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ['circle', { cx: '27', cy: '42', r: '4.4', fill: '#7fa86a' }],
    ['circle', { cx: '38', cy: '45', r: '5', fill: '#c2603f' }],
  ],
  // फल-सब्ज़ी — a tomato beside a leafy head
  'cat-fal-sabzi': [
    ['circle', { cx: '25', cy: '40', r: '15', fill: '#c9503a' }],
    ['path', { d: 'M25 25c-3-3-7-4-10-3 1 3 4 5 7 5zm0 0c3-3 7-4 10-3-1 3-4 5-7 5z', fill: '#4f8046' }],
    ['path', { d: 'M46 52c-6 0-10-5-10-11s4-11 10-11 10 5 10 11-4 11-10 11z', fill: '#6d9a56' }],
    ['path', { d: 'M46 30V19', stroke: '#4f8046', 'stroke-width': '3.2', 'stroke-linecap': 'round' }],
    ['path', { d: 'M46 23c4-5 9-6 13-4-2 5-7 7-13 6z', fill: '#4f8046' }],
  ],
  // फ़ास्ट फ़ूड — a burger
  'cat-fast-food': [
    ['path', { d: 'M12 26c0-8 9-14 20-14s20 6 20 14z', fill: '#d79a52' }],
    ['rect', { x: '12', y: '27', width: '40', height: '6', rx: '3', fill: '#8fae63' }],
    ['rect', { x: '12', y: '33', width: '40', height: '7', rx: '3', fill: '#a4543a' }],
    ['path', { d: 'M12 41h40c0 7-6 11-20 11s-20-4-20-11z', fill: '#d79a52' }],
    ['circle', { cx: '24', cy: '20', r: '1.7', fill: '#f6e6c8' }],
    ['circle', { cx: '33', cy: '17', r: '1.7', fill: '#f6e6c8' }],
    ['circle', { cx: '41', cy: '21', r: '1.7', fill: '#f6e6c8' }],
  ],
  // मिठाई — laddus on a plate
  'cat-mithai': [
    ['path', { d: 'M8 46h48c0 6-11 9-24 9S8 52 8 46z', fill: '#cbb89a' }],
    ['circle', { cx: '23', cy: '36', r: '10', fill: '#dfa03f' }],
    ['circle', { cx: '41', cy: '36', r: '10', fill: '#dfa03f' }],
    ['circle', { cx: '32', cy: '25', r: '9', fill: '#e8b45c' }],
    ['circle', { cx: '20', cy: '34', r: '1.5', fill: '#b97f26' }],
    ['circle', { cx: '44', cy: '38', r: '1.5', fill: '#b97f26' }],
    ['circle', { cx: '32', cy: '23', r: '1.5', fill: '#b97f26' }],
  ],
  // बिजली का सामान — a lit bulb
  'cat-electronics': [
    ['path', { d: 'M32 10c9 0 16 7 16 15 0 6-3 9-6 12-2 2-3 4-3 6H25c0-2-1-4-3-6-3-3-6-6-6-12 0-8 7-15 16-15z', fill: '#e6c35c' }],
    ['path', { d: 'M25 43h14v4H25zm1 7h12l-2 4H28z', fill: '#9aa3a8' }],
    ['path', { d: 'M32 18l-5 11h5l-3 9 9-12h-5l3-8z', fill: '#f6e6c8' }],
  ],
  // सौंदर्य व देखभाल — a bottle and a compact
  'cat-beauty': [
    ['rect', { x: '14', y: '22', width: '16', height: '32', rx: '4', fill: '#c98fa6' }],
    ['rect', { x: '18', y: '13', width: '8', height: '10', rx: '2', fill: '#a76c84' }],
    ['rect', { x: '14', y: '32', width: '16', height: '8', fill: '#f0dce4' }],
    ['circle', { cx: '44', cy: '40', r: '13', fill: '#dfb9a0' }],
    ['circle', { cx: '44', cy: '40', r: '6', fill: '#b98673' }],
    ['path', { d: 'M44 27c3-6 8-9 13-8-1 6-6 9-13 9z', fill: '#c98fa6' }],
  ],
  // कपड़े — a shirt
  'cat-kapde': [
    ['path', { d: 'M24 14l8 6 8-6 13 7-4 11-6-2v22a2 2 0 0 1-2 2H23a2 2 0 0 1-2-2V30l-6 2-4-11z', fill: '#6b86c4' }],
    ['path', { d: 'M24 14l8 6 8-6-4-3h-8z', fill: '#48619b' }],
    ['path', { d: 'M27 36h10', stroke: '#48619b', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
  ],
  // जूते-चप्पल — a shoe
  'cat-joote-chappal': [
    ['path', { d: 'M10 44c0-6 1-12 3-18l10 3 2 6 8-2 4 5 13 3c6 1 8 4 8 8v3a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z', fill: '#7c624c' }],
    ['path', { d: 'M10 44h48v4a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z', fill: '#54402f' }],
    ['path', { d: 'M23 29l2 6 8-2', stroke: '#e3d2c0', 'stroke-width': '2.4', fill: 'none', 'stroke-linecap': 'round' }],
  ],
  // खेती-किसानी — a tractor
  'cat-kheti': [
    ['rect', { x: '26', y: '20', width: '16', height: '13', rx: '2', fill: '#6d9a56' }],
    ['path', { d: 'M20 33h28v9H20z', fill: '#4f8046' }],
    ['circle', { cx: '20', cy: '45', r: '9', fill: '#3c3a36' }],
    ['circle', { cx: '20', cy: '45', r: '3.6', fill: '#9aa79c' }],
    ['circle', { cx: '45', cy: '47', r: '6.5', fill: '#3c3a36' }],
    ['circle', { cx: '45', cy: '47', r: '2.6', fill: '#9aa79c' }],
    ['rect', { x: '43', y: '25', width: '5', height: '9', rx: '1.5', fill: '#c9954a' }],
  ],
  // बिल्डिंग मटेरियल — a stack of bricks
  'cat-building-material': [
    ['rect', { x: '10', y: '36', width: '20', height: '9', rx: '1.5', fill: '#b5623f' }],
    ['rect', { x: '33', y: '36', width: '20', height: '9', rx: '1.5', fill: '#b5623f' }],
    ['rect', { x: '21', y: '47', width: '20', height: '9', rx: '1.5', fill: '#96482c' }],
    ['rect', { x: '21', y: '25', width: '20', height: '9', rx: '1.5', fill: '#c97a52' }],
    ['path', { d: 'M18 20h28l-4-8H22z', fill: '#8b8d86' }],
  ],
  // बॉडी चेकअप — test tubes
  'cat-body-checkup': [
    ['rect', { x: '18', y: '12', width: '11', height: '40', rx: '5.5', fill: '#cfe1e0' }],
    ['path', { d: 'M18 34h11v13a5.5 5.5 0 0 1-11 0z', fill: '#c9503a' }],
    ['rect', { x: '35', y: '18', width: '11', height: '34', rx: '5.5', fill: '#cfe1e0' }],
    ['path', { d: 'M35 38h11v9a5.5 5.5 0 0 1-11 0z', fill: '#e0b062' }],
    ['rect', { x: '16', y: '9', width: '15', height: '5', rx: '2.5', fill: '#7a9c9a' }],
    ['rect', { x: '33', y: '15', width: '15', height: '5', rx: '2.5', fill: '#7a9c9a' }],
  ],
  // डॉक्टर — a stethoscope
  'cat-doctor': [
    ['path', { d: 'M18 12v12a11 11 0 0 0 22 0V12', fill: 'none', stroke: '#3f7a8c', 'stroke-width': '5', 'stroke-linecap': 'round' }],
    ['path', { d: 'M29 35v6a11 11 0 0 0 22 0v-3', fill: 'none', stroke: '#3f7a8c', 'stroke-width': '5', 'stroke-linecap': 'round' }],
    ['circle', { cx: '51', cy: '31', r: '7', fill: '#c9503a' }],
    ['circle', { cx: '18', cy: '11', r: '3.6', fill: '#2c5c6b' }],
    ['circle', { cx: '40', cy: '11', r: '3.6', fill: '#2c5c6b' }],
  ],
  // दवाइयाँ — a capsule and tablets
  'cat-dawai': [
    ['path', { d: 'M17 29a11 11 0 0 1 15.6-15.6l14 14A11 11 0 0 1 31 43z', fill: '#5aa07a' }],
    ['path', { d: 'M24.8 21.2l14 14A11 11 0 0 1 31 43L17 29z', fill: '#e8eee9' }],
    ['circle', { cx: '44', cy: '46', r: '11', fill: '#e0b062' }],
    ['path', { d: 'M38 46h12', stroke: '#a87c2e', 'stroke-width': '2.8', 'stroke-linecap': 'round' }],
  ],
  // भाड़ा गाड़ी — a small delivery truck
  'cat-bhada-gadi': [
    ['rect', { x: '8', y: '24', width: '27', height: '20', rx: '2.5', fill: '#3f7a8c' }],
    ['path', { d: 'M35 30h11l8 9v5H35z', fill: '#6aa2b3' }],
    ['rect', { x: '38', y: '32', width: '7', height: '6', rx: '1', fill: '#d8e7ec' }],
    ['circle', { cx: '19', cy: '47', r: '7', fill: '#3c3a36' }],
    ['circle', { cx: '19', cy: '47', r: '2.8', fill: '#9aa79c' }],
    ['circle', { cx: '45', cy: '47', r: '7', fill: '#3c3a36' }],
    ['circle', { cx: '45', cy: '47', r: '2.8', fill: '#9aa79c' }],
  ],
  // घर की सेवाएँ — a spanner and a screwdriver
  'cat-ghar-sewa': [
    ['path', { d: 'M40 12a12 12 0 0 0-9 20l-14 14a4.5 4.5 0 0 0 6.4 6.4l14-14A12 12 0 0 0 52 20l-7 7-6-6z', fill: '#8b8d86' }],
    ['path', { d: 'M18 44l-6 6a4.5 4.5 0 0 0 6.4 6.4l6-6z', fill: '#5e6058' }],
    ['path', { d: 'M46 40l10 10a4 4 0 0 1-5.6 5.6L40 45.6z', fill: '#c9954a' }],
  ],
  // जन्मदिन — a cake
  'cat-birthday': [
    ['path', { d: 'M12 38h40v14a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z', fill: '#c98fa6' }],
    ['path', { d: 'M12 38c0-5 4-8 10-8h20c6 0 10 3 10 8 0 3-4 2-6 0s-5-2-7 0-5 2-7 0-5-2-7 0-6 3-6 0z', fill: '#f0dce4' }],
    ['rect', { x: '30', y: '16', width: '4', height: '14', rx: '1.5', fill: '#e8eee9' }],
    ['path', { d: 'M32 16c-2-2-2-4 0-6 2 2 2 4 0 6z', fill: '#e0b062' }],
  ],
  // पटाखे व दीपावली — a diya with its flame
  'cat-patakha': [
    ['path', { d: 'M12 40h40c0 8-9 13-20 13s-20-5-20-13z', fill: '#b5623f' }],
    ['path', { d: 'M12 40h40l-3-4H15z', fill: '#96482c' }],
    ['path', { d: 'M32 36c-4 0-7-3-7-7 0-5 7-12 7-12s7 7 7 12c0 4-3 7-7 7z', fill: '#e6a23c' }],
    ['path', { d: 'M32 33c-2 0-3.4-1.6-3.4-3.6 0-2.6 3.4-6.4 3.4-6.4s3.4 3.8 3.4 6.4c0 2-1.4 3.6-3.4 3.6z', fill: '#f6e6c8' }],
  ],
  // पशु डॉक्टर — a cow's head
  'cat-pashu-doctor': [
    ['path', { d: 'M14 22c-4-4-4-9 0-10 4-1 8 3 9 7zm36 0c4-4 4-9 0-10-4-1-8 3-9 7z', fill: '#b98673' }],
    ['path', { d: 'M32 16c10 0 18 7 18 16 0 10-8 18-18 18s-18-8-18-18c0-9 8-16 18-16z', fill: '#d8c3b4' }],
    ['ellipse', { cx: '32', cy: '42', rx: '10', ry: '8', fill: '#e8d5c8' }],
    ['circle', { cx: '28', cy: '41', r: '1.8', fill: '#7c624c' }],
    ['circle', { cx: '36', cy: '41', r: '1.8', fill: '#7c624c' }],
    ['circle', { cx: '25', cy: '28', r: '2.6', fill: '#5b463a' }],
    ['circle', { cx: '39', cy: '28', r: '2.6', fill: '#5b463a' }],
  ],
  // खाद-बीज भंडार — a sack with a sprout
  'cat-beej-bhandar': [
    ['path', { d: 'M20 26h24c3 9 4 17 3 24a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3c-1-7 0-15 3-24z', fill: '#c9b48a' }],
    ['path', { d: 'M20 26c2-4 6-6 12-6s10 2 12 6z', fill: '#a89468' }],
    ['path', { d: 'M32 48V36', stroke: '#4f8046', 'stroke-width': '3', 'stroke-linecap': 'round' }],
    ['path', { d: 'M32 38c-4-1-6-4-6-8 4 0 7 3 6 8zm0 0c4-1 6-4 6-8-4 0-7 3-6 8z', fill: '#6d9a56' }],
  ],
  // वीडियो पर डॉक्टर — a screen with a doctor and a cross
  'cat-doctor-consult': [
    ['rect', { x: '9', y: '15', width: '46', height: '32', rx: '4', fill: '#3f7a8c' }],
    ['rect', { x: '13', y: '19', width: '38', height: '24', rx: '2', fill: '#dceaef' }],
    ['circle', { cx: '27', cy: '28', r: '5', fill: '#3f7a8c' }],
    ['path', { d: 'M18 43c0-5 4-9 9-9s9 4 9 9z', fill: '#3f7a8c' }],
    ['path', { d: 'M42 24h4v5h5v4h-5v5h-4v-5h-5v-4h5z', fill: '#c9503a' }],
    ['rect', { x: '24', y: '49', width: '16', height: '4', rx: '2', fill: '#2c5c6b' }],
  ],
};
