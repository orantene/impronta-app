/**
 * ticket_picker stylesheet, injected once per island. Every colour is a
 * projected tenant token (`--token-color-*`); no hex literal, no parallel
 * palette. Mobile first: the quantity bar is fixed to the bottom of a phone
 * and becomes a sticky card on desktop; the sheet is a bottom sheet on a
 * phone and a side panel on desktop.
 */
export const TP_CSS = `
[data-ticket-picker]{color:var(--token-color-ink);font:inherit}
[data-ticket-picker="root"],[data-ticket-picker="held"],[data-ticket-picker="not_configured"]{padding:1.25rem 1.35rem}
[data-ticket-picker] .tp-title{margin:0 0 1rem;font-size:1.05rem;font-weight:600;letter-spacing:-0.01em}
[data-ticket-picker] .tp-status{margin:0;color:var(--token-color-muted,inherit)}
[data-ticket-picker] .tp-section{margin:0 0 1.15rem}
[data-ticket-picker] .tp-section:last-of-type{margin-bottom:0}
[data-ticket-picker] .tp-label{display:block;margin:0 0 0.55rem;font-size:0.72rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-choices{display:flex;flex-direction:column;gap:0.5rem}
[data-ticket-picker] .tp-choice{display:grid;grid-template-columns:1.15rem 1fr auto;gap:0.75rem;align-items:center;margin:0;padding:0.85rem 1rem;border:1px solid var(--token-color-line);border-radius:14px;background:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent));cursor:pointer;transition:border-color 160ms ease,box-shadow 160ms ease,background-color 160ms ease}
[data-ticket-picker] .tp-choice:hover{border-color:color-mix(in srgb,var(--token-color-primary) 45%,transparent)}
[data-ticket-picker] .tp-choice[data-on="1"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--token-color-primary) 22%,transparent);background:color-mix(in srgb,var(--token-color-primary) 10%,var(--token-color-surface-raised,transparent))}
[data-ticket-picker] .tp-choice[data-off="1"]{opacity:0.55;cursor:not-allowed}
[data-ticket-picker] .tp-radio{appearance:none;-webkit-appearance:none;width:1.15rem;height:1.15rem;margin:0;border:1.5px solid color-mix(in srgb,var(--token-color-ink) 35%,transparent);border-radius:50%;background:transparent;accent-color:var(--token-color-primary)}
[data-ticket-picker] .tp-choice[data-on="1"] .tp-radio{border-color:var(--token-color-primary);box-shadow:inset 0 0 0 3.5px var(--token-color-primary)}
[data-ticket-picker] .tp-choice-copy{min-width:0}
[data-ticket-picker] .tp-choice-title{display:block;font-weight:600;line-height:1.3}
[data-ticket-picker] .tp-choice-meta{display:block;margin-top:0.2rem;font-size:0.82rem;line-height:1.35;color:var(--token-color-muted)}
[data-ticket-picker] .tp-price{font-size:0.92rem;font-weight:600;white-space:nowrap;color:var(--token-color-ink)}
[data-ticket-picker] .tp-price[data-free="1"]{color:var(--token-color-primary)}
[data-ticket-picker] .tp-seats{display:flex;flex-wrap:wrap;gap:0.5rem}
[data-ticket-picker] .tp-seat{min-height:44px;padding:0.55rem 0.85rem;border:1.5px solid var(--token-color-line);border-radius:12px;background:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent));font:inherit;font-size:0.9rem;cursor:pointer}
[data-ticket-picker] .tp-seat[data-on="1"]{border-color:var(--token-color-primary);background:color-mix(in srgb,var(--token-color-primary) 12%,var(--token-color-surface-raised,transparent));font-weight:600}
[data-ticket-picker] .tp-fields{display:flex;flex-direction:column;gap:0.85rem;margin-top:0.25rem}
[data-ticket-picker] .tp-field-label{display:block;margin:0 0 0.4rem;font-size:0.82rem;font-weight:600}
[data-ticket-picker] .tp-help{display:block;margin-top:0.4rem;font-size:0.8rem;line-height:1.4;color:var(--token-color-muted)}
[data-ticket-picker] .tp-field{width:100%;box-sizing:border-box;font:inherit;font-size:16px;line-height:1.45;color:var(--token-color-ink);background:color-mix(in srgb,var(--token-color-ink) 8%,var(--token-color-surface-raised,transparent));border:1px solid color-mix(in srgb,var(--token-color-ink) 28%,transparent);border-radius:12px;padding:0.8rem 0.95rem;outline:none;transition:border-color 160ms ease,box-shadow 160ms ease}
[data-ticket-picker] .tp-field::placeholder{color:var(--token-color-muted);opacity:1}
[data-ticket-picker] .tp-field:hover{border-color:color-mix(in srgb,var(--token-color-primary) 45%,transparent)}
[data-ticket-picker] .tp-field:focus,[data-ticket-picker] .tp-field:focus-visible{border-color:var(--token-color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--token-color-primary) 26%,transparent)}
[data-ticket-picker] .tp-stepper{display:inline-flex;align-items:center;gap:0.35rem;border:1px solid var(--token-color-line);border-radius:999px;padding:0.2rem;background:color-mix(in srgb,var(--token-color-ink) 5%,var(--token-color-surface-raised,transparent))}
[data-ticket-picker] .tp-step{width:2.1rem;height:2.1rem;border:0;border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;font-size:1.15rem;line-height:1;cursor:pointer}
[data-ticket-picker] .tp-step:disabled{opacity:0.35;cursor:not-allowed}
[data-ticket-picker] .tp-step:not(:disabled):hover{background:color-mix(in srgb,var(--token-color-primary) 16%,transparent)}
[data-ticket-picker] .tp-qty{min-width:1.6rem;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-cta{display:block;width:100%;margin-top:0.35rem;border:0;border-radius:999px;padding:0.9rem 1.6rem;font:inherit;font-size:0.95rem;font-weight:600;letter-spacing:0.02em;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));cursor:pointer}
[data-ticket-picker] .tp-cta:disabled{opacity:0.55;cursor:not-allowed}
[data-ticket-picker] .tp-cta:not(:disabled):hover{filter:brightness(1.06)}
[data-ticket-picker] .tp-alert{margin-top:1rem;padding:0.75rem 0.9rem;border-radius:12px;background:color-mix(in srgb,var(--token-color-primary) 12%,transparent);color:var(--token-color-ink);font-size:0.9rem;line-height:1.4}
[data-ticket-picker="held"] a{color:var(--token-color-primary);font-weight:600}

/* ── v2: cards, steps, quantity bar, sheet ──────────────────────────────── */
[data-ticket-picker] .tp-steps{display:flex;gap:0.5rem;list-style:none;margin:0 0 1rem;padding:0;font-size:0.68rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-steps li{flex:1;padding-top:0.5rem;border-top:2px solid var(--token-color-line)}
[data-ticket-picker] .tp-steps li[aria-current="step"]{color:var(--token-color-primary);border-color:var(--token-color-primary)}
[data-ticket-picker] .tp-cards{display:grid;gap:0.75rem}
@media (min-width:640px){[data-ticket-picker] .tp-cards{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1024px){[data-ticket-picker] .tp-cards{grid-template-columns:repeat(3,1fr)}}
[data-ticket-picker] .tp-card{position:relative;display:grid;grid-template-columns:96px 1fr;gap:0;margin:0;padding:0;overflow:hidden;border:1px solid var(--token-color-line);border-radius:18px;background:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent));cursor:pointer;transition:border-color 160ms ease,box-shadow 160ms ease}
@media (min-width:1024px){[data-ticket-picker] .tp-card{grid-template-columns:1fr}}
[data-ticket-picker] .tp-card:hover{border-color:color-mix(in srgb,var(--token-color-primary) 45%,transparent)}
[data-ticket-picker] .tp-card[data-on="1"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--token-color-primary) 22%,transparent)}
[data-ticket-picker] .tp-card .tp-radio{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
[data-ticket-picker] .tp-card:focus-within{outline:2px solid var(--token-color-primary);outline-offset:2px}
[data-ticket-picker] .tp-card-media{width:96px;min-height:104px;height:100%;object-fit:cover;display:block}
@media (min-width:1024px){[data-ticket-picker] .tp-card-media{width:100%;height:150px}}
[data-ticket-picker] .tp-card-ph{width:96px;min-height:104px;height:100%;display:grid;place-items:center;font-size:1.6rem;font-family:var(--site-heading-font,inherit);color:var(--token-color-primary);background:radial-gradient(80% 80% at 50% 50%,color-mix(in srgb,var(--token-color-primary) 16%,transparent),transparent)}
@media (min-width:1024px){[data-ticket-picker] .tp-card-ph{width:100%;height:150px}}
[data-ticket-picker] .tp-card-body{display:grid;gap:0.2rem;padding:0.9rem 0.95rem 0.9rem 1rem;min-width:0}
[data-ticket-picker] .tp-card-title{font-weight:600;line-height:1.3}
[data-ticket-picker] .tp-card-price{font-family:var(--site-heading-font,inherit);font-size:1.05rem;color:var(--token-color-primary)}
[data-ticket-picker] .tp-card-price[data-free="1"]{font-family:inherit;font-weight:600}
[data-ticket-picker] .tp-includes{margin:0.25rem 0 0;padding:0;list-style:none;font-size:0.82rem;line-height:1.4;color:var(--token-color-muted)}
[data-ticket-picker] .tp-includes li::before{content:"· ";color:var(--token-color-primary)}
[data-ticket-picker] .tp-badge{position:absolute;top:0.6rem;left:0.6rem;z-index:1;padding:0.25rem 0.55rem;border-radius:999px;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));font-size:0.6rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase}
[data-ticket-picker] .tp-bar{display:grid;grid-template-columns:auto 1fr auto;gap:0.75rem;align-items:center;margin-top:1rem;padding:0.75rem 1rem;border:1px solid var(--token-color-line);border-radius:18px;background:var(--token-color-surface-raised,var(--token-color-background))}
[data-ticket-picker] .tp-bar[data-fixed="1"]{position:fixed;left:0;right:0;bottom:0;z-index:40;margin:0;border-radius:0;border-width:1px 0 0;padding:0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--token-color-background) 96%,transparent);backdrop-filter:blur(8px)}
@media (min-width:1024px){[data-ticket-picker] .tp-bar[data-fixed="1"]{position:sticky;top:1rem;left:auto;right:auto;bottom:auto;margin-top:1rem;border-radius:18px;border-width:1px;padding:0.75rem 1rem}}
[data-ticket-picker] .tp-bar-total{font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-bar-total b{display:block;font-family:var(--site-heading-font,inherit);font-size:1.05rem;font-weight:500;letter-spacing:0.02em;color:var(--token-color-ink);font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-bar .tp-cta{width:auto;margin:0;padding:0.8rem 1.4rem}
[data-ticket-picker] .tp-nav{display:flex;justify-content:space-between;gap:0.75rem;margin-top:0.75rem}
[data-ticket-picker] .tp-back{border:0;background:transparent;color:var(--token-color-muted);font:inherit;font-size:0.9rem;cursor:pointer;padding:0.5rem 0}
[data-ticket-picker] .tp-summary{display:flex;justify-content:space-between;gap:1rem;margin:0.25rem 0 0.5rem;padding:0.75rem 0;border-top:1px solid var(--token-color-line);border-bottom:1px solid var(--token-color-line);font-size:0.92rem}
[data-ticket-picker] .tp-summary b{font-family:var(--site-heading-font,inherit);font-weight:500;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));background:linear-gradient(transparent,color-mix(in srgb,var(--token-color-background) 92%,transparent) 30%)}
@media (min-width:1024px){[data-ticket-picker] .tp-sticky-cta{display:none}}
[data-ticket-picker] .tp-sticky-cta .tp-cta{margin:0}
[data-ticket-picker] .tp-scrim{position:fixed;inset:0;z-index:50;background:color-mix(in srgb,var(--token-color-ink) 55%,transparent)}
[data-ticket-picker] .tp-sheet{position:fixed;left:0;right:0;bottom:0;z-index:51;max-height:88svh;overflow:auto;padding:1rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));border-top:1px solid var(--token-color-line);border-radius:22px 22px 0 0;background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink)}
@media (min-width:1024px){[data-ticket-picker] .tp-sheet{inset:0 0 0 auto;width:440px;max-height:none;border-radius:0;border-width:0 0 0 1px;padding:1.5rem}}
[data-ticket-picker] .tp-sheet .tp-bar{position:static;margin-top:1rem;border-radius:18px;border-width:1px;padding:0.75rem 1rem}
[data-ticket-picker] .tp-grab{width:44px;height:4px;margin:0 auto 0.9rem;border-radius:2px;background:var(--token-color-line)}
@media (min-width:1024px){[data-ticket-picker] .tp-grab{display:none}}
[data-ticket-picker] .tp-sheet-head{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:0.5rem}
[data-ticket-picker] .tp-close{border:0;background:transparent;color:var(--token-color-muted);font:inherit;font-size:0.85rem;cursor:pointer;padding:0.4rem 0}
@media (prefers-reduced-motion:no-preference){[data-ticket-picker] .tp-sheet{animation:tp-rise 240ms ease}}
@keyframes tp-rise{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
`;
