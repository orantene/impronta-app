/**
 * Scoped Noir talent-profile styles, extracted from NoirProfileLayout to keep
 * that component under the max-lines budget. Every selector stays namespaced
 * under [data-profile-theme="noir"].
 */
export const NOIR_CSS = `
[data-profile-theme="noir"]{
  --nf-gold:#c6a14e; --nf-champagne:#e0c074; --nf-line:rgba(198,161,78,0.26);
  --nf-ease:cubic-bezier(0.16,1,0.3,1);
  --nf-pad:clamp(20px,5vw,64px);
  background:#0b0a0d; color:#ece4d3;
  font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-weight:300; line-height:1.65; -webkit-font-smoothing:antialiased;
}
[data-profile-theme="noir"] ::selection{ background:var(--nf-gold); color:#14110a; }
[data-profile-theme="noir"] .plt-display,[data-profile-theme="noir"] .nf-display{ font-family:'Cormorant Garamond',Georgia,serif; font-weight:600; letter-spacing:0; line-height:1.04; color:#ece4d3; }
[data-profile-theme="noir"] .plt-mono{ font-family:'Jost',sans-serif; }
[data-profile-theme="noir"] .nf-wrap{ width:100%; max-width:1200px; margin-inline:auto; padding-inline:var(--nf-pad); }
[data-profile-theme="noir"] .nf-section{ padding-block:clamp(54px,8vw,108px); }
[data-profile-theme="noir"] .nf-eyebrow{ font-size:11px; letter-spacing:0.34em; text-transform:uppercase; font-weight:500; color:var(--nf-champagne); display:inline-flex; align-items:center; gap:12px; }
[data-profile-theme="noir"] .nf-eyebrow::before{ content:""; width:30px; height:1px; background:var(--nf-gold); display:inline-block; }
[data-profile-theme="noir"] .nf-sec-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:32px; flex-wrap:wrap; margin-bottom:clamp(28px,4vw,52px); }
[data-profile-theme="noir"] .nf-sec-head h2{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(1.9rem,3.6vw,3rem); margin-top:14px; max-width:18ch; }
[data-profile-theme="noir"] .nf-sec-head__aside{ max-width:38ch; color:rgba(236,228,211,0.66); font-size:0.95rem; padding-bottom:6px; }

/* buttons */
[data-profile-theme="noir"] .nf-btn{ display:inline-flex; align-items:center; gap:10px; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; font-weight:500; padding:15px 30px; border-radius:0; transition:all .4s var(--nf-ease); border:1px solid transparent; white-space:nowrap; cursor:pointer; }
[data-profile-theme="noir"] .nf-btn--ghost{ border-color:var(--nf-line); color:#ece4d3; }
[data-profile-theme="noir"] .nf-btn--ghost:hover{ border-color:var(--nf-gold); color:var(--nf-champagne); background:rgba(198,161,78,0.07); }
[data-profile-theme="noir"] .nf-btn .arr{ transition:transform .4s var(--nf-ease); }
[data-profile-theme="noir"] .nf-btn:hover .arr{ transform:translateX(5px); }

/* full-bleed cinematic banner (talent "hero" media) */
[data-profile-theme="noir"] .nf-banner{ position:relative; width:100%; height:clamp(230px,42vh,540px); overflow:hidden; background:#100e13; }
[data-profile-theme="noir"] .nf-banner img{ width:100%; height:100%; object-fit:cover; object-position:center 28%; filter:brightness(0.82) saturate(1.02); }
[data-profile-theme="noir"] .nf-banner::after{ content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(11,10,13,0.10) 0%,rgba(11,10,13,0.30) 46%,rgba(11,10,13,0.72) 78%,#0b0a0d 100%); pointer-events:none; }
[data-profile-theme="noir"] .nf-banner__frame{ position:absolute; inset:14px; border:1px solid rgba(224,192,116,0.26); pointer-events:none; z-index:2; }

/* hero */
[data-profile-theme="noir"] .nf-hero{ display:grid; grid-template-columns:minmax(260px,360px) 1fr; gap:clamp(28px,5vw,64px); align-items:center; padding-top:clamp(40px,7vh,96px); padding-bottom:clamp(20px,3vw,40px); }
[data-profile-theme="noir"] .nf-hero--overlap{ margin-top:clamp(-200px,-20vh,-110px); padding-top:0; align-items:end; position:relative; z-index:3; }
[data-profile-theme="noir"] .nf-portrait{ position:relative; aspect-ratio:4/5; overflow:hidden; background:#1b1722; box-shadow:0 30px 70px -34px rgba(0,0,0,0.9); }
[data-profile-theme="noir"] .nf-hero--overlap .nf-portrait{ box-shadow:0 44px 96px -30px rgba(0,0,0,0.94); }
[data-profile-theme="noir"] .nf-portrait img{ width:100%; height:100%; object-fit:cover; filter:brightness(0.95); }
[data-profile-theme="noir"] .nf-portrait::after{ content:""; position:absolute; inset:14px; border:1px solid rgba(224,192,116,0.45); pointer-events:none; }
[data-profile-theme="noir"] .nf-portrait__mono{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; font-size:clamp(4rem,10vw,8rem); color:rgba(224,192,116,0.5); letter-spacing:0.08em; }
[data-profile-theme="noir"] .nf-intro{ display:flex; flex-direction:column; justify-content:center; min-width:0; padding-bottom:6px; }
[data-profile-theme="noir"] .nf-hero--overlap .nf-intro{ justify-content:flex-end; }
[data-profile-theme="noir"] .nf-intro h1{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(2.8rem,6.2vw,5.2rem); line-height:1.0; margin-top:16px; }
[data-profile-theme="noir"] .nf-chips{ display:flex; gap:10px; flex-wrap:wrap; margin-top:22px; }
[data-profile-theme="noir"] .nf-chip{ font-size:10px; letter-spacing:0.16em; text-transform:uppercase; font-weight:500; padding:7px 15px; border:1px solid var(--nf-line); border-radius:0; color:rgba(236,228,211,0.74); }
[data-profile-theme="noir"] .nf-chip--gold{ border-color:rgba(224,192,116,0.55); color:var(--nf-champagne); }
[data-profile-theme="noir"] a.nf-chip{ text-decoration:none; transition:border-color .2s ease,color .2s ease; }
[data-profile-theme="noir"] a.nf-chip:hover{ border-color:rgba(224,192,116,0.85); color:var(--nf-champagne); }
html:has([data-profile-theme="noir"]){ scroll-behavior:smooth; }
[data-profile-theme="noir"] #reviews{ scroll-margin-top:96px; }
[data-profile-theme="noir"] .nf-bio{ color:rgba(236,228,211,0.74); margin-top:24px; max-width:50ch; font-size:1rem; line-height:1.8; }
[data-profile-theme="noir"] .nf-actions{ display:flex; gap:12px; margin-top:32px; flex-wrap:wrap; align-items:center; }
[data-profile-theme="noir"] .nf-hero-extra{ margin-top:26px; display:flex; gap:18px; flex-wrap:wrap; align-items:center; }
[data-profile-theme="noir"] .nf-specialties{ display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-top:22px; }
[data-profile-theme="noir"] .nf-specialties__label{ font-size:9.5px; letter-spacing:0.24em; text-transform:uppercase; color:rgba(236,228,211,0.5); margin-right:2px; }

/* digitals */
[data-profile-theme="noir"] .nf-digitals{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:1px; background:var(--nf-line); border:1px solid var(--nf-line); }
[data-profile-theme="noir"] .nf-digitals + .nf-digitals{ margin-top:1px; }
[data-profile-theme="noir"] .nf-digitals .d{ background:#100e13; padding:22px 20px; min-width:0; }
[data-profile-theme="noir"] .nf-digitals .d .k{ font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-digitals .d .v{ font-family:'Cormorant Garamond',serif; font-size:1.5rem; margin-top:8px; color:#ece4d3; word-break:break-word; }
/* Section eyebrows measured 4.43:1 at alpha .5 — just under the 4.5 floor
   for 10.5px text. 0.56 -> 5.30:1. */
[data-profile-theme="noir"] .nf-group-label{ font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; color:rgba(236,228,211,0.56); margin:26px 0 12px; }

/* clients */
[data-profile-theme="noir"] .nf-clients{ display:flex; flex-wrap:wrap; gap:14px 40px; align-items:center; }
[data-profile-theme="noir"] .nf-clients span{ font-family:'Cormorant Garamond',serif; font-size:clamp(1.3rem,2vw,1.9rem); color:#ece4d3; opacity:0.8; }

/* similar */
[data-profile-theme="noir"] .nf-similar{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
[data-profile-theme="noir"] .nf-similar__card{ position:relative; }
[data-profile-theme="noir"] .nf-similar__media{ position:relative; aspect-ratio:3/4; overflow:hidden; background:#100e13; border:1px solid transparent; transition:border-color .5s; display:block; }
[data-profile-theme="noir"] .nf-similar__card:hover .nf-similar__media{ border-color:var(--nf-line); }
[data-profile-theme="noir"] .nf-similar__media img{ width:100%; height:100%; object-fit:cover; transition:transform 1s var(--nf-ease); filter:brightness(0.9); }
[data-profile-theme="noir"] .nf-similar__card:hover .nf-similar__media img{ transform:scale(1.04); }
[data-profile-theme="noir"] .nf-similar__cap{ position:absolute; left:0; right:0; bottom:0; padding:14px; background:linear-gradient(transparent,rgba(8,7,10,0.84)); }
[data-profile-theme="noir"] .nf-similar__cap .nm{ font-family:'Cormorant Garamond',serif; font-size:1.15rem; color:#fff; }
[data-profile-theme="noir"] .nf-similar__cap .ct{ font-size:9.5px; letter-spacing:0.18em; text-transform:uppercase; color:var(--nf-champagne); margin-top:4px; }

/* cta */
[data-profile-theme="noir"] .nf-cta{ position:relative; overflow:hidden; background:#100e13; border-top:1px solid var(--nf-line); border-bottom:1px solid var(--nf-line); }
[data-profile-theme="noir"] .nf-cta__inner{ position:relative; z-index:2; text-align:center; padding-block:clamp(70px,11vw,150px); }
[data-profile-theme="noir"] .nf-cta__inner::before{ content:""; position:absolute; inset:clamp(16px,3vw,38px); border:1px solid rgba(224,192,116,0.4); pointer-events:none; }
[data-profile-theme="noir"] .nf-cta h2{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(2.4rem,5.4vw,4.6rem); line-height:1.0; margin:18px 0 14px; }
[data-profile-theme="noir"] .nf-cta p{ color:rgba(236,228,211,0.74); max-width:46ch; margin:0 auto 34px; }
[data-profile-theme="noir"] .nf-cta__btns{ display:flex; gap:14px; justify-content:center; flex-wrap:wrap; align-items:center; }

/* footer */
[data-profile-theme="noir"] .nf-foot{ background:#100e13; border-top:1px solid var(--nf-line); padding-block:clamp(40px,6vw,72px); }
[data-profile-theme="noir"] .nf-foot__row{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:18px; }
[data-profile-theme="noir"] .nf-foot__brand{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(1.8rem,4vw,2.8rem); letter-spacing:0.12em; color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-foot__pw{ font-size:10.5px; letter-spacing:0.16em; text-transform:uppercase; color:rgba(236,228,211,0.56); }
[data-profile-theme="noir"] .nf-foot__pw em{ font-style:normal; color:var(--nf-champagne); }

/* sticky book bar */
[data-profile-theme="noir"] .nf-bookbar{ transition:transform .28s ease, opacity .28s ease; position:sticky; bottom:0; z-index:40; background:rgba(10,9,12,0.92); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px var(--nf-pad); flex-wrap:wrap; border-top:1px solid var(--nf-line); }
[data-profile-theme="noir"][data-bookbar="idle"] .nf-bookbar{ transform:translateY(115%); opacity:0; pointer-events:none; }
@media (prefers-reduced-motion: reduce){ [data-profile-theme="noir"] .nf-bookbar{ transition:none; } }
[data-profile-theme="noir"] .nf-bookbar .who{ display:flex; align-items:center; gap:14px; min-width:0; }
[data-profile-theme="noir"] .nf-bookbar .who img{ width:46px; height:46px; border-radius:50%; object-fit:cover; border:1px solid var(--nf-gold); }
[data-profile-theme="noir"] .nf-bookbar .who .mono{ width:46px; height:46px; border-radius:50%; border:1px solid var(--nf-gold); display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-bookbar .who .n{ font-family:'Cormorant Garamond',serif; font-size:1.3rem; line-height:1; }
[data-profile-theme="noir"] .nf-bookbar .who .s{ font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:var(--nf-champagne); margin-top:3px; }

/* the passed-in inquire/share/save slots inherit gold via the --plt overrides */
[data-profile-theme="noir"] .nf-preview-banner{ border-bottom:1px solid var(--nf-line); background:#100e13; color:rgba(236,228,211,0.7); text-align:center; padding:12px 16px; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; }

/* Reused sub-blocks render their own heading; Noir supplies its grand
   nf-sec-head instead, so suppress the block heading (we pass heading="").
   display:none removes the empty element from the a11y tree + closes the gap. */
[data-profile-theme="noir"] #skills-exp-heading,
[data-profile-theme="noir"] #services-heading,
[data-profile-theme="noir"] #service-menu-heading,
[data-profile-theme="noir"] #featured-media-heading{ display:none !important; }
[data-profile-theme="noir"] section[aria-label="Client reviews"] > div:first-of-type{ display:none !important; }

/* reveal-on-scroll (driven by NoirReveal; hero is never marked so it paints instantly) */
[data-profile-theme="noir"] [data-nf-reveal]{ opacity:0; transform:translateY(26px); transition:opacity .9s var(--nf-ease), transform .9s var(--nf-ease); will-change:opacity,transform; }
[data-profile-theme="noir"] [data-nf-reveal].nf-in{ opacity:1; transform:none; }
@media (prefers-reduced-motion: reduce){
  [data-profile-theme="noir"] [data-nf-reveal]{ opacity:1 !important; transform:none !important; transition:none !important; }
}

@media (max-width:900px){
  [data-profile-theme="noir"] .nf-hero{ grid-template-columns:1fr; }
  [data-profile-theme="noir"] .nf-hero--overlap{ margin-top:clamp(-120px,-16vh,-72px); align-items:start; }
  [data-profile-theme="noir"] .nf-hero--overlap .nf-portrait{ max-width:300px; }
  [data-profile-theme="noir"] .nf-hero--overlap .nf-intro{ justify-content:flex-start; }
  [data-profile-theme="noir"] .nf-banner{ height:clamp(180px,32vh,320px); }
  [data-profile-theme="noir"] .nf-similar{ grid-template-columns:repeat(2,1fr); }
  [data-profile-theme="noir"] .nf-sec-head{ flex-direction:column; align-items:flex-start; }
}
`;
