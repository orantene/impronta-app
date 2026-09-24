/** Token-first sheet chrome. Falls back to Jor blush when a site has no tokens. */
export const CATALOG_BOOKING_CSS = `
.jb-back,.cb-island{--cb-ink:var(--token-color-ink,var(--plt-ink,#242126));--cb-primary:var(--token-color-primary,var(--plt-accent,#A82458));--cb-muted:var(--token-color-muted,#66616B);--cb-line:var(--token-color-line,#ECE8EB);--cb-edge:var(--token-color-line,#DAD4D9);--cb-surface:var(--token-color-surface-raised,#fff);--cb-blush:color-mix(in srgb,var(--cb-primary) 12%,var(--cb-surface));--cb-soft:color-mix(in srgb,var(--cb-primary) 22%,var(--cb-surface))}
.jb-back{position:fixed;inset:0;z-index:120;background:rgba(36,33,38,.42);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;animation:jb-fade 200ms cubic-bezier(.22,1,.36,1)}
@keyframes jb-fade{from{opacity:0}to{opacity:1}}
.jb-sheet{width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;background:var(--cb-surface);color:var(--cb-ink);border-radius:22px 22px 0 0;font-family:var(--token-font-body,var(--font-inter-body),Inter,system-ui,sans-serif);box-shadow:0 -24px 60px -28px rgba(36,33,38,.45);animation:jb-rise 300ms cubic-bezier(.22,1,.36,1)}
@keyframes jb-rise{from{transform:translateY(28px);opacity:.5}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.jb-sheet,.jb-back{animation:none}}
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
.jb-back-link{appearance:none;border:0;background:none;padding:0 0 16px;cursor:pointer;font-family:inherit;font-size:.875rem;color:var(--cb-primary);font-weight:600;min-height:40px}
.jb-recap{margin:0 0 18px;font-size:.9375rem;color:var(--cb-muted)}
.jb-days{display:flex;gap:8px;overflow-x:auto;padding-bottom:10px}
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
.jb-field{display:grid;gap:6px;margin-bottom:16px}
.jb-field span{font-size:.875rem;font-weight:600;display:flex;align-items:center;gap:8px}
.jb-field span i{font-style:normal;font-size:.6875rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--cb-muted);background:var(--cb-soft);border-radius:99px;padding:3px 8px}
.jb-field input{min-height:52px;border-radius:10px;border:1px solid var(--cb-edge);background:var(--cb-surface);padding:0 14px;font-family:inherit;font-size:1rem;color:var(--cb-ink)}
.jb-field input:focus-visible{outline:2px solid var(--cb-primary);outline-offset:1px}
.jb-field input[aria-invalid="true"]{border-color:var(--cb-primary);background:var(--cb-blush)}
.jb-field em{font-style:normal;font-size:.8125rem;color:var(--cb-primary)}
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
.jb-ask{appearance:none;border:0;background:none;padding:14px 0 0;cursor:pointer;font-family:inherit;font-size:.875rem;font-weight:600;color:var(--cb-primary);text-align:left;min-height:44px}
@media (min-width:720px){.jb-back{align-items:center}.jb-sheet{border-radius:20px;max-height:86vh}.jb-foot{border-radius:0 0 20px 20px}}
.cb-bar{position:fixed;left:0;right:0;bottom:0;z-index:80;display:none;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px calc(14px + env(safe-area-inset-bottom));background:var(--cb-surface);color:var(--cb-ink);border-top:1px solid var(--cb-line);box-shadow:0 -12px 32px -20px rgba(36,33,38,.4)}
.cb-bar[data-show="true"]{display:flex}
.cb-bar-text{min-width:0;display:grid;gap:2px}
.cb-bar-text strong{font-size:.9375rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb-bar-text span{font-size:.75rem;color:var(--cb-muted)}
.cb-bar button{appearance:none;border:0;cursor:pointer;min-height:44px;padding:0 18px;border-radius:10px;background:var(--cb-primary);color:#fff;font:inherit;font-size:.8125rem;font-weight:600;flex:0 0 auto}
.site-builder-node--services-catalog-row[data-selected="true"]{background:color-mix(in srgb,var(--token-color-primary,var(--token-color-ink)) 8%,transparent)}
.site-builder-node--services-catalog-cta[data-selected="true"]{background:transparent;color:var(--token-color-ink);border:1px solid var(--token-color-line)}
`;
