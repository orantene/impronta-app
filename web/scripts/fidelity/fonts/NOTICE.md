# Self-hosted fidelity fonts

These woff2 files are the **latin** subset (variable, weight 400–700) of registry
faces, downloaded from Google Fonts and committed so the fidelity harness renders
the real registry faces offline and deterministically (the standalone capture HTML
is not a Next.js page, so `next/font`'s `var(--font-*)` do not exist — see
`../fonts-bridge.ts`).

All faces are licensed under the **SIL Open Font License 1.1**
(<https://openfontlicense.org>), which permits bundling/redistribution:

| File | Family | Source |
|---|---|---|
| `geist.woff2` | Geist | Vercel — OFL-1.1 |
| `geist-mono.woff2` | Geist Mono | Vercel — OFL-1.1 |
| `raleway.woff2` | Raleway | Google Fonts — OFL-1.1 |
| `inter.woff2` | Inter | rsms — OFL-1.1 |
| `cinzel.woff2` | Cinzel | Google Fonts — OFL-1.1 |
| `playfair-display.woff2` | Playfair Display | Google Fonts — OFL-1.1 |
| `fraunces.woff2` | Fraunces | Undercase Type — OFL-1.1 |

These are test/CI assets for the builder fidelity harness only; they are not
served to end users (production text uses `next/font`). To refresh, re-download the
`/* latin */` subset from `https://fonts.googleapis.com/css2?family=<Family>` with a
desktop UA and overwrite the file.
