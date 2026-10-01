/**
 * Nail Designer styles. Mobile-first (one column at 360/390), two columns once
 * the block's OWN container is >= 760px (a container query, so the builder
 * canvas and the live page agree). Colour comes only from the site design
 * tokens; the polish on the nails is painted inline from the model.
 * Motion only when the visitor has not asked for reduced motion.
 */
export const NAIL_DESIGNER_CSS = `
.sb-nd{--nd-skin:color-mix(in srgb,var(--token-color-ink) 16%,var(--token-color-background));container:sbnd/inline-size;color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-nd *{box-sizing:border-box}
.sb-nd-head{margin-bottom:.75rem}
.sb-nd-title{margin:0;font-size:clamp(1.35rem,2.5vw,1.85rem);font-weight:600;letter-spacing:-.02em;line-height:1.15}
.sb-nd-intro{margin:.35rem 0 0;font-size:.95rem;color:var(--token-color-muted);max-width:60ch}
.sb-nd-app{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;border:1.5px solid var(--token-color-line);border-radius:var(--site-radius-md,8px);background:var(--token-color-surface-raised,var(--token-color-background));padding:12px}
.sb-nd-stage{display:flex;flex-direction:column;align-items:center;gap:10px;border-radius:var(--site-radius-md,8px);background:color-mix(in srgb,var(--token-color-ink) 5%,var(--token-color-background));padding:14px 10px 10px;min-width:0}
.sb-nd-hand{container:sbndhand/inline-size;position:relative;width:100%;max-width:300px;aspect-ratio:1/0.92}
.sb-nd-fingers{position:absolute;inset:8cqw 0 auto 0;display:flex;align-items:flex-end;justify-content:center;gap:1.5cqw;height:74cqw}
.sb-nd-palm{position:absolute;left:3cqw;right:3cqw;bottom:0;height:34cqw;border-radius:6cqw 6cqw 30cqw 30cqw;background:var(--nd-skin)}
.sb-nd-finger{position:relative;display:block;flex:none;padding:0;border:0;background:var(--nd-skin);cursor:pointer;border-radius:10cqw 10cqw 4cqw 4cqw;outline-offset:3px;color:inherit}
.sb-nd-finger[aria-pressed="true"]{outline:2px dashed var(--token-color-primary,var(--token-color-ink))}
.sb-nd-finger:focus-visible{outline:2px solid var(--token-color-primary,var(--token-color-ink))}
.sb-nd-f0{width:16cqw;height:52cqw;transform:rotate(-7deg)}
.sb-nd-f1{width:18cqw;height:64cqw;transform:rotate(-2deg)}
.sb-nd-f2{width:19cqw;height:72cqw}
.sb-nd-f3{width:18cqw;height:64cqw;transform:rotate(4deg)}
.sb-nd-f4{width:21cqw;height:46cqw;transform:rotate(28deg) translate(3cqw,10cqw)}
.sb-nd-nail{position:absolute;left:50%;width:72%;transform:translateX(-50%);overflow:hidden;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--token-color-ink) 14%,transparent)}
.sb-nd-charm{position:absolute;left:50%;display:flex;align-items:center;justify-content:center;gap:2px;transform:translate(-50%,-50%);color:var(--token-color-background);filter:drop-shadow(0 0 1px var(--token-color-ink))}
.sb-nd-charm svg{width:4.4cqw;height:4.4cqw;fill:currentColor;stroke:var(--token-color-ink);stroke-width:1.2}
.sb-nd-hint{margin:0;font-size:12.5px;color:var(--token-color-muted);text-align:center}
.sb-nd-bar{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.sb-nd-panel{display:grid;gap:10px;min-width:0;align-content:start}
.sb-nd-seg{display:grid;grid-template-columns:1fr 1fr;border:1.5px solid var(--token-color-line);border-radius:var(--site-radius-md,8px);overflow:hidden}
.sb-nd-seg button{min-height:44px;padding:0 10px;border:0;background:transparent;color:var(--token-color-ink);font:inherit;font-weight:600;font-size:13.5px;cursor:pointer}
.sb-nd-seg button[aria-pressed="true"]{background:var(--token-color-ink);color:var(--token-color-background)}
.sb-nd-tabs{display:flex;gap:2px;border-bottom:1.5px solid var(--token-color-line);overflow-x:auto;scrollbar-width:none}
.sb-nd-tab{flex:1 0 auto;min-height:44px;padding:0 12px;border:0;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;background:transparent;color:var(--token-color-muted);font:inherit;font-weight:600;font-size:13.5px;cursor:pointer;white-space:nowrap}
.sb-nd-tab[aria-selected="true"]{color:var(--token-color-ink);border-bottom-color:var(--token-color-primary,var(--token-color-ink))}
.sb-nd-group{display:grid;gap:8px}
.sb-nd-label{margin:0;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-nd-swatches{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.sb-nd-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sb-nd-sw,.sb-nd-tile{min-height:44px;border:1.5px solid var(--token-color-line);border-radius:var(--site-radius-md,8px);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);font:inherit;font-weight:600;font-size:12.5px;cursor:pointer;padding:0}
.sb-nd-sw{aspect-ratio:1/1;min-width:44px;border-radius:999px}
.sb-nd-tile{display:grid;justify-items:center;align-content:center;gap:4px;padding:6px 4px;line-height:1.15;text-align:center}
.sb-nd-tile i{display:block;width:26px;height:22px;border-radius:8px 8px 11px 11px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--token-color-ink) 14%,transparent)}
.sb-nd-sw[aria-pressed="true"],.sb-nd-tile[aria-pressed="true"]{border-color:var(--token-color-ink);box-shadow:0 0 0 2px var(--token-color-background),0 0 0 4px var(--token-color-ink)}
.sb-nd-btn{min-height:44px;padding:0 14px;border-radius:var(--site-radius-md,8px);border:1.5px solid var(--token-color-ink);background:transparent;color:var(--token-color-ink);font:inherit;font-weight:700;font-size:14px;cursor:pointer}
.sb-nd-btn[disabled]{opacity:.4;cursor:not-allowed}
.sb-nd-cta{width:100%;background:var(--token-color-primary,var(--token-color-ink));border-color:var(--token-color-primary,var(--token-color-ink));color:var(--token-color-primary-on,var(--token-color-background))}
.sb-nd-live{margin:0;min-height:1.2em;font-size:12.5px;color:var(--token-color-muted);text-align:center}
.sb-nd button:focus-visible{outline:2px solid var(--token-color-primary,var(--token-color-ink));outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.sb-nd-sw,.sb-nd-tile,.sb-nd-btn,.sb-nd-finger{transition:border-color .15s,box-shadow .15s,transform .15s}.sb-nd-sw:hover,.sb-nd-tile:hover{transform:translateY(-1px)}}
@container sbnd (min-width:760px){
  .sb-nd-app{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:20px;padding:18px}
  .sb-nd-stage{padding:22px 16px 14px;align-content:center}
  .sb-nd-swatches{grid-template-columns:repeat(9,minmax(0,1fr))}
  .sb-nd-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@container sbnd (max-width:360px){
  .sb-nd-swatches{grid-template-columns:repeat(5,minmax(0,1fr))}
}
`;
