# Fonts (self-hosted, SIL Open Font License 1.1)

| File | Family | Used for |
| --- | --- | --- |
| mukta-deva-400/600.woff2, mukta-latin-400/600.woff2 | Mukta (Ek Type) | Body text, buttons, prices |
| tiro-deva-400.woff2 | Tiro Devanagari Hindi (Tiro Typeworks) | Hindi headings |
| marcellus-latin-400.woff2 | Marcellus (Astigmatic) | English headings — same face as the logo |

Source: the `@fontsource/*` npm packages (Google Fonts builds). Licences are next to the files.
Only `mukta-deva-400` is preloaded; the heading faces use `font-display: optional`, so a slow first
visit shows Mukta and the page never jumps (CLS 0).
