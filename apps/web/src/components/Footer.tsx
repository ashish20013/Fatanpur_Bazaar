import type { ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';

/**
 * One line, at the very bottom of the page, and nothing else.
 *
 * The call-to-order offer and the app button moved to the sticky strip, which is where the person
 * who needs them can actually see them — nobody scrolls a shop to the end looking for help. What
 * is left is a credit, and a credit belongs at the end of the page in the smallest type on the
 * site. It is not sticky and never follows the customer: it appears when someone reaches the
 * bottom, which is the only moment it is worth anything.
 *
 * The address is deliberately not here (the owner's decision); it still reaches Google through the
 * LocalBusiness structured data the public layout emits on every page.
 */
export function Footer({ lang, credit }: { lang: Lang; credit: { name: string; email: string } }): ReactNode {
  // ⚠️ The two footer lines are fixed ENGLISH on the owner's instruction — they never translate,
  //    in Hindi or any other language. So they are written literally here, NOT through i18n. `lang`
  //    is kept in the signature only so the component's call site does not change.
  void lang;
  const year = new Date().getFullYear();
  // The maker's name comes from settings; fall back to the house name so the credit is never blank.
  const maker = credit.name?.trim() || 'ASK Infotech';
  return (
    <footer className="mt-3 bg-night text-[#e9e4d6]">
      {/* One thin line (owner's instruction). The only reason it is not razor-thin is the sticky
          call strip pinned to the bottom of the viewport — the line has to clear it, or it hides
          underneath with no scroll position that reveals it. So: a small top/bottom pad, plus just
          enough bottom clearance for the strip + the phone's home indicator. */}
      <p className="fb-container py-2 pb-[calc(env(safe-area-inset-bottom)+8px)] text-center text-[12px] leading-snug text-[#c9c5b8]">
        © {year} Fatanpur Bazaar · Developed and maintained by{' '}
        {credit.email ? (
          <a
            href={`mailto:${credit.email}`}
            className="text-[#e9e4d6] no-underline underline-offset-2 hover:text-au-300 hover:underline"
          >
            {maker}
          </a>
        ) : (
          maker
        )}
      </p>
    </footer>
  );
}
