# App icons

`icon.svg` ek placeholder hai — brand green background (`--g-700 #166b3c`) + "फ" letter —
sirf isliye taaki asli logo aane se pehle bhi manifest/PWA icons kaam karte rahein.

## Launch se pehle owner ko karna hai (NEXT-STEPS.md me bhi likha hai)

1. Asli logo se do PNG banayein:
   - `icon-192.png` (192×192)
   - `icon-512.png` (512×512)
   Safe padding rakhein — Android adaptive icons beech ka sirf ~66% hi dikhate hain, poora
   canvas edge-to-edge logo se na bharein.
2. Dono files yahi folder me rakhein:
   - `public/icons/icon-192.png`
   - `public/icons/icon-512.png`
3. `manifest.ts` aur root `layout.tsx` sirf in do PNG files ko reference karte hain —
   `icon.svg` sirf editing/reference ke liye hai, ise rehne dein ya replace kar dein.

Koi bhi free tool chalega — Figma, Photopea, ya command line se `sharp`/`squoosh-cli` se resize.
Rang aur design tokens `src/styles/globals.css` me hain.
