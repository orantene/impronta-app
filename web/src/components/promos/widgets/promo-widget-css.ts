/**
 * Promo widget stylesheet (TUL-1051 part B). Theme colours come from the site's
 * CSS variables (`--token-color-*`) with neutral system fallbacks, so one block
 * fits every design. 390px first: everything is a single column until there is
 * room, tap targets are 44px, and the fixed pieces respect the safe area.
 */
export const PROMO_WIDGET_CSS = `
.pw{--pw-bg:var(--token-color-accent,var(--token-color-primary,CanvasText));--pw-fg:var(--token-color-on-accent,var(--token-color-background,Canvas));--pw-line:transparent;--pw-radius:var(--site-radius-md,12px);box-sizing:border-box;max-width:100%;font-family:var(--site-body-font,inherit);color:var(--token-color-ink,CanvasText)}
.pw *,.pw *::before,.pw *::after{box-sizing:border-box}
.pw[data-tone="ink"]{--pw-bg:var(--token-color-ink,CanvasText);--pw-fg:var(--token-color-background,Canvas)}
.pw[data-tone="soft"]{--pw-bg:var(--token-color-surface-raised,var(--token-color-background,Canvas));--pw-fg:var(--token-color-ink,CanvasText);--pw-line:var(--token-color-line,currentColor)}
.pw[hidden],.pw[data-state="hidden"]{display:none!important}
.pw-hint{margin:0;padding:12px 14px;border:1px dashed var(--token-color-line,currentColor);border-radius:var(--pw-radius);font-size:13px;color:var(--token-color-muted,inherit)}
.pw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--pw-fg);background:transparent;color:var(--pw-fg);font:inherit;font-size:14px;font-weight:650;text-decoration:none;cursor:pointer;white-space:nowrap}
.pw-btn[data-solid]{background:var(--pw-fg);color:var(--pw-bg)}
.pw-btn:focus-visible,.pw-x:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.pw-x{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex:0 0 auto;border:0;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;border-radius:999px}
.pw-offer{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--pw-fg);color:var(--pw-bg);font-size:12px;font-weight:700;letter-spacing:.01em}
.pw-h{margin:0;font-size:17px;font-weight:700;line-height:1.25}
.pw-p{margin:0;font-size:14px;line-height:1.4;opacity:.9}
.pw-meta{margin:0;font-size:12.5px;opacity:.85}
.pw-note{margin:0;font-size:13px;line-height:1.35}
.pw-surface{background:var(--pw-bg);color:var(--pw-fg);border:1px solid var(--pw-line);border-radius:var(--pw-radius)}
.pw-banner{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 16px;border-radius:0}
.pw-banner-main{display:flex;flex:1 1 auto;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0;padding:6px 0}
.pw-banner-main .pw-h{font-size:14.5px}
.pw-banner-main .pw-btn{min-height:44px;padding:0 14px;font-size:13.5px}
.pw-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.pw-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:16px}
.pw-card .pw-btn{margin-top:auto}
.pw-reveal{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:18px}
.pw-code{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%}
.pw-code-box{flex:1 1 auto;min-width:0;padding:11px 14px;border:1.5px dashed var(--pw-fg);border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:.08em;text-align:center;overflow-wrap:anywhere}
.pw-count{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:18px}
.pw-tiles{display:flex;gap:8px}
.pw-tile{min-width:58px;padding:8px 6px;border-radius:10px;border:1px solid currentColor;text-align:center}
.pw-tile b{display:block;font-size:24px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.pw-tile small{font-size:11px;opacity:.85}
.pw-book{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.pw-book .pw-btn{background:var(--pw-bg);color:var(--pw-fg);border-color:var(--pw-bg)}
.pw-book[data-tone="soft"] .pw-btn{border-color:var(--pw-fg)}
.pw-fixed{position:fixed;z-index:60;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));display:flex;justify-content:center;pointer-events:none}
.pw-fixed>*{pointer-events:auto}
.pw-fixed[data-pos="bottom_right"]{justify-content:flex-end}
.pw-fixed[data-pos="bottom_left"]{justify-content:flex-start}
.pw-stack{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:100%}
.pw-bubble{margin:0;padding:10px 14px;font-size:13px;line-height:1.35}
.pw-sticky{display:flex;align-items:center;gap:2px;padding:0 4px 0 0;border-radius:999px;box-shadow:0 10px 30px -12px color-mix(in srgb,CanvasText 55%,transparent)}
.pw-sticky .pw-btn{border:0;font-size:15px;padding:0 16px 0 18px}
.pw-sticky .pw-x{width:36px;height:36px;font-size:18px}
.pw-pop{display:flex;flex-direction:column;gap:12px;padding:20px;width:min(100%,380px);max-height:calc(100dvh - 24px);overflow:auto;box-shadow:0 18px 50px -18px color-mix(in srgb,CanvasText 60%,transparent)}
.pw-pop-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.pw-pop-top .pw-x{margin:-10px -10px 0 0}
.pw-scrim{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;padding:12px;background:color-mix(in srgb,CanvasText 45%,transparent)}
.pw-in{animation:pw-in .22s ease-out both}
@keyframes pw-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (min-width:640px){.pw-scrim{align-items:center}.pw-banner{padding-left:24px}}
@media (prefers-reduced-motion:reduce){.pw-in{animation:none}}
.pw-static{position:static;display:block;pointer-events:auto}
`;
