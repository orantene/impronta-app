/**
 * Nail Designer styles: the owner's Nail Studio design (Main.dc.html desktop
 * board 1280x820, Mobile.dc.html 390x844), every inline style of the reference
 * moved into scoped rules without changing a value. The mobile board is the
 * base; the desktop board applies once the block's OWN container is wide
 * enough (container query), so the builder canvas and the live page agree and
 * the app fits any section width.
 *
 * Only `accent` is themable: it follows the site's primary token and falls back
 * to the design default. Finger size, nail size and charm position are
 * computed from per-finger custom properties and the board scale `--s`
 * (1 on desktop, 0.6 on mobile), exactly the reference arithmetic.
 */
export const NAIL_DESIGNER_CSS = `
.sb-nd{--nd-accent:var(--token-color-primary,#A63D57);--nd-tint:color-mix(in srgb,var(--nd-accent) 7%,#FFFCFA);container:sbnd/inline-size;width:100%;min-width:0;box-sizing:border-box;font-family:'DM Sans',system-ui,sans-serif}
.sb-nd *{box-sizing:border-box}
.sb-nd button{font-family:inherit}
.sb-nd button:focus-visible,.sb-nd input:focus-visible{outline:2px solid var(--nd-accent);outline-offset:2px}
.sb-nd-head{margin-bottom:.75rem}
.sb-nd-title{margin:0;font-size:clamp(1.35rem,2.5vw,1.85rem);font-weight:600;letter-spacing:-.02em;line-height:1.15}
.sb-nd-intro{margin:.35rem 0 0;font-size:.95rem;max-width:60ch;opacity:.75}
.nd-root{--s:.6;display:flex;flex-direction:column;width:100%;height:844px;background:#FFFCFA;color:#2B2221;overflow:hidden}
.nd-main{background:#F3ECE6;flex:none}
.nd-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 12px;background:#F3ECE6}
.nd-brandbox{display:flex;flex-direction:column;gap:2px}
.nd-brand{font-family:var(--token-font-display,'Fraunces',Georgia,serif);font-size:26px;font-weight:500;letter-spacing:-.01em;color:#2B2221}
.nd-brand em{font-style:italic;color:var(--nd-accent)}
.nd-sub{display:none;font-size:14px;color:#6E5F5B}
.nd-tools{display:flex;gap:6px}
.nd-pill{width:44px;height:44px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0;border:1px solid #DCCFC6;border-radius:50%;background:#FFFCFA;color:#2B2221;font-size:14px;font-weight:500;cursor:pointer}
.nd-pill[disabled]{opacity:.45;cursor:default}
.nd-pill-t{display:none}
.nd-boardwrap{padding:0 16px 14px;background:#F3ECE6}
.nd-board{position:relative;height:300px;border-radius:24px;background:#EADFD6;overflow:hidden}
.nd-edit{position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#FFFCFA;font-size:12px;font-weight:600;color:#2B2221;box-shadow:0 1px 2px rgba(43,34,33,.08)}
.nd-edit i{width:8px;height:8px;border-radius:50%;background:var(--nd-accent)}
.nd-hand{position:absolute;left:0;right:0;bottom:-52px;display:flex;align-items:flex-end;justify-content:center;gap:10px}
.nd-fing{--W:calc(var(--w)*var(--s)*1px);--NW:calc(var(--W)*.72);--BH:calc(var(--W)*.9);--NH:calc(var(--BH)*var(--k));--SW:calc(var(--NW)*.52);position:relative;flex-shrink:0;width:var(--W);height:calc(var(--h)*var(--s)*1px);transform:rotate(calc(var(--rot)*1deg)) translate(calc(var(--tx)*var(--s)*1px),calc(var(--ty)*var(--s)*1px));transform-origin:50% 100%}
.nd-fskin{position:absolute;inset:0;background:var(--nd-skin);border-radius:calc(var(--W)/2) calc(var(--W)/2) 22px 22px;box-shadow:inset -10px 0 18px rgba(60,30,20,.12),inset 6px 0 10px rgba(255,255,255,.18)}
.nd-crease{position:absolute;left:24%;right:24%;top:calc(var(--h)*var(--s)*.52px);height:12px;border-top:2px solid rgba(60,30,20,.12);border-radius:50%}
.nd-fbtn{position:absolute;left:50%;top:calc(var(--BH) + 14px*var(--s) - var(--NH));margin-left:calc(var(--NW)/-2);width:var(--NW);height:var(--NH);padding:0;border:0;background:rgba(0,0,0,0);cursor:pointer;outline:2px dashed rgba(0,0,0,0);outline-offset:6px}
.sb-nd .nd-fbtn[aria-pressed="true"]{outline:2px dashed var(--nd-accent);outline-offset:6px}
.sb-nd .nd-fbtn:focus-visible{outline:2px solid var(--nd-accent);outline-offset:6px}
.nd-nailface{position:absolute;inset:0;display:block;box-shadow:inset 0 -3px 0 rgba(0,0,0,.10),inset 0 0 0 1px rgba(0,0,0,.06);overflow:hidden}
.nd-shine{position:absolute;inset:0;display:block}
.nd-stk{position:absolute;left:calc((var(--NW) - var(--SW))/2);top:calc(var(--NH) - var(--BH)*.52 - var(--SW)/2);width:var(--SW);height:var(--SW);display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}
.nd-toast{position:absolute;top:12px;right:12px;padding:10px 16px;border-radius:999px;background:#2B2221;color:#FFFCFA;font-size:12px;font-weight:500}
.nd-hint{display:none;position:absolute;right:20px;bottom:18px;font-size:13px;color:#6E5F5B;background:rgba(255,252,250,.85);padding:6px 12px;border-radius:999px}
.nd-looksrow{display:none;align-items:center;gap:12px}
.nd-lookscroll{display:flex;gap:10px;flex-grow:1;min-width:0;overflow-x:auto;padding:2px}
.nd-look{flex-shrink:0;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px 8px 12px;border:1px solid #E6DAD2;border-radius:16px;background:#FFFCFA;cursor:pointer;text-align:left;color:#2B2221}
.nd-lookfull{width:100%}
.nd-lookthumbs{display:flex;align-items:flex-end;gap:3px}
.nd-lookthumb{position:relative;display:block;width:10px;height:17px;box-shadow:inset 0 -2px 0 rgba(0,0,0,.08),inset 0 0 0 1px rgba(0,0,0,.06);overflow:hidden}
.nd-looktext{display:flex;flex-direction:column;gap:2px}
.nd-lookname{font-size:14px;font-weight:600}
.nd-lookmeta{font-size:12px;color:#6E5F5B;text-transform:capitalize}
.nd-act{height:48px;padding:0 20px;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;font-size:15px;font-weight:600;cursor:pointer;flex-shrink:0}
.nd-ghost{background:#FFFCFA;color:#2B2221;border:1px solid #DCCFC6}
.nd-accentbtn{background:var(--nd-accent);color:#FFFFFF;border:1px solid var(--nd-accent)}
.nd-send{grid-column:1/-1;width:100%;background:#2B2221;color:#FFFCFA;border:1px solid #2B2221}
.nd-desk-acts{display:none;flex-shrink:0;align-items:center;gap:12px}
.nd-side{display:flex;flex-direction:column;flex:1 1 0;min-height:0;background:#FFFCFA}
.nd-ctl{display:flex;flex-direction:column;gap:10px;padding:14px 16px 0}
.nd-applylabel{display:none;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6E5F5B}
.nd-seg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;border-radius:999px;background:#F1E8E2}
.nd-seg3{grid-template-columns:repeat(3,minmax(0,1fr))}
.nd-segbtn{height:40px;border:0;border-radius:999px;background:rgba(0,0,0,0);color:#2B2221;font-size:14px;font-weight:600;cursor:pointer}
.nd-segbtn[aria-pressed="true"]{background:#2B2221;color:#FFFCFA}
.nd-tabs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border-bottom:1px solid #EFE6DF}
.nd-tab{height:44px;padding:0;border:0;border-bottom:2px solid rgba(0,0,0,0);background:rgba(0,0,0,0);color:#6E5F5B;font-size:13px;font-weight:600;cursor:pointer}
.nd-tab[aria-pressed="true"]{color:#2B2221;border-bottom-color:var(--nd-accent)}
.nd-panel{flex-grow:1;min-height:0;overflow-y:auto;padding:18px 16px 20px}
.nd-stack28{display:flex;flex-direction:column;gap:28px}
.nd-stack12{display:flex;flex-direction:column;gap:12px}
.nd-sechead{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.nd-h3{margin:0;font-size:15px;font-weight:600;color:#2B2221}
.nd-cap{font-size:13px;color:#6E5F5B}
.nd-note{margin:0;font-size:13px;line-height:1.45;color:#6E5F5B}
.nd-g6{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.nd-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.nd-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.nd-sw{width:100%;max-width:64px;justify-self:center;aspect-ratio:1;min-height:44px;padding:0;border:0;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}
.nd-sw[aria-pressed="true"]{box-shadow:0 0 0 2px #FFFCFA,0 0 0 4px var(--nd-accent)}
.nd-tile{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;min-height:44px;padding:14px 4px 10px;border:1px solid #E6DAD2;border-radius:16px;background:#FFFCFA;cursor:pointer;color:#2B2221;font-size:12px;font-weight:500}
.nd-tile[aria-pressed="true"]{border-color:var(--nd-accent);background:var(--nd-tint)}
.nd-prev{position:relative;display:block;border-radius:50% 50% 46% 46% / 40% 40% 24% 24%;box-shadow:inset 0 -2px 0 rgba(0,0,0,.08),inset 0 0 0 1px rgba(0,0,0,.06);overflow:hidden}
.nd-prev-art{width:34px;height:50px}
.nd-prev-fin{width:40px;height:58px}
.nd-prev-shape{width:36px;height:58px}
.nd-stkbox{display:block;width:36px;height:36px}
.nd-colorrow{display:flex;align-items:center;gap:12px;font-size:14px;color:#2B2221;cursor:pointer}
.nd-colorrow input{width:44px;height:44px;padding:3px;border:1px solid #E6DAD2;border-radius:12px;background:#FFFFFF;cursor:pointer}
.nd-foot{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px 16px 20px;border-top:1px solid #EFE6DF;background:#FFFCFA}
.nd-mobonly{display:flex}
.nd-tab.nd-mobonly{display:block}
.nd-livemsg{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@container sbnd (min-width:980px){
  .nd-root{--s:1;display:grid;grid-template-columns:minmax(0,1fr) 420px;height:820px;background:#F3ECE6}
  .nd-main{display:flex;flex-direction:column;gap:20px;min-width:0;min-height:0;padding:28px 36px}
  .nd-head{gap:16px;padding:0;background:transparent}
  .nd-brand{font-size:34px}
  .nd-sub{display:block}
  .nd-tools{gap:8px}
  .nd-pill{width:auto;height:44px;padding:0 16px;border-radius:999px}
  .nd-pill-t{display:inline}
  .nd-boardwrap{display:contents}
  .nd-board{height:auto;flex-grow:1;min-height:0;border-radius:28px}
  .nd-edit{top:20px;left:20px;font-size:13px}
  .nd-hand{bottom:-70px;gap:18px}
  .nd-toast{top:20px;right:20px;font-size:13px}
  .nd-hint{display:block}
  .nd-looksrow{display:flex}
  .nd-desk-acts{display:flex}
  .nd-side{border-left:1px solid #E6DAD2}
  .nd-ctl{gap:12px;padding:24px 24px 0}
  .nd-applylabel{display:block}
  .nd-tabs{grid-template-columns:repeat(5,minmax(0,1fr))}
  .nd-tab{font-size:14px}
  .nd-tab.nd-mobonly{display:none}
  .nd-panel{padding:22px 24px 28px}
  .nd-foot{display:block;padding:16px 24px 20px}
  .nd-foot .nd-mobonly{display:none}
}
`;
