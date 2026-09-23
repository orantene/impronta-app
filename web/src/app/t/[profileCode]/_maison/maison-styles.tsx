/**
 * MaisonStyles — the one stylesheet of the Maison profile template.
 *
 * v2 (2026-09-23) — WHITE FIRST, EDITORIAL, KINETIC. The beige wash and the
 * full-bleed burgundy block are gone. The page is white; photography carries
 * the colour; blush tints supporting surfaces and SELECTED states only; one
 * deep rose is reserved for the next step so the eye always finds it.
 *
 * Rules this sheet holds itself to:
 *   - Pills ONLY for category filters. Every other control is 10px.
 *   - Two radii: 10px (controls) and 18px (surfaces/media). Nothing else.
 *   - Hierarchy from type size, italic accents and whitespace — not from
 *     borders, cards and shadows. One shadow in the sheet (the booking sheet).
 *   - Motion is part of the design, not decoration: a staggered hero reveal,
 *     a service marquee, scroll-in sections, image scale on hover. EVERY rule
 *     collapses under prefers-reduced-motion, and nothing is hidden by
 *     JavaScript that JavaScript cannot restore (reveal targets start visible
 *     and are only armed once the runtime mounts).
 *
 * Namespaced `.mn-` under `.mn-root`. MOBILE FIRST: narrow rules first, media
 * queries only ADD desktop composition.
 */

export const MAISON_CSS = `
.mn-root {
  /* ── Every colour and font is a TOKEN REFERENCE ────────────────────────
     A Design supplies layout; a Look supplies colour and type. So nothing
     below may be a literal — each var reads a --token-* from the resolved
     theme and falls back to the value this template shipped with, which keeps
     the default appearance identical while letting any Look restyle the whole
     page. Derived shades use color-mix so they follow the token they are
     derived from instead of pinning a second literal.
     Contract: lib/site-admin/tokens/resolve.ts TOKEN_CSS_VARS. */
  --mn-white: var(--token-color-background, #FFFFFF);
  --mn-ink: var(--token-color-ink, #241F26);
  --mn-ink-2: var(--token-color-muted, #665F6B);
  --mn-rose: var(--token-color-primary, #A82458);
  --mn-blush: var(--token-color-accent, #F4D7E2);
  --mn-tint: var(--token-color-surface-raised, #FFF5F8);
  --mn-line: var(--token-color-line, #EDE8EB);

  --mn-rose-hover: color-mix(in oklab, var(--mn-rose) 84%, #000);
  --mn-blush-deep: color-mix(in oklab, var(--mn-blush) 78%, var(--mn-rose));
  --mn-tint-deep: color-mix(in oklab, var(--mn-tint) 86%, var(--mn-rose));
  --mn-line-strong: color-mix(in oklab, var(--mn-line) 62%, var(--mn-ink));

  --mn-display: var(--token-typography-heading-font-family, var(--font-fraunces), "Fraunces", Georgia, serif);
  --mn-sans: var(--token-typography-body-font-family, var(--font-inter-body), Inter, ui-sans-serif, system-ui, sans-serif);

  --mn-r: 10px;
  --mn-rs: 18px;
  --mn-gutter: 20px;
  --mn-max: 1280px;
  --mn-ease: cubic-bezier(0.22, 1, 0.36, 1);

  background: var(--mn-white);
  color: var(--mn-ink);
  font-family: var(--mn-sans);
  font-size: 16px; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}
.mn-root *, .mn-root *::before, .mn-root *::after { box-sizing: border-box; }
.mn-root :focus-visible { outline: 2px solid var(--mn-rose); outline-offset: 3px; border-radius: 4px; }
.mn-root img { display: block; }
.mn-shell { width: 100%; max-width: var(--mn-max); margin: 0 auto; padding-inline: var(--mn-gutter); }
.mn-section { padding-block: 80px; }
.mn-blush { background: var(--mn-tint); }

/* ── Type ─────────────────────────────────────────────────────────────── */
.mn-display { font-family: var(--mn-display); font-weight: 400; letter-spacing: -0.03em; line-height: 0.98; margin: 0; }
.mn-display em { font-style: italic; font-weight: 400; }
h1.mn-display { font-size: clamp(2.75rem, 12vw, 5.25rem); line-height: 1.0; }
h2.mn-display { font-size: clamp(2rem, 7vw, 3.125rem); }
h3.mn-display { font-size: 1.625rem; line-height: 1.15; letter-spacing: -0.02em; }
.mn-kicker { margin: 0 0 18px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mn-rose); }
.mn-lead { margin: 22px 0 0; font-size: 1.0625rem; line-height: 1.62; color: var(--mn-ink-2); max-width: 52ch; }
.mn-note { margin: 0; font-size: 0.875rem; line-height: 1.55; color: var(--mn-ink-2); }

/* ── Buttons ──────────────────────────────────────────────────────────── */
.mn-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 52px; padding: 0 30px; border-radius: var(--mn-r);
  font-family: inherit; font-size: 0.9375rem; font-weight: 500; letter-spacing: 0.005em;
  text-decoration: none; cursor: pointer;
  border: 1px solid transparent; position: relative; overflow: hidden;
  transition: background-color 200ms var(--mn-ease), color 200ms var(--mn-ease), border-color 200ms var(--mn-ease), transform 200ms var(--mn-ease);
}
.mn-btn:active { transform: translateY(1px); }
.mn-btn-primary { background: var(--mn-rose); color: var(--mn-on-primary, #fff); }
.mn-btn-primary:hover { background: var(--mn-rose-hover); }
.mn-btn-primary:hover { background: var(--mn-rose-hover); }
.mn-btn-quiet { background: transparent; color: var(--mn-ink); border-color: var(--mn-line-strong); }
.mn-btn-quiet:hover { border-color: var(--mn-ink); }
.mn-btn svg { transition: transform 260ms var(--mn-ease); }
.mn-btn:hover svg { transform: translateX(4px); }
.mn-slot { display: inline-flex; }
.mn-slot button, .mn-slot a {
  min-height: 52px !important; border-radius: var(--mn-r) !important; background: var(--mn-rose) !important;
  color: var(--mn-on-primary, #fff) !important; border: none !important; padding: 0 30px !important;
  font-family: var(--mn-sans) !important; font-size: 0.9375rem !important; font-weight: 500 !important; box-shadow: none !important;
}

/* ── Header ───────────────────────────────────────────────────────────── */
.mn-header { position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.86); backdrop-filter: saturate(180%) blur(14px); border-bottom: 1px solid transparent; transition: border-color 250ms ease, background-color 250ms ease; }
.mn-header[data-stuck="true"] { border-bottom-color: var(--mn-line); background: rgba(255,255,255,0.96); }
.mn-header-in { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 84px; }
.mn-wordmark { display: inline-flex; align-items: center; min-height: 56px; font-family: var(--mn-display); font-size: 1.4375rem; letter-spacing: -0.03em; color: var(--mn-ink); text-decoration: none; white-space: nowrap; }
.mn-wordmark em { font-style: italic; font-weight: 400; }
.mn-mark { height: 44px; width: auto; display: block; }
.mn-heart { width: 0.62em; height: 0.62em; color: var(--mn-brand-heart, #F17EB0); margin-inline: 0.28em; display: inline-block; vertical-align: 0.04em; }
.mn-nav { display: none; }
.mn-nav a { position: relative; display: inline-flex; align-items: center; min-height: 44px; font-size: 0.9375rem; color: var(--mn-ink-2); text-decoration: none; }
.mn-nav a::after { content: ""; position: absolute; left: 0; bottom: 11px; height: 1px; width: 100%; background: var(--mn-ink); transform: scaleX(0); transform-origin: right; transition: transform 320ms var(--mn-ease); }
.mn-nav a:hover { color: var(--mn-ink); }
.mn-nav a:hover::after { transform: scaleX(1); transform-origin: left; }
.mn-header-end { display: flex; align-items: center; gap: 14px; }
.mn-header .mn-btn { min-height: 44px; padding: 0 20px; font-size: 0.9375rem; }
.mn-locale { display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; letter-spacing: 0.04em; color: var(--mn-ink-2); }
.mn-locale a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 2px; color: inherit; text-decoration: none; }
.mn-locale a[aria-current="true"] { color: var(--mn-ink); font-weight: 600; }
.mn-locale a:hover { color: var(--mn-rose); }
.mn-locale span { opacity: 0.4; }
.mn-progress { position: absolute; left: 0; bottom: -1px; height: 2px; background: var(--mn-rose); width: 0%; transition: width 90ms linear; }

/* ── Hero ─────────────────────────────────────────────────────────────── */
.mn-hero { padding-block: 26px 44px; position: relative; }
.mn-hero h1 { margin-top: 12px; }
.mn-hero-actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px; }
.mn-hero-facts { margin: 28px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 0.9375rem; color: var(--mn-ink-2); }
.mn-hero-facts li { display: flex; align-items: center; gap: 16px; }
.mn-hero-facts li + li::before { content: ""; width: 4px; height: 4px; border-radius: 99px; background: var(--mn-rose); }
.mn-hero-media { position: relative; margin-top: 40px; }
.mn-hero-main { position: relative; aspect-ratio: 4 / 5; border-radius: var(--mn-rs); overflow: hidden; background: var(--mn-tint); }
.mn-hero-main img { object-fit: cover; }
.mn-hero-inset { position: absolute; right: -6px; bottom: -30px; width: 43%; max-width: 200px; aspect-ratio: 1 / 1; border-radius: var(--mn-rs); overflow: hidden; border: 6px solid #fff; background: var(--mn-tint); }
.mn-hero-inset img { object-fit: cover; }

/* ── Marquee ──────────────────────────────────────────────────────────── */
.mn-marquee { border-block: 1px solid var(--mn-line); overflow: hidden; margin-top: 56px; }
.mn-marquee-track { display: flex; width: max-content; animation: mn-slide 34s linear infinite; }
.mn-marquee-track span { font-family: var(--mn-display); font-size: clamp(1.25rem, 4vw, 1.875rem); letter-spacing: -0.02em; padding: 16px 0; display: inline-flex; align-items: center; gap: 30px; padding-inline-end: 30px; white-space: nowrap; }
.mn-marquee-track span i { font-style: normal; color: var(--mn-rose); }
.mn-marquee-track em { font-style: italic; color: var(--mn-rose); }
@keyframes mn-slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.mn-marquee:hover .mn-marquee-track { animation-play-state: paused; }

/* ── Artist ───────────────────────────────────────────────────────────── */
.mn-artist-grid { display: grid; gap: 30px; }
.mn-artist-portrait { position: relative; aspect-ratio: 4 / 5; border-radius: var(--mn-rs); overflow: hidden; background: var(--mn-tint); }
.mn-artist-portrait img { object-fit: cover; }
.mn-artist-body p { margin: 0 0 20px; color: var(--mn-ink-2); line-height: 1.75; max-width: 56ch; }
.mn-artist-body p:last-child { margin-bottom: 0; }
.mn-artist-body h2 { margin-bottom: 28px; }
.mn-more { margin-top: 20px; }
.mn-more summary { cursor: pointer; font-size: 0.9375rem; font-weight: 500; color: var(--mn-ink); list-style: none; min-height: 44px; display: inline-flex; align-items: center; gap: 8px; }
.mn-more summary::-webkit-details-marker { display: none; }
.mn-more summary::after { content: "↓"; transition: transform 240ms var(--mn-ease); }
.mn-more[open] summary::after { transform: rotate(180deg); }
.mn-more[open] summary { margin-bottom: 14px; }
.mn-portrait-empty { display: grid; place-items: center; height: 100%; padding: 24px; text-align: center; gap: 10px; }
.mn-portrait-empty span { font-family: var(--mn-display); font-size: 3rem; color: var(--mn-blush); }
.mn-portrait-empty small { font-size: 0.8125rem; color: var(--mn-ink-2); max-width: 24ch; line-height: 1.5; }

/* ── Menu ─────────────────────────────────────────────────────────────── */
.mn-menu-head { display: grid; gap: 26px; }
.mn-menu-head .mn-lead { margin-top: 18px; }
.mn-menu-meta { list-style: none; margin: 0; padding: 0; display: flex; gap: 34px; }
.mn-menu-meta strong { display: block; font-family: var(--mn-display); font-size: 2.25rem; line-height: 1; letter-spacing: -0.03em; }
.mn-menu-meta span { display: block; margin-top: 6px; font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mn-ink-2); }
.mn-menu { margin-top: 40px; }
.mn-tabs { display: flex; gap: 10px; flex-wrap: wrap; position: sticky; top: 84px; z-index: 20; background: var(--mn-tint); padding-block: 20px; margin-top: -20px; }
.mn-tab { appearance: none; cursor: pointer; font-family: inherit; font-size: 0.9375rem; font-weight: 500; min-height: 46px; padding: 0 22px; border-radius: 999px; border: 1px solid var(--mn-line-strong); background: var(--mn-white); color: var(--mn-ink-2); transition: background-color 200ms var(--mn-ease), color 200ms var(--mn-ease), border-color 200ms var(--mn-ease); }
.mn-tab:hover { border-color: var(--mn-ink); color: var(--mn-ink); }
.mn-tab[data-active="true"] { background: var(--mn-ink); border-color: var(--mn-ink); color: var(--mn-white); }
.mn-cat-note { margin: 26px 0 0; font-size: 0.9375rem; color: var(--mn-ink-2); display: flex; align-items: center; gap: 9px; }
.mn-cat-note::before { content: ""; width: 18px; height: 1px; background: var(--mn-rose); flex: 0 0 auto; }
.mn-rows { list-style: none; margin: 18px 0 0; padding: 0; }
.mn-row { border-top: 1px solid var(--mn-line); position: relative; }
.mn-rows > li:last-child { border-bottom: 1px solid var(--mn-line); }
/* MOBILE: thumb and copy share the top line, the price + action take a full
   line of their own underneath. Letting all three be flex siblings squeezed
   the description into a one-word-per-line column. */
.mn-row-in { display: flex; flex-wrap: wrap; gap: 16px 18px; align-items: flex-start; padding: 26px 0; position: relative; z-index: 1; }
.mn-row::before { content: ""; position: absolute; inset: 0; background: var(--mn-tint); border-radius: var(--mn-rs); transform: scaleX(0); transform-origin: left; transition: transform 380ms var(--mn-ease); }
.mn-row[data-selected="true"]::before { transform: scaleX(1); }
.mn-row[data-selected="true"] { box-shadow: inset 3px 0 0 var(--mn-rose); }
.mn-row-thumb { flex: 0 0 auto; width: 76px; height: 76px; border-radius: 12px; overflow: hidden; position: relative; background: var(--mn-tint); }
.mn-row-thumb img { object-fit: cover; transition: transform 500ms var(--mn-ease); }
.mn-row:hover .mn-row-thumb img { transform: scale(1.07); }
.mn-row-text { flex: 1 1 0; min-width: 0; }
.mn-row-title { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 1.0625rem; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; }
.mn-check { flex: 0 0 auto; width: 21px; height: 21px; border-radius: 99px; background: var(--mn-rose); color: var(--mn-on-primary, #fff); display: inline-grid; place-items: center; font-size: 0.75rem; animation: mn-pop 320ms var(--mn-ease); }
@keyframes mn-pop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.mn-row-desc { margin: 7px 0 0; font-size: 0.9375rem; line-height: 1.55; color: var(--mn-ink-2); max-width: 46ch; }
.mn-row-meta { margin: 11px 0 0; font-size: 0.8125rem; color: var(--mn-ink-2); }
.mn-row-buy { flex: 1 0 100%; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.mn-row-price { font-size: 1.125rem; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; letter-spacing: -0.01em; }
.mn-row-price small { display: block; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mn-ink-2); }
.mn-row-action { appearance: none; cursor: pointer; font-family: inherit; font-size: 0.9375rem; font-weight: 600; min-height: 46px; padding: 0 20px; border-radius: var(--mn-r); border: 1px solid var(--mn-ink); background: #fff; color: var(--mn-ink); white-space: nowrap; transition: background-color 200ms var(--mn-ease), color 200ms var(--mn-ease), border-color 200ms var(--mn-ease); }
.mn-row-action:hover { background: var(--mn-ink); color: var(--mn-white); }
.mn-row[data-selected="true"] .mn-row-action { border-color: var(--mn-rose); background: var(--mn-blush); color: var(--mn-ink); }
.mn-row-quote { font-size: 0.9375rem; color: var(--mn-ink-2); }

/* ── Selection bar ────────────────────────────────────────────────────── */
.mn-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; background: rgba(255,255,255,0.97); backdrop-filter: blur(12px); border-top: 1px solid var(--mn-line); padding: 12px var(--mn-gutter) calc(12px + env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 14px; transform: translateY(140%); transition: transform 380ms var(--mn-ease); }
.mn-bar[data-show="true"] { transform: none; }
.mn-bar-text { flex: 1; min-width: 0; }
.mn-bar-text strong { display: block; font-size: 0.9375rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mn-bar-text span { display: block; font-size: 0.8125rem; color: var(--mn-ink-2); }

/* ── Gallery ──────────────────────────────────────────────────────────── */
.mn-gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 40px; }
.mn-shot { margin: 0; position: relative; }
.mn-shot button { display: block; width: 100%; padding: 0; border: 0; cursor: pointer; background: var(--mn-tint); border-radius: 14px; overflow: hidden; position: relative; aspect-ratio: 4 / 5; }
.mn-shot img { object-fit: cover; transition: transform 700ms var(--mn-ease); }
.mn-shot button:hover img { transform: scale(1.05); }
.mn-shot-label { position: absolute; left: 10px; bottom: 10px; background: rgba(255,255,255,0.94); color: var(--mn-ink); font-size: 0.75rem; font-weight: 600; padding: 7px 12px; border-radius: 99px; transform: translateY(6px); opacity: 0; transition: opacity 280ms var(--mn-ease), transform 280ms var(--mn-ease); }
.mn-shot button:hover .mn-shot-label, .mn-shot button:focus-visible .mn-shot-label { opacity: 1; transform: none; }
.mn-shot-wide { grid-column: span 2; }
.mn-shot-wide button { aspect-ratio: 16 / 10; }
.mn-lightbox { position: fixed; inset: 0; z-index: 120; background: rgba(28,25,30,0.92); display: grid; place-items: center; padding: 16px; animation: mn-fade 220ms var(--mn-ease); }
@keyframes mn-fade { from { opacity: 0; } to { opacity: 1; } }
.mn-lb-img { position: relative; width: min(880px, 92vw); height: min(72vh, 1000px); }
.mn-lightbox img { object-fit: contain; }
.mn-lightbox figure { margin: 0; }
.mn-lightbox figcaption { color: #fff; font-size: 0.875rem; margin-top: 14px; text-align: center; }
.mn-lb-btn { position: absolute; appearance: none; cursor: pointer; border: 0; color: #fff; background: rgba(255,255,255,0.16); border-radius: 99px; width: 50px; height: 50px; font-size: 1.125rem; transition: background-color 200ms ease; }
.mn-lb-btn:hover { background: rgba(255,255,255,0.3); }
.mn-lb-close { top: 18px; right: 18px; }
.mn-lb-prev { left: 14px; top: 50%; transform: translateY(-50%); }
.mn-lb-next { right: 14px; top: 50%; transform: translateY(-50%); }

/* ── Visit + FAQ ──────────────────────────────────────────────────────── */
/* Map and facts share one line and finish together: the map stretches to the
   height the facts need, so neither column trails a void. */
.mn-visit-split { display: grid; gap: 14px; margin-top: 40px; }
.mn-areamap {
  position: relative; min-height: 260px;
  border-radius: var(--mn-rs); overflow: hidden; background: var(--mn-tint-deep);
}
.mn-areamap img { object-fit: cover; }
.mn-areamap-chip {
  position: absolute; left: 16px; top: 16px; display: inline-flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.94); color: var(--mn-ink); border-radius: 999px;
  padding: 9px 15px; font-size: 0.8125rem; font-weight: 600;
}
.mn-areamap-chip svg { color: var(--mn-rose); }
.mn-areamap figcaption {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 24px 16px 12px;
  font-size: 0.6875rem; line-height: 1.45; color: #fff;
  background: linear-gradient(transparent, rgba(36,31,38,0.74));
}
.mn-facts { list-style: none; margin: 0; padding: 0; background: var(--mn-white); border-radius: var(--mn-rs); overflow: hidden; }
.mn-facts li { display: flex; gap: 16px; align-items: flex-start; padding: 22px 26px; }
.mn-facts li + li { border-top: 1px solid var(--mn-line); }
.mn-fact-icon { flex: 0 0 auto; width: 22px; height: 22px; margin-top: 2px; color: var(--mn-rose); display: grid; place-items: center; }
.mn-facts dt { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mn-ink-2); margin-bottom: 8px; }
.mn-facts dd { margin: 0; font-size: 1.0625rem; line-height: 1.6; }

/* One narrow measure, centred: the FAQ gets a band to itself. */
.mn-center { max-width: 780px; margin-inline: auto; text-align: center; }
.mn-center .mn-lead { margin-inline: auto; }
.mn-center .mn-faq { text-align: left; }

.mn-faq { margin-top: 36px; display: grid; gap: 4px; }
/* The FAQ now sits on WHITE, so a white card is invisible: the rows are
   separated by a hairline instead, and an open row lifts onto the tint. */
.mn-faq details { background: transparent; border: 1px solid transparent; border-bottom-color: var(--mn-line); border-radius: 0; padding-inline: 22px; transition: background-color 240ms var(--mn-ease); }
/* An open answer stays on WHITE — flooding it with the accent colour made the
   one thing the visitor is reading the loudest thing on the page. The open
   state is carried by a hairline that firms up and by the rotated mark, not by
   a coloured bar: a 3px rule bending around an 18px corner read as a blot. */
.mn-faq details[open] { background: var(--mn-tint); border-color: var(--mn-blush-deep); border-radius: var(--mn-rs); }
.mn-faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 25px 0; min-height: 72px; font-size: 1.0625rem; font-weight: 500; line-height: 1.4; }
.mn-faq summary::-webkit-details-marker { display: none; }
.mn-faq summary::after { content: "+"; color: var(--mn-ink-2); font-size: 1.5rem; line-height: 1; transition: transform 260ms var(--mn-ease), color 200ms ease; }
.mn-faq details[open] summary::after { transform: rotate(45deg); color: var(--mn-rose); }
.mn-faq p { margin: 0 0 26px; color: var(--mn-ink-2); line-height: 1.65; max-width: 60ch; animation: mn-rise 320ms var(--mn-ease); }

/* ── Closing + footer ─────────────────────────────────────────────────── */
.mn-ask p { margin: 0; font-size: 1rem; color: var(--mn-ink-2); line-height: 1.55; max-width: 40ch; }
.mn-ask-link { appearance: none; border: 0; background: none; padding: 0; cursor: pointer; font-family: inherit; font-size: 0.9375rem; font-weight: 600; color: var(--mn-rose); min-height: 44px; }

.mn-contact ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.mn-contact a {
  display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 20px;
  border: 1px solid var(--mn-line-strong); border-radius: 999px; background: var(--mn-white);
  color: var(--mn-ink); text-decoration: none; font-size: 0.9375rem; font-weight: 500;
  transition: border-color 180ms var(--mn-ease), color 180ms var(--mn-ease);
}
.mn-contact a:hover { border-color: var(--mn-rose); color: var(--mn-rose); }
.mn-contact svg { width: 19px; height: 19px; flex: 0 0 auto; }
/* Brand colours, not theme colours: a Look must not repaint WhatsApp green. */
.mn-contact a[data-mn-channel="whatsapp"]:hover { border-color: var(--mn-brand-whatsapp, #25D366); color: var(--mn-brand-whatsapp-ink, #128C4A); }
.mn-contact-note { margin: 18px auto 0; font-size: 0.8125rem; color: var(--mn-ink-2); line-height: 1.5; max-width: 52ch; }
.mn-footer .mn-contact ul { justify-content: flex-start; }
.mn-footer .mn-contact a { min-height: 44px; padding: 0 14px; font-size: 0.875rem; }

.mn-closing-alt {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 12px;
  margin-top: 30px; padding-top: 30px; border-top: 1px solid var(--mn-line);
}
.mn-closing-alt span { font-size: 0.9375rem; color: var(--mn-ink-2); }
.mn-ask-link { appearance: none; border: 0; background: none; padding: 0; cursor: pointer; font-family: inherit; font-size: 0.9375rem; font-weight: 600; color: var(--mn-rose); min-height: 44px; text-underline-offset: 4px; }
.mn-ask-link:hover { text-decoration: underline; }
.mn-closing .mn-contact { margin-top: 26px; }

.mn-answer-steps { list-style: none; margin: 4px 0 26px; padding: 0; }
.mn-answer-steps li { display: flex; gap: 16px; align-items: flex-start; padding: 12px 0; }
.mn-answer-steps li + li { border-top: 1px solid var(--mn-line); }
.mn-answer-steps li > span { flex: 0 0 auto; min-width: 24px; font-family: var(--mn-display); font-size: 0.8125rem; color: var(--mn-rose); padding-top: 2px; }
.mn-answer-steps strong { display: block; font-size: 0.9375rem; font-weight: 600; }
.mn-answer-steps p { margin: 3px 0 0; font-size: 0.875rem; color: var(--mn-ink-2); line-height: 1.5; }

.mn-closing { text-align: center; }

.mn-closing .mn-hero-actions { justify-content: center; }
.mn-footer { border-top: 1px solid var(--mn-line); padding-block: 40px 130px; }
.mn-footer-in { display: flex; flex-wrap: wrap; gap: 20px 34px; align-items: center; justify-content: space-between; }
.mn-footer a { display: inline-flex; align-items: center; min-height: 44px; color: var(--mn-ink-2); text-decoration: none; font-size: 0.9375rem; }
.mn-footer a:hover { color: var(--mn-ink); }
.mn-footer small { color: var(--mn-ink-2); font-size: 0.8125rem; }
.mn-footer-links { display: flex; flex-wrap: wrap; gap: 4px 22px; list-style: none; margin: 0; padding: 0; }

.mn-empty { border: 1px dashed var(--mn-line-strong); border-radius: var(--mn-rs); padding: 52px 26px; text-align: center; }
.mn-empty h3 { margin: 0 0 8px; }
.mn-empty p { margin: 0 auto; max-width: 42ch; color: var(--mn-ink-2); font-size: 0.9375rem; }
.mn-disclaimer { margin: 28px 0 0; font-size: 0.8125rem; color: var(--mn-ink-2); }

/* ── Motion: scroll reveal + hero stagger ─────────────────────────────── */
@keyframes mn-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
[data-mn-reveal] { opacity: 1; }
.mn-armed [data-mn-reveal] { opacity: 0; transform: translateY(26px); transition: opacity 760ms var(--mn-ease), transform 760ms var(--mn-ease); transition-delay: var(--mn-delay, 0ms); }
.mn-armed [data-mn-reveal][data-shown="true"] { opacity: 1; transform: none; }
/* The wipe lives on the CHILDREN, never on the observed element itself: an
   element clipped to zero area reports no intersection, so clipping the
   observed node would deadlock its own reveal (it can never be seen, so it is
   never un-clipped). The parent only fades. */
.mn-armed [data-mn-reveal="media"] { opacity: 0; transform: none; transition: opacity 520ms var(--mn-ease); }
.mn-armed [data-mn-reveal="media"] > * { clip-path: inset(0 0 100% 0); transition: clip-path 1000ms var(--mn-ease); }
.mn-armed [data-mn-reveal="media"][data-shown="true"] { opacity: 1; }
.mn-armed [data-mn-reveal="media"][data-shown="true"] > * { clip-path: inset(0 0 0 0); }
.mn-armed [data-mn-reveal="media"] img { transform: scale(1.1); transition: transform 1400ms var(--mn-ease); }
.mn-armed [data-mn-reveal="media"][data-shown="true"] img { transform: none; }

@media (prefers-reduced-motion: reduce) {
  .mn-root *, .mn-root *::before, .mn-root *::after {
    animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important; scroll-behavior: auto !important;
  }
  .mn-armed [data-mn-reveal], .mn-armed [data-mn-reveal] > * { opacity: 1 !important; transform: none !important; clip-path: none !important; }
  .mn-marquee-track { animation: none !important; }
}
@media (prefers-reduced-motion: no-preference) { html:has(.mn-root) { scroll-behavior: smooth; } }
.mn-root [id] { scroll-margin-top: 148px; }

/* ── Desktop ──────────────────────────────────────────────────────────── */
@media (min-width: 900px) {
  .mn-root { --mn-gutter: 48px; }
  .mn-section { padding-block: 128px; }
  .mn-nav { display: flex; gap: 32px; }
  .mn-hero { padding-block: 48px 0; }
  .mn-hero-grid { display: grid; grid-template-columns: 1.02fr 1fr; gap: 72px; align-items: center; }
  .mn-hero-media { margin-top: 0; }
  .mn-hero-main { aspect-ratio: 3 / 4; }
  .mn-hero-inset { width: 46%; max-width: 240px; right: -40px; bottom: -44px; border-width: 9px; }
  .mn-marquee { margin-top: 96px; }
  .mn-artist-grid { grid-template-columns: 0.7fr 1fr; gap: 72px; align-items: center; }
  .mn-menu-head { grid-template-columns: 1fr auto; align-items: end; gap: 48px; }
  .mn-menu-meta { justify-content: flex-end; }
  .mn-tabs { top: 84px; }
  .mn-row-in { align-items: center; padding: 30px 0; gap: 30px; flex-wrap: nowrap; }
  .mn-row[data-selected="true"] .mn-row-in { padding-inline: 22px; }
  .mn-row::before { inset: 0 -22px; }
  .mn-row-thumb { width: 92px; height: 92px; }
  .mn-row-buy { flex: 0 0 auto; justify-content: flex-end; min-width: 300px; gap: 30px; }
  .mn-row-price { text-align: right; min-width: 96px; }
  .mn-gallery { grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .mn-visit-split { grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 52px; }
  .mn-footer { padding-block: 48px; }
  /* Desktop keeps the bar ONLY once something is chosen: an empty summary
     rail before the visitor has picked anything is dead weight, but a chosen
     service must never be a dead end. */
  .mn-bar:not([data-has-selection="true"]) { display: none; }
  .mn-bar { left: auto; right: 32px; bottom: 32px; width: min(460px, calc(100vw - 64px)); border: 1px solid var(--mn-line); border-radius: var(--mn-rs); padding: 16px 20px; box-shadow: 0 24px 50px -30px rgba(36,33,38,0.4); }
}
`;

export function MaisonStyles() {
  return <style dangerouslySetInnerHTML={{ __html: MAISON_CSS }} />;
}
