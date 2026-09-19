/**
 * Scoped Noir talent-profile styles. Every selector is namespaced under
 * [data-profile-theme="noir"] (aliased `N` below) so the reused sub-blocks
 * (services, storefront, reviews, lightbox, the passed-in CTA slots) inherit
 * the dark editorial register without being re-implemented.
 *
 * Layout language (see NoirProfileLayout for the page story):
 *   hero → first look → intro + stat rail → cinematic → reel → capabilities
 *   → availability → services → trust → portfolio → board → closing moment
 *
 * Two sticky surfaces, never both: a 64px top rail on desktop, a bottom bar
 * on phones. Both are stowed while the hero CTA is on screen
 * (data-bookbar="idle", driven by NoirBookbarAutoHide) and slide in after.
 */
const N = '[data-profile-theme="noir"]';
const M = '[data-profile-theme="noir"][data-profile-variant="modal"]';

export const NOIR_CSS = `
${N}{
  --nf-gold:#c6a14e; --nf-champ:#e0c074; --nf-line:rgba(198,161,78,0.22); --nf-line-soft:rgba(236,228,211,0.12);
  --nf-ink:#ece4d3; --nf-ink-70:rgba(236,228,211,0.72); --nf-ink-56:rgba(236,228,211,0.56); --nf-ink-42:rgba(236,228,211,0.42);
  --nf-avail:#9fd3a4;
  --nf-serif:'Cormorant Garamond',Georgia,serif; --nf-sans:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --nf-ease:cubic-bezier(0.16,1,0.3,1);
  --nf-pad:clamp(20px,5vw,72px); --nf-max:1320px;
  position:relative; overflow-x:clip;
  background:#0b0a0d; color:var(--nf-ink);
  font-family:var(--nf-sans); font-weight:300; line-height:1.6; -webkit-font-smoothing:antialiased;
}
${N} ::selection{ background:var(--nf-gold); color:#14110a; }
${N} img{ display:block; }
${N} .nf-wrap{ box-sizing:border-box; width:100%; max-width:var(--nf-max); margin-inline:auto; padding-inline:var(--nf-pad); }
${N} .nf-sec{ padding-block:clamp(56px,7vw,112px); }
${N} .nf-meta{ font-size:10.5px; letter-spacing:0.24em; text-transform:uppercase; font-weight:500; color:var(--nf-ink-56); }
${N} .nf-meta--gold{ color:var(--nf-champ); }
${N} .nf-eyebrow{ font-size:11px; letter-spacing:0.34em; text-transform:uppercase; font-weight:500; color:var(--nf-champ); display:inline-flex; align-items:center; gap:12px; }
${N} .nf-eyebrow::before{ content:""; width:34px; height:1px; background:var(--nf-gold); display:inline-block; }
${N} .nf-sec-head{ display:flex; align-items:baseline; justify-content:space-between; gap:24px; margin-bottom:clamp(22px,3vw,40px); }
${N} .nf-sec-head h2{ font-family:var(--nf-serif); font-weight:500; font-size:clamp(1.8rem,3vw,2.6rem); line-height:1.05; margin:0; }
${N} h2.nf-sr{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
${N} .nf-h4{ font-size:10.5px; letter-spacing:0.26em; text-transform:uppercase; color:var(--nf-champ); font-weight:500; margin:0 0 18px; display:flex; align-items:center; gap:12px; }
${N} .nf-h4::after{ content:""; flex:1; height:1px; background:var(--nf-line); }
html:has(${N}){ scroll-behavior:smooth; }
${N} [id]{ scroll-margin-top:calc(var(--nf-rail-top,0px) + 84px); }

/* ── buttons: ONE gold primary per viewport; ghost secondary; text tertiary ── */
${N} .nf-btn{ display:inline-flex; align-items:center; justify-content:center; gap:10px; height:48px; padding:0 26px; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; font-weight:500; border:1px solid transparent; border-radius:0; white-space:nowrap; cursor:pointer; text-decoration:none; transition:all .35s var(--nf-ease); }
${N} .nf-btn--primary{ background:linear-gradient(135deg,#e0c074,#c6a14e); color:#14110a; }
${N} .nf-btn--primary:hover{ filter:brightness(1.06); transform:translateY(-1px); }
${N} .nf-btn--ghost{ border-color:rgba(236,228,211,0.28); color:var(--nf-ink); }
${N} .nf-btn--ghost:hover{ border-color:var(--nf-champ); color:var(--nf-champ); }
${N} .nf-btn--text{ height:auto; padding:0; border:0; color:var(--nf-champ); gap:8px; }
${N} .nf-btn--text:hover .nf-arr{ transform:translateX(4px); }
${N} .nf-arr{ display:inline-block; transition:transform .35s var(--nf-ease); }
${N} .nf-btn:focus-visible,${N} button:focus-visible,${N} a:focus-visible,${N} summary:focus-visible{ outline:2px solid var(--nf-champ); outline-offset:3px; }

/* Passed-in live slots (inquire / instant-book / save / share) restyled to the
   Noir button system without touching their logic. Inside a CTA slot the FIRST
   child is the primary (instant book when present, else inquire); every
   other child becomes a ghost so a viewport never carries two gold buttons. */
${N} .nf-cta-slot{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
${N} .nf-cta-slot > *{ display:inline-flex; box-shadow:none; }
${N} .nf-cta-slot :is(button,a){ display:inline-flex; align-items:center; justify-content:center; gap:10px; height:48px; padding:0 26px; border-radius:0; font-family:var(--nf-sans) !important; font-size:11px; letter-spacing:0.2em !important; text-transform:uppercase; font-weight:500 !important; box-shadow:none; width:auto; white-space:nowrap; transition:all .35s var(--nf-ease); }
${N} .nf-cta-slot :is(button,a) svg{ width:14px; height:14px; }
${N} .nf-cta-slot > :first-child :is(button,a),${N} .nf-cta-slot > a:first-child,${N} .nf-cta-slot > button:first-child{ background:linear-gradient(135deg,#e0c074,#c6a14e); color:#14110a; border:1px solid transparent; }
${N} .nf-cta-slot > :first-child :is(button,a):hover,${N} .nf-cta-slot > a:first-child:hover{ filter:brightness(1.06); transform:translateY(-1px); background:linear-gradient(135deg,#e0c074,#c6a14e); }
${N} .nf-cta-slot > :not(:first-child) :is(button,a),${N} .nf-cta-slot > a:not(:first-child),${N} .nf-cta-slot > button:not(:first-child){ background:transparent; color:var(--nf-ink); border:1px solid rgba(236,228,211,0.28); }
${N} .nf-cta-slot > :not(:first-child) :is(button,a):hover{ background:transparent; border-color:var(--nf-champ); color:var(--nf-champ); }
${N} .nf-cta-slot--compact :is(button,a){ height:40px; padding:0 20px; }
/* Save + inquiry-list (discoveryCta2): quiet ghost + text, never gold. */
${N} .nf-side-slot{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
${N} .nf-side-slot > *{ display:inline-flex; box-shadow:none; width:auto; }
${N} .nf-side-slot :is(button,a){ display:inline-flex; align-items:center; justify-content:center; gap:8px; height:48px; padding:0 20px; width:auto; border-radius:0; font-family:var(--nf-sans) !important; font-size:11px; letter-spacing:0.2em !important; text-transform:uppercase; font-weight:500 !important; background:transparent; color:var(--nf-ink); border:1px solid rgba(236,228,211,0.28); box-shadow:none; transition:all .35s var(--nf-ease); }
${N} .nf-side-slot :is(button,a) svg{ width:14px; height:14px; }
${N} .nf-side-slot :is(button,a):hover{ background:transparent; border-color:var(--nf-champ); color:var(--nf-champ); }
${N} .nf-side-slot > :nth-child(n+2) :is(button,a),${N} .nf-side-slot > a:nth-child(n+2){ border-color:transparent; color:var(--nf-ink-56); padding:0 8px; }
${N} .nf-side-slot > :nth-child(n+2) :is(button,a):hover{ color:var(--nf-champ); }
/* In the hero only Save survives; the inquiry-list link returns in the closing moment. */
${N} .nf-side-slot--hero > :nth-child(n+2){ display:none; }
/* Share: the seven-icon row folds behind one icon via a native <details>. */
${N} .nf-share{ position:relative; }
${N} .nf-share > summary{ list-style:none; width:48px; height:48px; border:1px solid rgba(236,228,211,0.28); display:inline-flex; align-items:center; justify-content:center; color:var(--nf-ink-70); cursor:pointer; transition:all .3s; }
${N} .nf-share > summary::-webkit-details-marker{ display:none; }
${N} .nf-share > summary:hover,${N} .nf-share[open] > summary{ border-color:var(--nf-champ); color:var(--nf-champ); }
${N} .nf-share > summary svg{ width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
${N} .nf-share__pop{ position:absolute; right:0; top:calc(100% + 10px); z-index:30; background:#100e13; border:1px solid var(--nf-line); padding:12px; min-width:max-content; box-shadow:0 24px 60px -24px rgba(0,0,0,0.9); }
${N} .nf-share__pop p{ display:none; }

/* ── HERO ── */
${N} .nf-hero{ position:relative; min-height:min(92vh,900px); display:grid; align-items:end; overflow:hidden; background:#100e13; }
${N} .nf-hero__media{ position:absolute; inset:0; }
${N} .nf-hero__media img{ object-fit:cover; object-position:center 12%; animation:nfHeroIn 1.4s var(--nf-ease) both; }
@keyframes nfHeroIn{ from{ opacity:0; } to{ opacity:1; } }
/* Fine film grain over the banner: agency hero assets are often 1200px wide
   and get stretched to the viewport; grain reads as editorial texture where
   plain upscaling reads as blur. Sits under the gradient, above the image. */
${N} .nf-hero__media::before{ content:""; position:absolute; inset:0; z-index:1; pointer-events:none; opacity:.16; mix-blend-mode:overlay; background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>"); background-size:160px 160px; }
${N} .nf-hero__media::after{ z-index:2; }
${N} .nf-hero__media::after{ content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(11,10,13,0.12) 0%,rgba(11,10,13,0.05) 35%,rgba(11,10,13,0.55) 68%,rgba(11,10,13,0.96) 100%); }
${N} .nf-hero__body{ position:relative; z-index:2; width:100%; display:grid; grid-template-columns:1fr auto; align-items:end; gap:40px; padding-bottom:clamp(36px,5vw,64px); padding-top:120px; }
${N} .nf-hero h1{ font-family:var(--nf-serif); font-weight:500; font-size:clamp(3.6rem,9vw,8.4rem); line-height:.9; letter-spacing:-0.01em; margin:14px 0 18px; color:var(--nf-ink); }
${N} .nf-hero__line{ display:flex; flex-wrap:wrap; gap:8px 22px; align-items:center; font-size:12.5px; letter-spacing:0.06em; color:var(--nf-ink-70); }
${N} .nf-hero__line .nf-dot{ width:3px; height:3px; border-radius:50%; background:var(--nf-ink-42); }
${N} .nf-hero__line a{ color:inherit; text-decoration:none; }
${N} .nf-hero__line a:hover{ color:var(--nf-champ); }
${N} .nf-avail{ display:inline-flex; align-items:center; gap:8px; color:var(--nf-ink); }
${N} .nf-avail i{ width:7px; height:7px; border-radius:50%; background:var(--nf-avail); box-shadow:0 0 0 3px rgba(159,211,164,0.18); }
${N} .nf-avail--soft i{ background:var(--nf-champ); box-shadow:0 0 0 3px rgba(224,192,116,0.16); }
${N} .nf-hero__cta{ display:flex; flex-direction:column; align-items:flex-end; gap:12px; }
${N} .nf-actions{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
${N} .nf-hero__hint{ font-size:11.5px; color:var(--nf-ink-56); letter-spacing:0.04em; text-align:right; }
${N} .nf-hero__hint b{ font-weight:500; color:var(--nf-ink); }
${N} .nf-hero__hubs{ margin-top:2px; }
/* split hero (no banner) */
${N} .nf-hero--split{ min-height:0; background:#0b0a0d; align-items:stretch; }
${N} .nf-hero--split .nf-hero__body{ grid-template-columns:minmax(300px,440px) 1fr; align-items:end; gap:clamp(28px,5vw,72px); padding-top:clamp(28px,4vw,56px); }
${N} .nf-portrait{ position:relative; aspect-ratio:4/5; overflow:hidden; background:#161320; }
${N} .nf-portrait img{ object-fit:cover; }
${N} .nf-portrait::after{ content:""; position:absolute; inset:14px; border:1px solid rgba(224,192,116,0.35); pointer-events:none; }
${N} .nf-portrait__mono{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:rgba(224,192,116,0.5); }
${N} .nf-hero--split .nf-hero__side{ display:flex; flex-direction:column; justify-content:flex-end; min-width:0; }
${N} .nf-hero--split .nf-hero__cta{ align-items:flex-start; margin-top:30px; }
${N} .nf-hero--split .nf-actions{ justify-content:flex-start; }
${N} .nf-hero--split .nf-hero__hint{ text-align:left; }
${N} .nf-hero--split h1{ font-size:clamp(3.2rem,7.5vw,6.8rem); }
${N} .nf-hero__strip{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:34px; }
${N} .nf-hero__strip > div{ position:relative; aspect-ratio:3/4; overflow:hidden; background:#161320; }
${N} .nf-hero__strip img{ object-fit:cover; }

/* ── STICKY: top rail (desktop) / bottom bar (phone) ── */
${N} .nf-rail-slot{ position:sticky; top:var(--nf-rail-top,0px); height:0; z-index:50; }
${N} .nf-rail{ position:absolute; left:0; right:0; top:0; background:rgba(11,10,13,0.86); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); border-bottom:1px solid var(--nf-line); transform:translateY(-100%); transition:transform .35s var(--nf-ease); }
${N}[data-bookbar="active"] .nf-rail{ transform:none; }
${N} .nf-rail .nf-wrap{ display:flex; align-items:center; justify-content:space-between; gap:20px; height:64px; }
${N} .nf-rail__who{ display:flex; align-items:center; gap:14px; min-width:0; }
${N} .nf-rail__who .nf-thumb{ position:relative; width:38px; height:38px; overflow:hidden; border:1px solid var(--nf-gold); flex:none; }
${N} .nf-rail__who .nf-thumb img{ object-fit:cover; }
${N} .nf-rail__who .n{ font-family:var(--nf-serif); font-size:1.4rem; line-height:1; white-space:nowrap; }
${N} .nf-rail__who .s{ font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--nf-ink-56); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${N} .nf-rail nav{ display:flex; gap:26px; font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; color:var(--nf-ink-56); }
${N} .nf-rail nav a{ color:inherit; text-decoration:none; }
${N} .nf-rail nav a:hover{ color:var(--nf-champ); }
${N} .nf-rail__act{ display:flex; gap:14px; align-items:center; }
${N} .nf-rail__act .nf-status{ font-size:12px; color:var(--nf-ink-70); white-space:nowrap; }
${N} .nf-bar{ position:fixed; left:0; right:0; bottom:0; z-index:60; display:none; background:rgba(11,10,13,0.9); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); border-top:1px solid var(--nf-line); padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px)); align-items:center; justify-content:space-between; gap:12px; transform:translateY(110%); transition:transform .3s var(--nf-ease); }
${N}[data-bookbar="active"] .nf-bar{ transform:none; }
${N} .nf-bar__l{ min-width:0; }
${N} .nf-bar__l .n{ font-family:var(--nf-serif); font-size:1.25rem; line-height:1.05; }
${N} .nf-bar__l .s{ font-size:10.5px; color:var(--nf-ink-56); letter-spacing:0.04em; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${N} .nf-bar .nf-cta-slot :is(button,a){ height:44px; padding:0 18px; }
${N} .nf-bar .nf-cta-slot > :not(:first-child){ display:none; }
@media (prefers-reduced-motion: reduce){ ${N} .nf-rail,${N} .nf-bar{ transition:none; } }

/* ── FIRST LOOK: editorial strip (lightbox tiles) ── */
${N} .nf-look{ padding-top:clamp(28px,4vw,56px); }
${N} .nf-look__caption{ display:flex; justify-content:space-between; align-items:center; margin-top:12px; }
/* The lists carry .nf-wrap, so only the BLOCK margin/padding is reset here: a
   blanket margin:0/padding:0 out-specifies .nf-wrap and parks the grid on the
   left edge of wide screens (the 2026-09-18 'empty space on the right' bug). */
${N} ul.nf-look-grid{ list-style:none; margin-block:0; padding-block:0; display:grid; gap:10px; height:clamp(420px,58vw,760px); grid-template-rows:minmax(0,1fr); }
${N} ul.nf-look-grid > li{ min-width:0; min-height:0; }
${N} ul.nf-look-grid--quad{ grid-template-columns:1.1fr 1fr .85fr; grid-template-rows:minmax(0,1fr) minmax(0,1.25fr); }
${N} ul.nf-look-grid--quad > li:nth-child(1){ grid-row:1/3; }
${N} ul.nf-look-grid--quad > li:nth-child(2){ grid-row:1/3; }
${N} ul.nf-look-grid--trio{ grid-template-columns:repeat(3,1fr); }
${N} ul.nf-look-grid--duo{ grid-template-columns:1fr 1fr; }
${N} ul.nf-look-grid--solo{ grid-template-columns:1.4fr 1fr; }
${N} .nf-tile{ position:relative; display:block; width:100%; height:100%; overflow:hidden; background:#161320; cursor:zoom-in; border:0; padding:0; }
${N} .nf-tile img{ transition:transform 1.4s var(--nf-ease); }
${N} .nf-tile:hover img{ transform:scale(1.04); }
${N} ul.nf-folio{ list-style:none; margin-block:0; padding-block:0; columns:3; column-gap:10px; }
${N} ul.nf-folio > li{ break-inside:avoid; margin-bottom:10px; }
${N} ul.nf-folio > li .nf-tile{ aspect-ratio:3/4; }
${N} ul.nf-folio > li[data-orientation="landscape"] .nf-tile{ aspect-ratio:4/3; }
${N} .nf-folio-foot{ display:flex; justify-content:center; margin-top:34px; }

/* ── INTRO + STAT RAIL ── */
${N} .nf-intro{ display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(32px,6vw,96px); align-items:start; }
${N} .nf-intro > *{ min-width:0; }
${N} .nf-intro__lead{ font-family:var(--nf-serif); font-size:clamp(1.7rem,2.6vw,2.5rem); line-height:1.22; font-weight:400; margin:0; text-wrap:balance; }
${N} .nf-intro__body{ color:var(--nf-ink-70); margin:22px 0 0; max-width:52ch; font-size:15px; line-height:1.75; white-space:pre-line; }
${N} .nf-intro__facts{ display:flex; flex-wrap:wrap; gap:10px 28px; margin-top:26px; font-size:12.5px; letter-spacing:0.04em; color:var(--nf-ink-70); }
${N} .nf-intro__facts b{ font-weight:500; color:var(--nf-ink); }
${N} .nf-intro__exclusive{ margin-top:14px; }
${N} .nf-stats{ border-top:1px solid var(--nf-line); }
${N} .nf-stats__row{ display:grid; grid-template-columns:repeat(4,1fr); margin:0; }
${N} .nf-stats__cell{ padding:20px 0 18px; border-bottom:1px solid var(--nf-line-soft); min-width:0; }
${N} .nf-stats__cell dt{ font-size:9.5px; letter-spacing:0.26em; text-transform:uppercase; color:var(--nf-ink-42); }
${N} .nf-stats__cell dd{ font-family:var(--nf-serif); font-size:clamp(1.55rem,2vw,2rem); line-height:1; margin:8px 0 0; color:#f1ede4; }
${N} .nf-stats__cell.is-text dd{ font-size:clamp(1.2rem,1.5vw,1.45rem); line-height:1.15; }
${N} .nf-stats__cell dd small{ font-family:var(--nf-sans); font-size:11px; letter-spacing:0.08em; color:var(--nf-ink-56); margin-left:3px; }
${N} .nf-comp > summary{ list-style:none; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:16px 0 0; font-size:10.5px; letter-spacing:0.22em; text-transform:uppercase; color:var(--nf-champ); }
${N} .nf-comp > summary::-webkit-details-marker{ display:none; }
${N} .nf-comp > summary > span:first-child::after{ content:" +"; font-family:var(--nf-serif); font-size:16px; }
${N} .nf-comp[open] > summary > span:first-child::after{ content:" –"; }
${N} .nf-comp__count{ color:var(--nf-ink-42); letter-spacing:0.12em; text-transform:none; font-size:11px; }
${N} .nf-comp__body{ padding-top:22px; display:grid; gap:26px; }
${N} .nf-comp__group h3{ font-size:9.5px; letter-spacing:0.26em; text-transform:uppercase; color:var(--nf-ink-42); margin:0 0 10px; font-weight:500; }
${N} .nf-comp__group dl{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px 24px; margin:0; }
${N} .nf-comp__group dl > div{ font-size:12.5px; color:var(--nf-ink-70); display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid var(--nf-line-soft); padding-bottom:8px; }
${N} .nf-comp__group dl > div dd{ margin:0; color:var(--nf-ink); text-align:right; }
${N} .nf-comp__group dd a{ color:var(--nf-champ); text-decoration:none; border-bottom:1px solid rgba(224,192,116,0.4); }
${N} .nf-comp__group dl > .nf-comp__prose{ grid-column:1/-1; flex-direction:column; gap:4px; }
${N} .nf-comp__group dl > .nf-comp__prose dd{ text-align:left; color:var(--nf-ink-70); line-height:1.6; }

/* ── CINEMATIC ── */
${N} .nf-cine{ position:relative; height:clamp(300px,58vw,720px); overflow:hidden; background:#161320; }
${N} .nf-cine img{ object-fit:cover; object-position:center 40%; }
${N} .nf-cine::after{ content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(11,10,13,0.3),transparent 30%,transparent 70%,rgba(11,10,13,0.55)); pointer-events:none; }
${N} .nf-cine__cap{ position:absolute; left:var(--nf-pad); right:var(--nf-pad); bottom:28px; z-index:2; font-family:var(--nf-serif); font-size:clamp(1.4rem,2.4vw,2rem); font-weight:400; font-style:italic; max-width:40ch; }

/* ── REEL / featured media ── */
${N} .nf-reel{ display:grid; grid-template-columns:1.6fr 1fr; gap:clamp(24px,4vw,56px); align-items:start; }
${N} .nf-reel__txt h3{ font-family:var(--nf-serif); font-weight:500; font-size:clamp(1.9rem,3vw,2.7rem); line-height:1.05; margin:12px 0 0; }
${N} .nf-reel__txt p{ color:var(--nf-ink-70); margin:14px 0 0; max-width:36ch; font-size:14.5px; }

/* ── CAPABILITIES ── */
${N} .nf-caps{ display:grid; grid-template-columns:1.25fr 1fr 1fr; gap:clamp(28px,4vw,64px); }
${N} ul.nf-disc{ list-style:none; margin:0; padding:0; }
${N} .nf-disc li{ display:flex; justify-content:space-between; align-items:baseline; gap:16px; padding:10px 0; border-bottom:1px solid var(--nf-line-soft); }
${N} .nf-disc li .n{ font-family:var(--nf-serif); font-size:1.35rem; }
${N} .nf-disc li.is-prime .n{ font-size:1.5rem; color:var(--nf-champ); }
${N} .nf-disc li .lvl{ font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--nf-ink-56); white-space:nowrap; text-align:right; }
${N} .nf-tags{ font-size:13.5px; color:var(--nf-ink-70); line-height:1.9; }
${N} .nf-tags span::after{ content:"·"; margin:0 10px; color:var(--nf-ink-42); }
${N} .nf-tags span:last-child::after{ content:""; }
${N} .nf-caps__exp{ margin-top:26px; color:var(--nf-ink-70); font-size:14px; line-height:1.7; }
${N} .nf-caps__exp b{ display:block; font-weight:500; color:var(--nf-ink); font-size:11px; letter-spacing:0.16em; text-transform:uppercase; margin-bottom:6px; }
${N} .nf-kv{ display:grid; grid-template-columns:auto 1fr; gap:8px 18px; font-size:13.5px; color:var(--nf-ink-70); margin:0; }
${N} .nf-kv dt{ font-weight:500; color:var(--nf-ink-56); font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; padding-top:4px; }
${N} .nf-kv dd{ margin:0; }
${N} .nf-caps .nf-h4 + .nf-h4{ margin-top:28px; }

/* ── AVAILABILITY band ── */
${N} .nf-avl{ background:#100e13; border-top:1px solid var(--nf-line); border-bottom:1px solid var(--nf-line); }
${N} .nf-avl .nf-wrap{ display:grid; grid-template-columns:1fr 1fr auto; gap:clamp(24px,4vw,64px); align-items:center; }
${N} .nf-avl h3{ font-family:var(--nf-serif); font-weight:500; font-size:clamp(1.9rem,3vw,2.8rem); line-height:1.05; margin:10px 0 0; }
${N} .nf-avl h3 em{ font-style:italic; color:var(--nf-champ); }
${N} .nf-avl p{ color:var(--nf-ink-70); margin:12px 0 0; font-size:14px; max-width:40ch; }
${N} .nf-dots{ display:flex; gap:6px; margin-top:14px; }
${N} .nf-dots i{ width:14px; height:14px; border:1px solid rgba(236,228,211,0.22); }
${N} .nf-dots i.y{ background:rgba(159,211,164,0.75); border-color:transparent; }
${N} .nf-dots i.h{ background:rgba(224,192,116,0.55); border-color:transparent; }
${N} .nf-avl__facts{ display:grid; grid-template-columns:1fr 1fr; gap:16px 24px; margin:0; }
${N} .nf-avl__facts dt{ font-size:9.5px; letter-spacing:0.26em; text-transform:uppercase; color:var(--nf-ink-42); }
${N} .nf-avl__facts dd{ font-family:var(--nf-serif); font-size:1.5rem; margin:6px 0 0; line-height:1.1; }
${N} .nf-avl__cta{ display:flex; flex-direction:column; gap:10px; align-items:stretch; }
${N} .nf-avl__cta .nf-btn{ min-width:230px; }

/* ── SERVICES (reused blocks) ── */
${N} #services-heading,${N} #service-menu-heading,${N} #featured-media-heading,${N} #skills-exp-heading{ display:none !important; }
${N} section[aria-label="Client reviews"] > div:first-of-type{ display:none !important; }
${N} .nf-svc-note{ margin-top:22px; display:flex; justify-content:space-between; gap:20px; font-size:13px; color:var(--nf-ink-56); flex-wrap:wrap; }

/* ── TRUST ── */
${N} .nf-trust{ display:grid; grid-template-columns:.8fr 1.2fr; gap:clamp(28px,5vw,80px); align-items:start; }
${N} .nf-trust__score{ font-family:var(--nf-serif); font-size:clamp(4rem,8vw,7rem); line-height:.9; font-weight:400; margin-top:14px; }
${N} .nf-trust__score small{ font-size:1.4rem; color:var(--nf-champ); margin-left:8px; }
${N} .nf-trust__stars{ color:var(--nf-champ); letter-spacing:0.2em; margin-top:10px; font-size:14px; }
${N} .nf-trust__sub{ color:var(--nf-ink-56); margin-top:8px; font-size:13px; }

/* ── BOARD (similar talent) ── */
${N} .nf-sim{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
${N} .nf-sim__card{ position:relative; }
${N} .nf-sim__media{ position:relative; aspect-ratio:3/4; overflow:hidden; background:#161320; display:block; }
${N} .nf-sim__media img{ object-fit:cover; filter:brightness(.88); transition:transform 1.2s var(--nf-ease); }
${N} .nf-sim__card:hover .nf-sim__media img{ transform:scale(1.04); }
${N} .nf-sim__cap{ position:absolute; left:0; right:0; bottom:0; padding:16px; background:linear-gradient(transparent,rgba(8,7,10,0.85)); }
${N} .nf-sim__cap .n{ font-family:var(--nf-serif); font-size:1.3rem; color:#fff; }
${N} .nf-sim__cap .t{ font-size:9.5px; letter-spacing:0.2em; text-transform:uppercase; color:var(--nf-champ); margin-top:3px; }

/* ── CLOSING MOMENT ── */
${N} .nf-close{ position:relative; overflow:hidden; border-top:1px solid var(--nf-line); }
${N} .nf-close__bg{ position:absolute; inset:0; opacity:.28; }
${N} .nf-close__bg img{ object-fit:cover; object-position:center 30%; }
${N} .nf-close__bg::after{ content:""; position:absolute; inset:0; background:radial-gradient(60% 80% at 50% 50%,rgba(11,10,13,0.2),rgba(11,10,13,0.95)); }
${N} .nf-close__in{ position:relative; z-index:2; text-align:center; padding-block:clamp(90px,13vw,170px); }
${N} .nf-close h2{ font-family:var(--nf-serif); font-weight:500; font-size:clamp(3rem,7vw,6.4rem); line-height:.95; margin:16px 0 18px; }
${N} .nf-close p{ color:var(--nf-ink-70); max-width:44ch; margin:0 auto 34px; font-size:15px; }
${N} .nf-close .nf-cta-slot{ justify-content:center; }
${N} .nf-close__side{ margin-top:26px; display:flex; justify-content:center; gap:14px; flex-wrap:wrap; }
${N} .nf-close__side .nf-side-slot{ justify-content:center; }
${N} .nf-close__side .nf-side-slot :is(button,a){ border-color:transparent; color:var(--nf-ink-56); height:auto; padding:6px 8px; font-size:10.5px; }
${N} .nf-close__side .nf-side-slot :is(button,a):hover{ color:var(--nf-champ); }
${N} .nf-close__picker{ margin-top:36px; text-align:left; }
${N} .nf-foot{ border-top:1px solid var(--nf-line); padding:34px 0; display:flex; justify-content:space-between; align-items:center; gap:18px; flex-wrap:wrap; font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; color:var(--nf-ink-42); }
${N} .nf-foot em{ font-style:normal; color:var(--nf-champ); }
${N} .nf-preview-banner{ border-bottom:1px solid var(--nf-line); background:#100e13; color:var(--nf-ink-70); text-align:center; padding:12px 16px; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; }

/* ── reveal-on-scroll (NoirReveal) — content is always in the DOM ── */
${N} [data-nf-reveal]{ opacity:0; transform:translateY(22px); transition:opacity .9s var(--nf-ease), transform .9s var(--nf-ease); }
${N} [data-nf-reveal].nf-in{ opacity:1; transform:none; }
@media (prefers-reduced-motion: reduce){
  ${N} [data-nf-reveal]{ opacity:1 !important; transform:none !important; transition:none !important; }
  ${N} .nf-hero__media img{ animation:none; opacity:1; }
  ${N} .nf-tile img,${N} .nf-sim__media img{ transition:none; }
}

/* ── MODAL variant: discover → qualify → act, inside the dialog panel ── */
${M} .nf-hero{ min-height:480px; }
${M} .nf-hero h1{ font-size:clamp(3rem,6vw,5.6rem); }
${M} .nf-hero__body{ padding-top:80px; padding-bottom:36px; }
${M} ul.nf-look-grid{ height:clamp(320px,34vw,420px); }
${M} .nf-sec{ padding-block:clamp(40px,4.5vw,64px); }
${M} .nf-intro{ grid-template-columns:1fr 1.15fr; }
${M} .nf-rail__who .nf-thumb,${M} .nf-rail nav{ display:none; }
${M} .nf-modal-foot{ border-top:1px solid var(--nf-line); background:#100e13; padding:22px var(--nf-pad); display:flex; justify-content:space-between; align-items:center; gap:20px; flex-wrap:wrap; }
${M} .nf-modal-foot .n{ font-family:var(--nf-serif); font-size:1.5rem; }
${M} .nf-modal-foot .n span{ color:var(--nf-ink-56); font-size:1.1rem; font-style:italic; }

/* ── PHONE (≤820px): its own composition ── */
@media (max-width:820px){
  ${N}{ --nf-pad:18px; padding-bottom:78px; }
  ${N} .nf-hero{ min-height:0; height:min(78vh,640px); }
  ${N} .nf-hero__media img{ object-position:center 10%; }
  ${N} .nf-hero__body{ grid-template-columns:1fr; gap:18px; padding-top:0; padding-bottom:22px; }
  ${N} .nf-hero h1{ font-size:clamp(3.2rem,17vw,4.6rem); margin:10px 0 12px; }
  ${N} .nf-hero__line{ font-size:12px; gap:6px 14px; }
  ${N} .nf-hero__cta{ align-items:flex-start; }
  ${N} .nf-hero__cta .nf-actions{ justify-content:flex-start; }
  /* The bar carries the primary on phones; the hero keeps Save + Share only. */
  ${N} .nf-hero__cta .nf-actions > .nf-cta-slot,${N} .nf-hero__hint{ display:none; }
  ${N} .nf-side-slot--hero :is(button,a),${N} .nf-share > summary{ height:40px; }
  ${N} .nf-bar{ transform:none; }
  /* The guest-chat launcher (body-level, fixed bottom-right at 24px on phones)
     would sit on top of the bar's primary button; lift it above the bar. */
  body:has(${N}:not([data-profile-variant="modal"])) [data-guest-chat-launcher]{ bottom:calc(86px + env(safe-area-inset-bottom,0px)) !important; }
  ${N} .nf-hero--split{ height:auto; }
  ${N} .nf-hero--split .nf-hero__body{ grid-template-columns:1fr; padding-top:0; }
  ${N} .nf-hero--split .nf-portrait{ margin-inline:calc(-1 * var(--nf-pad)); }
  ${N} .nf-hero__strip{ display:none; }
  ${N} .nf-rail{ display:none; }
  ${N} .nf-bar{ display:flex; }
  ${N} ul.nf-look-grid,${N} ul.nf-look-grid--quad,${N} ul.nf-look-grid--trio,${N} ul.nf-look-grid--duo,${N} ul.nf-look-grid--solo{ display:flex; gap:8px; height:auto; width:100%; overflow-x:auto; scroll-snap-type:x mandatory; margin-inline:0; padding-inline:var(--nf-pad); scroll-padding-inline:var(--nf-pad); scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  ${N} ul.nf-look-grid::-webkit-scrollbar{ display:none; }
  ${N} ul.nf-look-grid > li{ flex:0 0 78%; aspect-ratio:3/4; scroll-snap-align:start; }
  ${N} ul.nf-look-grid > li[data-orientation="landscape"]{ aspect-ratio:4/3; align-self:center; }
  ${N} .nf-intro{ grid-template-columns:1fr; gap:34px; }
  ${N} .nf-stats__row{ display:flex; overflow-x:auto; scrollbar-width:none; margin-inline:calc(-1 * var(--nf-pad)); padding-inline:var(--nf-pad); }
  ${N} .nf-stats__row::-webkit-scrollbar{ display:none; }
  ${N} .nf-stats__cell{ flex:0 0 auto; padding:16px 22px 14px 0; margin-right:22px; border-bottom:0; border-right:1px solid var(--nf-line-soft); }
  ${N} .nf-stats__cell:last-child{ border-right:0; }
  ${N} .nf-stats__cell dd{ font-size:1.5rem; }
  ${N} .nf-comp__group dl{ grid-template-columns:1fr; }
  ${N} .nf-cine{ height:64vw; }
  ${N} .nf-cine__cap{ bottom:16px; }
  ${N} .nf-reel{ grid-template-columns:1fr; }
  ${N} .nf-caps{ grid-template-columns:1fr; gap:34px; }
  ${N} .nf-avl .nf-wrap{ grid-template-columns:1fr; gap:26px; }
  ${N} .nf-avl__cta{ display:none; }
  ${N} .nf-trust{ grid-template-columns:1fr; }
  ${N} ul.nf-folio{ columns:2; column-gap:8px; }
  ${N} .nf-sim{ grid-template-columns:repeat(2,1fr); gap:8px; }
  ${N} .nf-sec-head{ flex-direction:column; align-items:flex-start; gap:8px; }
  ${N} .nf-close__in{ padding-block:80px; }
  ${M} .nf-hero{ height:min(66vh,560px); }
}
`;
