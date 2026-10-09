/** Token-first sheet chrome. Falls back to Jor blush when a site has no tokens. */
export const CATALOG_BOOKING_CSS = `
/* CTA fills use --token-color-primary (solid brand). Vanity trees often store a
   pale blush on --token-color-accent (e.g. #F4D7E2) for tints — using that for
   Continuar/Confirmar made white labels unreadable (BJ-01). Soft fills are a
   mix of the solid primary, not the blush token. Ink sheet accent stays ink
   when the operator picks it (data-sheet-accent); default is primary. */
.jb-back,.cb-island{--cb-ink:var(--token-color-ink,var(--plt-ink,#242126));--cb-primary:var(--token-color-primary,var(--plt-accent,#A82458));--cb-muted:var(--token-color-muted,#66616B);--cb-line:var(--token-color-line,#ECE8EB);--cb-edge:var(--token-color-line,#DAD4D9);--cb-surface:var(--token-color-surface-raised,#fff);--cb-blush:color-mix(in srgb,var(--cb-primary) 14%,var(--cb-surface));--cb-soft:color-mix(in srgb,var(--cb-primary) 22%,var(--cb-surface))}
.cb-island[data-sheet-accent="ink"]{--cb-primary:var(--token-color-ink,var(--plt-ink,#242126));--cb-blush:color-mix(in srgb,var(--cb-primary) 8%,var(--cb-surface));--cb-soft:color-mix(in srgb,var(--cb-primary) 14%,var(--cb-surface))}
.cb-island[data-sheet-accent="primary"]{--cb-primary:var(--token-color-primary,var(--plt-accent,#A82458));--cb-blush:color-mix(in srgb,var(--cb-primary) 14%,var(--cb-surface));--cb-soft:color-mix(in srgb,var(--cb-primary) 22%,var(--cb-surface))}
.jb-back{position:fixed;inset:0;z-index:120;background:rgba(36,33,38,.42);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;animation:jb-fade 200ms cubic-bezier(.22,1,.36,1)}
@keyframes jb-fade{from{opacity:0}to{opacity:1}}
.jb-sheet{width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;background:var(--cb-surface);color:var(--cb-ink);border-radius:22px 22px 0 0;font-family:var(--token-font-body,var(--font-inter-body),Inter,system-ui,sans-serif);box-shadow:0 -24px 60px -28px rgba(36,33,38,.45);animation:jb-rise 300ms cubic-bezier(.22,1,.36,1)}
@keyframes jb-rise{from{transform:translateY(28px);opacity:.5}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.jb-sheet,.jb-back{animation:none}}
/* Busy ring (A-14): hidden everywhere except a soft-chrome site (motion-css.ts turns it on). */
.cb-spinner{display:none;width:16px;height:16px;margin-right:8px;border-radius:50%;border:2.5px solid color-mix(in srgb,currentColor 18%,transparent);border-top-color:currentColor;vertical-align:-3px;animation:cb-spin 1s linear infinite}
@keyframes cb-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.cb-spinner{animation:none}}
.jb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px 20px 16px;border-bottom:1px solid var(--cb-line)}
.jb-head h2{margin:5px 0 0;font-family:var(--token-font-display,var(--font-fraunces),Georgia,serif);font-weight:400;font-size:1.5rem;letter-spacing:-.02em;line-height:1.1}
.jb-kicker{margin:0;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:var(--cb-primary)}
.jb-x{appearance:none;border:0;background:color-mix(in srgb,var(--cb-ink) 6%,var(--cb-surface));width:40px;height:40px;border-radius:99px;font-size:1rem;cursor:pointer;color:var(--cb-ink);flex:0 0 auto}
.jb-body{padding:18px 20px 22px;overflow-y:auto;-webkit-overflow-scrolling:touch}
.jb-summary{background:var(--cb-blush);border-radius:14px;padding:14px 16px;margin-bottom:20px}
.jb-summary>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.jb-summary span{font-size:.8125rem;color:var(--cb-muted)}
.jb-summary strong{font-size:1.25rem;font-variant-numeric:tabular-nums}
.jb-incl{margin:10px 0 0;font-size:.875rem;color:var(--cb-primary)}
.jb-fixture{margin:10px 0 0;font-size:.8125rem;line-height:1.5;color:var(--cb-muted)}
.jb-brief{margin:12px 0 0;font-size:.875rem;line-height:1.5;color:var(--cb-ink)}
.jb-delivery{margin:8px 0 0;font-size:.8125rem;line-height:1.45;color:var(--cb-muted)}
.jb-group{border:0;margin:0 0 22px;padding:0;display:grid;gap:8px}
.jb-group legend{padding:0 0 10px;font-size:.9375rem;font-weight:600;display:flex;align-items:center;gap:8px}
.jb-req,.jb-opt-tag{font-size:.6875rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:99px}
.jb-req{background:var(--cb-primary);color:#fff}
.jb-opt-tag{background:var(--cb-soft);color:var(--cb-muted)}
.jb-opt{display:flex;align-items:center;gap:12px;min-height:54px;padding:0 15px;background:var(--cb-surface);border:1px solid var(--cb-edge);border-radius:10px;cursor:pointer;font-size:.9375rem}
.jb-opt[data-on="true"]{border-color:var(--cb-primary);background:var(--cb-blush)}
.jb-opt span{flex:1;min-width:0}
.jb-opt b{font-variant-numeric:tabular-nums}
.jb-opt input{accent-color:var(--cb-primary);width:18px;height:18px}
.jb-lines{border-top:1px solid var(--cb-line);padding-top:14px;display:grid;gap:8px}
.jb-lines>div{display:flex;justify-content:space-between;gap:16px;font-size:.9375rem;color:var(--cb-muted)}
.jb-lines>div span:last-child{font-variant-numeric:tabular-nums;color:var(--cb-ink)}
.jb-back-link{display:block;appearance:none;border:0;background:none;padding:0 0 16px;cursor:pointer;font-family:inherit;font-size:.875rem;color:var(--cb-primary);font-weight:600;min-height:40px;text-align:left}
.jb-recap{margin:0 0 18px;font-size:.9375rem;color:var(--cb-muted)}
.jb-days{position:relative;display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;scroll-behavior:smooth}
.jb-day{flex:0 0 auto;width:64px;min-height:76px;border-radius:12px;cursor:pointer;background:var(--cb-surface);border:1px solid var(--cb-edge);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-family:inherit;color:var(--cb-ink)}
.jb-day[data-on="true"]{background:var(--cb-ink);border-color:var(--cb-ink);color:#fff}
.jb-day:disabled{opacity:.32;cursor:not-allowed}
.jb-day span{font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;opacity:.7}
.jb-day b{font-size:1.125rem}
.jb-day small{font-size:.625rem;opacity:.7}
.jb-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;margin-top:16px}
.jb-time{min-height:48px;border-radius:10px;background:var(--cb-surface);border:1px solid var(--cb-edge);cursor:pointer;font-family:inherit;font-size:.9375rem;color:var(--cb-ink)}
.jb-time[data-on="true"]{background:var(--cb-ink);border-color:var(--cb-ink);color:#fff}
.jb-empty{margin-top:18px;border:1px dashed var(--cb-edge);border-radius:14px;padding:22px;text-align:center}
.jb-empty strong{display:block;margin-bottom:6px;font-size:.9375rem}
.jb-empty p{margin:0;font-size:.875rem;color:var(--cb-muted);line-height:1.55}
.jb-empty .jb-ask{display:inline-block;margin-top:14px;padding:10px 4px;text-align:center;text-decoration:underline;text-underline-offset:3px}
.jb-field{display:grid;gap:6px;margin-bottom:16px}
.jb-field span{font-size:.875rem;font-weight:600;display:flex;align-items:center;gap:8px}
.jb-field span i{font-style:normal;font-size:.6875rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--cb-muted);background:var(--cb-soft);border-radius:99px;padding:3px 8px}
.jb-field input{min-height:52px;border-radius:10px;border:1px solid var(--cb-edge);background:var(--cb-surface);padding:0 14px;font-family:inherit;font-size:1rem;color:var(--cb-ink)}
.jb-field textarea{min-height:64px;border-radius:10px;border:1px solid var(--cb-edge);background:var(--cb-surface);padding:12px 14px;font-family:inherit;font-size:1rem;color:var(--cb-ink);resize:vertical}
.jb-field select{min-height:52px;border-radius:10px;border:1px solid var(--cb-edge);background:var(--cb-surface);padding:0 12px;font-family:inherit;font-size:1rem;color:var(--cb-ink)}
.jb-chips{display:flex;flex-wrap:wrap;gap:8px}
.jb-chip{min-height:40px;padding:0 14px;border-radius:99px;border:1px solid var(--cb-edge);background:var(--cb-surface);color:var(--cb-ink);font:inherit;font-size:.875rem;cursor:pointer}
.jb-chip[aria-pressed="true"]{border-color:var(--cb-primary);background:var(--cb-blush)}
.jb-field textarea:focus-visible,.jb-field input:focus-visible{outline:2px solid var(--cb-primary);outline-offset:1px}
.jb-field input[aria-invalid="true"]{border-color:var(--cb-primary);background:var(--cb-blush)}
.jb-field em{font-style:normal;font-size:.8125rem;color:var(--cb-primary)}
.jb-taken{margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid var(--cb-primary);background:var(--cb-surface)}
.jb-taken p{margin:0;font-size:.875rem;line-height:1.5;color:var(--cb-ink)}
.jb-taken .jb-times{margin-top:10px}
.jb-error{margin:0 0 12px;font-size:.875rem;color:var(--cb-primary)}
.jb-done{text-align:center;padding:8px 0 4px}
.jb-check{width:60px;height:60px;border-radius:99px;background:var(--cb-soft);color:var(--cb-primary);display:grid;place-items:center;font-size:1.5rem;margin:0 auto 16px}
.jb-done h3{margin:0 0 8px;font-family:var(--token-font-display,var(--font-fraunces),Georgia,serif);font-weight:400;font-size:1.375rem;letter-spacing:-.02em}
.jb-done>p{margin:0 0 8px;font-size:.9375rem;color:var(--cb-muted)}
.jb-demo{margin:16px 0 0;font-size:.8125rem;line-height:1.5;color:var(--cb-muted);background:var(--cb-blush);border-radius:12px;padding:12px 14px}
.jb-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--cb-line);background:var(--cb-surface)}
.jb-total{display:grid}
.jb-total span{font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--cb-muted)}
.jb-total b{font-size:1.1875rem;font-variant-numeric:tabular-nums}
.jb-cta{appearance:none;border:0;cursor:pointer;min-height:52px;padding:0 24px;border-radius:10px;background:var(--cb-primary);color:#fff;font-family:inherit;font-size:.9375rem;font-weight:600}
.jb-cta:hover:not(:disabled){filter:brightness(.92)}
.jb-cta:disabled{background:var(--cb-edge);color:#fff;cursor:not-allowed}
.jb-ask{appearance:none;border:0;background:none;padding:14px 0 0;cursor:pointer;font-family:inherit;font-size:.875rem;font-weight:700;color:var(--cb-ink);text-align:left;min-height:44px}
/* AUD-005 — long CTA labels overflow a single footer row at 360. */
@media (max-width:400px){.jb-foot{flex-direction:column;align-items:stretch;gap:10px}.jb-total{width:100%}.jb-cta{width:100%}}
@media (min-width:720px){.jb-back{align-items:center}.jb-sheet{border-radius:20px;max-height:86vh}.jb-foot{border-radius:0 0 20px 20px}}
.cb-bar{position:fixed;left:0;right:0;bottom:0;z-index:80;display:none;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px calc(14px + env(safe-area-inset-bottom));background:var(--cb-surface);color:var(--cb-ink);border-top:1px solid var(--cb-line);box-shadow:0 -8px 20px -18px rgba(36,33,38,.18)}
.cb-bar[data-show="true"]{display:flex}
.cb-bar-text{min-width:0;display:grid;gap:2px}
.cb-bar[data-bar-style="pill"]{left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));gap:8px;padding:6px;border-radius:999px;border:1px solid color-mix(in srgb,var(--cb-line) 80%,transparent);background:color-mix(in srgb,var(--cb-surface) 82%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);box-shadow:0 12px 28px -20px color-mix(in srgb,var(--cb-ink) 22%,transparent)}
.cb-bar[data-bar-style="pill"] .cb-bar-chat{width:48px;height:48px;min-height:48px;padding:0;border-radius:50%;display:grid;place-items:center;background:var(--cb-blush,color-mix(in srgb,var(--cb-primary) 12%,var(--cb-surface)));color:var(--cb-primary)}
.cb-bar[data-bar-style="pill"] .cb-bar-go{flex:1;height:48px;border-radius:999px;font-size:15px}
@media (min-width:720px){.cb-bar[data-bar-style="pill"][data-show="true"]{display:flex!important;left:50%;right:auto;bottom:22px;transform:translateX(-50%)}.cb-bar[data-bar-style="pill"] .cb-bar-go{flex:0 0 auto;padding:0 22px}}
.cb-bar-text strong{font-size:.9375rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb-bar-text span{font-size:.75rem;color:var(--cb-muted)}
.cb-bar button{appearance:none;border:0;cursor:pointer;min-height:44px;padding:0 18px;border-radius:10px;background:var(--cb-primary);color:#fff;font:inherit;font-size:.8125rem;font-weight:600;flex:0 0 auto}
.site-builder-node--services-catalog-name{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.site-builder-node--services-catalog-check{flex:0 0 auto;width:21px;height:21px;border-radius:99px;background:var(--cb-primary,#A82458);color:#fff;display:inline-grid;place-items:center;font-size:.75rem;line-height:1}
.site-builder-node--services-catalog-price{display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right}
.site-builder-node--services-catalog-price small{font-size:.6875rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--cb-muted,#66616B)}
.site-builder-node--services-catalog-row[data-selected="true"]{background:var(--cb-blush,color-mix(in srgb,var(--cb-primary,#A82458) 8%,transparent))}
.site-builder-node--services-catalog-cta[data-selected="true"]{background:var(--cb-blush,color-mix(in srgb,var(--cb-primary,#A82458) 14%,transparent))!important;color:var(--cb-ink)!important;border:1px solid var(--cb-primary,#A82458)!important}
@media (min-width:720px){
  .cb-bar:not([data-has-selection="true"]){display:none!important}
  /* Leave a gutter for the Hablar FAB so Continuar and the pill do not stack
     on the same bottom-right corner (BJ-07). */
  .cb-bar[data-show="true"][data-has-selection="true"]{left:auto;right:max(32px,calc(16px + 56px + 16px));bottom:32px;width:min(420px,calc(100vw - 120px));border:1px solid var(--cb-line);border-radius:18px;padding:16px 20px;box-shadow:0 24px 50px -30px rgba(36,33,38,.4)}
}
/* Mobile: full-width idle/selected bar — Hablar FAB lifts via data-yield-booking-bar. */
.cb-island{padding-bottom:calc(72px + env(safe-area-inset-bottom))}
@media (min-width:720px){.cb-island{padding-bottom:0}}
/* AUD-044 — frosted selection dock (prototype: selection-dock.html). Brand via
   --cb-primary (theme token); glass via --cb-surface mixes. No hex literals. */
.cb-dock{--cb-ease:cubic-bezier(.2,.9,.25,1.15);--cb-ease-out:cubic-bezier(.16,1,.3,1);--cb-deep:color-mix(in srgb,var(--cb-primary) 76%,black);position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:81;display:flex;align-items:center;gap:10px;padding:10px;border-radius:22px;background:color-mix(in srgb,var(--cb-surface) 78%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);border:1px solid color-mix(in srgb,var(--cb-surface) 70%,transparent);box-shadow:0 18px 50px -12px color-mix(in srgb,var(--cb-deep) 35%,transparent),0 2px 6px color-mix(in srgb,var(--cb-deep) 8%,transparent);color:var(--cb-ink);font-family:var(--token-font-body,var(--font-inter-body),Inter,system-ui,sans-serif);transform:translateY(140%);opacity:0;pointer-events:none;transition:transform .55s var(--cb-ease),opacity .3s}
.cb-dock[data-show="true"]{transform:none;opacity:1;pointer-events:auto}
.cb-dock-stack{display:flex;flex:0 0 auto;position:relative}
.cb-dock-th{width:46px;height:46px;border-radius:12px;object-fit:cover;border:2px solid var(--cb-surface);box-shadow:0 2px 8px color-mix(in srgb,var(--cb-ink) 12%,transparent);transition:transform .4s var(--cb-ease)}
.cb-dock-th+.cb-dock-th{margin-left:-22px;transform:rotate(6deg)}
.cb-dock-count{position:absolute;top:-6px;left:34px;background:var(--cb-ink);color:var(--cb-surface);font-size:10.5px;font-weight:700;border-radius:999px;padding:1px 6px;border:2px solid var(--cb-surface)}
.cb-dock-x{appearance:none;width:26px;height:26px;border-radius:50%;border:0;background:var(--cb-surface);color:var(--cb-muted);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;position:absolute;top:-9px;left:-7px;box-shadow:0 1px 4px color-mix(in srgb,var(--cb-ink) 15%,transparent);transition:transform .2s}
.cb-dock-x[data-inline="true"]{position:static}
.cb-dock-x:hover{transform:scale(1.12) rotate(90deg)}
.cb-dock-info{flex:1;min-width:0}
.cb-dock-info b{display:block;font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb-dock-info span{display:block;font-size:12.5px;color:var(--cb-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.cb-dock-ask{appearance:none;width:46px;height:46px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--cb-primary) 35%,transparent);background:var(--cb-surface);color:var(--cb-primary);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;position:relative;transition:transform .25s var(--cb-ease),background .2s}
.cb-dock-ask:hover{transform:translateY(-2px);background:var(--cb-blush)}
.cb-dock-dot{position:absolute;top:8px;right:9px;width:8px;height:8px;border-radius:50%;background:var(--token-color-success,rgb(47 191 113));box-shadow:0 0 0 2px var(--cb-surface);animation:cb-dock-pulse 2s infinite}
@keyframes cb-dock-pulse{50%{box-shadow:0 0 0 5px transparent,0 0 0 2px var(--cb-surface)}}
.cb-dock-go{appearance:none;height:46px;border-radius:14px;border:0;background:linear-gradient(135deg,var(--cb-primary),var(--cb-deep));color:var(--token-color-on-primary,white);font:inherit;font-size:14px;font-weight:700;padding:0 16px;cursor:pointer;flex:0 0 auto;display:flex;align-items:center;gap:6px;position:relative;overflow:hidden}
.cb-dock-go::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,color-mix(in srgb,white 35%,transparent) 50%,transparent 70%);transform:translateX(-120%);pointer-events:none}
.cb-dock-go:hover::after{transform:translateX(120%);transition:transform .8s var(--cb-ease-out)}
.cb-dock-arr{display:inline-block;transition:transform .25s}
.cb-dock-go:hover .cb-dock-arr{transform:translateX(3px)}
.cb-dock-x:focus-visible,.cb-dock-ask:focus-visible,.cb-dock-go:focus-visible,.cb-dock-toast button:focus-visible{outline:2px solid var(--cb-primary);outline-offset:2px}
.cb-dock-toast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom));transform:translate(-50%,20px);z-index:82;background:var(--cb-ink);color:var(--cb-surface);border-radius:999px;padding:9px 8px 9px 16px;font-size:13px;display:flex;gap:10px;align-items:center;opacity:0;pointer-events:none;white-space:nowrap;font-family:var(--token-font-body,var(--font-inter-body),Inter,system-ui,sans-serif);transition:opacity .35s var(--cb-ease,ease),transform .35s cubic-bezier(.2,.9,.25,1.15)}
.cb-dock-toast[data-show="true"]{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.cb-dock .cb-dock-toast[data-in-dock="true"]{position:absolute!important;left:50%!important;right:auto!important;bottom:calc(100% + 10px)!important}
/* One bar at the bottom: consent + language suggestion step aside while the
   booking dock or "See services" pill is up. Without this the locale banner
   (z-50) sits behind the dock (z-80+) and its Switch / No thanks controls
   cannot be reached — the prompt looks "stuck". */
body:has(.cb-dock[data-show="true"]) [data-consent-banner],body:has(.cb-bar[data-show="true"]:not([data-top="true"])) [data-consent-banner],body:has(.cb-dock[data-show="true"]) [data-locale-suggestion],body:has(.cb-bar[data-show="true"]:not([data-top="true"])) [data-locale-suggestion]{display:none}
.cb-dock-toast button{appearance:none;background:color-mix(in srgb,var(--cb-surface) 14%,transparent);color:var(--cb-surface);border:0;border-radius:999px;padding:5px 11px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.cb-dock-th-icon{display:grid;place-items:center;background:var(--cb-blush);color:var(--cb-primary)}
.cb-dock-unread{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--cb-primary);box-shadow:0 0 0 2px var(--cb-surface)}
@media (min-width:720px){.cb-dock{left:auto;right:32px;bottom:32px;width:min(440px,calc(100vw - 64px))}.cb-dock-toast{bottom:112px}}
@media (prefers-reduced-motion:reduce){.cb-dock,.cb-dock *,.cb-dock-toast,.cb-dock-go::after{transition:none!important;animation:none!important}}
`;
