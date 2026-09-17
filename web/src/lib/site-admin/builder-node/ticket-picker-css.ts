/**
 * ticket_picker stylesheet, injected once per island. Every colour is a
 * projected tenant token (`--token-color-*`); no hex literal, no parallel
 * palette, so Impronta reads gold on black and a pastel tenant reads pastel.
 *
 * Mobile first. Three surfaces:
 *   1. the tier cards, inline at every width, each with its own stepper;
 *   2. the order bar: fixed to the bottom of a phone, a sticky right rail on
 *      desktop (the `.tp-shop` grid opens the rail column at 1024px);
 *   3. the checkout: a bottom sheet on a phone (drag handle, 92svh), a 480px
 *      right drawer on desktop, both behind a scrim.
 * Plus the floating "Buy tickets" pill: bottom-centre on phones, bottom-right
 * on desktop, stepping left when the guest-chat launcher is on the page.
 * Every tap target is 44px or taller.
 */
export const TP_CSS = `
[data-ticket-picker]{color:var(--token-color-ink);font:inherit;--tp-ink-4:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent));--tp-ink-8:color-mix(in srgb,var(--token-color-ink) 8%,var(--token-color-surface-raised,transparent));--tp-primary-12:color-mix(in srgb,var(--token-color-primary) 12%,transparent);--tp-primary-24:color-mix(in srgb,var(--token-color-primary) 24%,transparent);--tp-primary-45:color-mix(in srgb,var(--token-color-primary) 45%,transparent);--tp-surface:var(--token-color-surface-raised,var(--token-color-background))}
[data-ticket-picker="root"],[data-ticket-picker="held"],[data-ticket-picker="not_configured"]{padding:1.25rem 1.35rem}
[data-ticket-picker="root"][data-tp-layout="cards"]{padding:0}
[data-ticket-picker] .tp-title{margin:0 0 1rem;font-size:1.05rem;font-weight:600;letter-spacing:-0.01em}
[data-ticket-picker] .tp-status{margin:0;color:var(--token-color-muted,inherit)}
[data-ticket-picker] .tp-section{margin:0 0 1.15rem}
[data-ticket-picker] .tp-section:last-of-type{margin-bottom:0}
[data-ticket-picker] .tp-label{display:block;margin:0 0 0.55rem;font-size:0.72rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-choices{display:flex;flex-direction:column;gap:0.5rem}
[data-ticket-picker] .tp-choice{display:grid;grid-template-columns:1.15rem 1fr auto;gap:0.75rem;align-items:center;margin:0;min-height:44px;padding:0.85rem 1rem;border:1px solid var(--token-color-line);border-radius:14px;background:var(--tp-ink-4);cursor:pointer;transition:border-color 160ms ease,box-shadow 160ms ease,background-color 160ms ease}
[data-ticket-picker] .tp-choice:hover{border-color:var(--tp-primary-45)}
[data-ticket-picker] .tp-choice[data-on="1"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px var(--tp-primary-24);background:color-mix(in srgb,var(--token-color-primary) 10%,var(--token-color-surface-raised,transparent))}
[data-ticket-picker] .tp-choice[data-off="1"]{opacity:0.55;cursor:not-allowed}
[data-ticket-picker] .tp-radio{appearance:none;width:1.15rem;height:1.15rem;margin:0;border:1.5px solid color-mix(in srgb,var(--token-color-ink) 35%,transparent);border-radius:50%;background:transparent;accent-color:var(--token-color-primary)}
[data-ticket-picker] .tp-choice[data-on="1"] .tp-radio{border-color:var(--token-color-primary);box-shadow:inset 0 0 0 3.5px var(--token-color-primary)}
[data-ticket-picker] .tp-choice-copy{min-width:0}
[data-ticket-picker] .tp-choice-title{display:block;font-weight:600;line-height:1.3}
[data-ticket-picker] .tp-choice-meta{display:block;margin-top:0.2rem;font-size:0.82rem;line-height:1.35;color:var(--token-color-muted)}
[data-ticket-picker] .tp-price{font-size:0.92rem;font-weight:600;white-space:nowrap;color:var(--token-color-ink)}
[data-ticket-picker] .tp-price[data-free="1"]{color:var(--token-color-primary)}
[data-ticket-picker] .tp-seats{display:flex;flex-wrap:wrap;gap:0.5rem}
[data-ticket-picker] .tp-seat{min-height:44px;min-width:44px;padding:0.55rem 0.85rem;border:1.5px solid var(--token-color-line);border-radius:12px;background:var(--tp-ink-4);color:inherit;font:inherit;font-size:0.9rem;cursor:pointer}
[data-ticket-picker] .tp-seat[data-on="1"]{border-color:var(--token-color-primary);background:var(--tp-primary-12);font-weight:600}
[data-ticket-picker] .tp-fields{display:flex;flex-direction:column;gap:0.85rem;margin-top:0.25rem}
[data-ticket-picker] .tp-field-label{display:block;margin:0 0 0.4rem;font-size:0.82rem;font-weight:600}
[data-ticket-picker] .tp-help{display:block;margin-top:0.4rem;font-size:0.8rem;line-height:1.4;color:var(--token-color-muted)}
[data-ticket-picker] .tp-field{width:100%;min-height:48px;box-sizing:border-box;font:inherit;font-size:16px;line-height:1.45;color:var(--token-color-ink);background:var(--tp-ink-8);border:1px solid color-mix(in srgb,var(--token-color-ink) 28%,transparent);border-radius:12px;padding:0.8rem 0.95rem;outline:none;transition:border-color 160ms ease,box-shadow 160ms ease}
[data-ticket-picker] .tp-field::placeholder{color:var(--token-color-muted);opacity:1}
[data-ticket-picker] .tp-field:hover{border-color:var(--tp-primary-45)}
[data-ticket-picker] .tp-field:focus,[data-ticket-picker] .tp-field:focus-visible{border-color:var(--token-color-primary);box-shadow:0 0 0 3px var(--tp-primary-24)}
[data-ticket-picker] .tp-field[aria-invalid="true"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px var(--tp-primary-24)}
[data-ticket-picker] .tp-field-error{display:block;margin-top:0.4rem;font-size:0.82rem;line-height:1.4;font-weight:600;color:var(--token-color-primary)}
[data-ticket-picker] .tp-stepper{display:inline-flex;align-items:center;gap:0.15rem;border:1px solid var(--token-color-line);border-radius:999px;padding:0.15rem;background:var(--tp-ink-8)}
[data-ticket-picker] .tp-step{width:44px;height:44px;border:0;border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;font-size:1.25rem;line-height:1;cursor:pointer;display:grid;place-items:center}
[data-ticket-picker] .tp-step:disabled{opacity:0.35;cursor:not-allowed}
[data-ticket-picker] .tp-step:not(:disabled):hover{background:color-mix(in srgb,var(--token-color-primary) 16%,transparent)}
[data-ticket-picker] .tp-step:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:2px}
[data-ticket-picker] .tp-qty{min-width:2rem;text-align:center;font-weight:600;font-size:1.05rem;font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-cta{display:inline-flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;min-height:48px;margin-top:0.35rem;border:0;border-radius:999px;padding:0.85rem 1.6rem;font:inherit;font-size:0.95rem;font-weight:700;letter-spacing:0.02em;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));cursor:pointer;transition:filter 160ms ease,transform 160ms ease}
[data-ticket-picker] .tp-cta:disabled{opacity:0.55;cursor:not-allowed}
[data-ticket-picker] .tp-cta:not(:disabled):hover{filter:brightness(1.06)}
[data-ticket-picker] .tp-cta:not(:disabled):active{transform:translateY(1px)}
[data-ticket-picker] .tp-cta:focus-visible{outline:2px solid var(--token-color-ink);outline-offset:3px}
[data-ticket-picker] .tp-cta-ghost{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0.6rem 1rem;border:1px solid var(--token-color-line);border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;font-size:0.9rem;font-weight:600;cursor:pointer}
[data-ticket-picker] .tp-cta-ghost:hover{border-color:var(--tp-primary-45)}
[data-ticket-picker] .tp-spinner{width:1rem;height:1rem;border-radius:50%;border:2px solid color-mix(in srgb,currentColor 35%,transparent);border-top-color:currentColor;animation:tp-spin 700ms linear infinite}
@keyframes tp-spin{to{transform:rotate(360deg)}}
[data-ticket-picker] .tp-alert{margin-top:1rem;padding:0.85rem 1rem;border-radius:12px;border:1px solid var(--tp-primary-45);background:var(--tp-primary-12);color:var(--token-color-ink);font-size:0.9rem;line-height:1.45}
[data-ticket-picker="held"] .tp-held{display:grid;gap:0.5rem;padding:1.25rem 1.35rem;border:1px solid var(--token-color-line);border-radius:18px;background:var(--tp-surface)}
[data-ticket-picker="held"] .tp-held b{font-family:var(--site-heading-font,inherit);font-size:1.15rem;font-weight:500;color:var(--token-color-primary)}
[data-ticket-picker="held"] a{color:var(--token-color-primary);font-weight:600}

/* ── shop grid: cards + order rail ─────────────────────────────────────── */
[data-ticket-picker] .tp-shop{display:grid;gap:1rem;align-items:start}
@media (min-width:1024px){[data-ticket-picker] .tp-shop{grid-template-columns:minmax(0,1fr) 300px;gap:1.5rem}}
[data-ticket-picker] .tp-main{min-width:0}
[data-ticket-picker] .tp-cards{display:grid;gap:0.75rem}
@media (min-width:640px){[data-ticket-picker] .tp-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}}
@media (min-width:1280px){[data-ticket-picker] .tp-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
[data-ticket-picker] .tp-card{position:relative;display:grid;grid-template-columns:96px minmax(0,1fr);margin:0;padding:0;overflow:hidden;border:1px solid var(--token-color-line);border-radius:18px;background:var(--tp-ink-4);transition:border-color 160ms ease,box-shadow 160ms ease}
@media (min-width:640px){[data-ticket-picker] .tp-card{grid-template-columns:minmax(0,1fr)}}
[data-ticket-picker] .tp-card:hover{border-color:var(--tp-primary-45)}
[data-ticket-picker] .tp-card[data-on="1"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px var(--tp-primary-24)}
[data-ticket-picker] .tp-card[data-soldout="1"]{opacity:0.6}
[data-ticket-picker] .tp-card:focus-within{outline:2px solid var(--token-color-primary);outline-offset:2px}
[data-ticket-picker] .tp-card-media{width:96px;height:100%;min-height:120px;aspect-ratio:4/5;object-fit:cover;display:block}
@media (min-width:640px){[data-ticket-picker] .tp-card-media{width:100%;height:auto;min-height:0;max-height:260px}}
[data-ticket-picker] .tp-card-ph{width:96px;height:100%;min-height:120px;display:grid;place-items:center;font-size:1.6rem;font-family:var(--site-heading-font,inherit);color:var(--token-color-primary);background:radial-gradient(80% 80% at 50% 50%,color-mix(in srgb,var(--token-color-primary) 16%,transparent),transparent)}
@media (min-width:640px){[data-ticket-picker] .tp-card-ph{width:100%;height:72px;min-height:0}}
[data-ticket-picker] .tp-card-body{display:grid;gap:0.3rem;padding:0.9rem 0.95rem 0.95rem 1rem;min-width:0;align-content:start}
[data-ticket-picker] .tp-card-title{font-family:var(--site-heading-font,inherit);font-weight:600;font-size:1.05rem;line-height:1.25;letter-spacing:0.01em}
[data-ticket-picker] .tp-card-price{display:flex;align-items:baseline;gap:0.4rem;font-family:var(--site-heading-font,inherit);font-size:1.5rem;line-height:1.1;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-card-price small{font-family:inherit;font-size:0.72rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-card-price[data-free="1"]{font-family:inherit;font-weight:700;font-size:1.15rem}
[data-ticket-picker] .tp-card-meta{font-size:0.82rem;line-height:1.4;color:var(--token-color-muted)}
[data-ticket-picker] .tp-includes{margin:0.15rem 0 0;padding:0;list-style:none;font-size:0.85rem;line-height:1.45;color:var(--token-color-muted)}
[data-ticket-picker] .tp-includes li{display:flex;gap:0.45rem}
[data-ticket-picker] .tp-includes li::before{content:"·";color:var(--token-color-primary);font-weight:700}
[data-ticket-picker] .tp-badge{position:absolute;top:0.6rem;left:0.6rem;z-index:1;padding:0.3rem 0.6rem;border-radius:999px;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));font-size:0.6rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase}
[data-ticket-picker] .tp-avail{display:inline-flex;align-items:center;gap:0.35rem;width:max-content;padding:0.2rem 0.55rem;border-radius:999px;font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase}
[data-ticket-picker] .tp-avail[data-level="low"]{color:var(--token-color-primary);background:var(--tp-primary-12)}
[data-ticket-picker] .tp-avail[data-level="sold_out"],[data-ticket-picker] .tp-avail[data-level="link"]{color:var(--token-color-muted);border:1px solid var(--token-color-line)}
[data-ticket-picker] .tp-qty-row{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin-top:0.55rem;padding-top:0.7rem;border-top:1px solid var(--token-color-line)}
[data-ticket-picker] .tp-qty-hint{font-size:0.75rem;line-height:1.3;color:var(--token-color-muted);text-align:right}

/* ── the order bar / rail ──────────────────────────────────────────────── */
[data-ticket-picker] .tp-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0.75rem 1rem;align-items:center;padding:0.75rem 1rem;border:1px solid var(--token-color-line);border-radius:18px;background:var(--tp-surface)}
[data-ticket-picker] .tp-bar-head{display:none}
[data-ticket-picker] .tp-bar-lines{display:grid;gap:0.15rem;min-width:0}
[data-ticket-picker] .tp-bar-line{display:flex;justify-content:space-between;gap:0.75rem;font-size:0.85rem;line-height:1.35}
[data-ticket-picker] .tp-bar-line span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-ticket-picker] .tp-bar-line[data-sub="1"]{display:none}
[data-ticket-picker] .tp-bar-total{display:flex;justify-content:space-between;gap:0.75rem;align-items:baseline;font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-bar-total b{font-family:var(--site-heading-font,inherit);font-size:1.15rem;font-weight:500;letter-spacing:0.02em;color:var(--token-color-ink);font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-bar .tp-cta{width:auto;margin:0;padding:0.8rem 1.35rem;white-space:nowrap}
[data-ticket-picker] .tp-bar-empty{margin:0;font-size:0.9rem;line-height:1.45;color:var(--token-color-muted)}
@media (max-width:1023px){
  [data-ticket-picker] .tp-bar{position:fixed;left:0;right:0;bottom:0;z-index:96;margin:0;border-radius:18px 18px 0 0;border-width:1px 0 0;padding:0.8rem 1rem calc(0.8rem + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--tp-surface) 96%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 -12px 32px color-mix(in srgb,var(--token-color-background,transparent) 55%,transparent)}
  [data-ticket-picker] .tp-bar[data-empty="1"],[data-ticket-picker][data-tp-checkout-open="1"] .tp-bar{display:none}
  [data-ticket-picker] .tp-shop[data-has-order="1"]{padding-bottom:5.5rem}
}
@media (min-width:1024px){
  [data-ticket-picker] .tp-bar{position:sticky;top:1rem;grid-template-columns:minmax(0,1fr);padding:1.1rem 1.15rem 1.15rem}
  [data-ticket-picker] .tp-bar-head{display:block;margin:0 0 0.35rem;font-size:0.72rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}
  [data-ticket-picker] .tp-bar-line[data-sub="1"]{display:flex;color:var(--token-color-muted)}
  [data-ticket-picker] .tp-bar-total{padding-top:0.6rem;margin-top:0.35rem;border-top:1px solid var(--token-color-line)}
  [data-ticket-picker] .tp-bar .tp-cta{width:100%;margin-top:0.75rem}
}

/* ── floating "Buy tickets" pill ───────────────────────────────────────── */
[data-ticket-picker] .tp-float{position:fixed;left:50%;bottom:calc(1rem + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:96;display:inline-flex;align-items:center;gap:0.5rem;min-height:52px;padding:0.85rem 1.5rem;border:0;border-radius:999px;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));font:inherit;font-size:0.9rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;cursor:pointer;box-shadow:0 14px 34px color-mix(in srgb,var(--token-color-background,transparent) 60%,transparent),0 0 0 1px color-mix(in srgb,var(--token-color-primary-on,transparent) 12%,transparent)}
[data-ticket-picker] .tp-float:hover{filter:brightness(1.06)}
[data-ticket-picker] .tp-float:focus-visible{outline:2px solid var(--token-color-ink);outline-offset:3px}
@media (min-width:1024px){[data-ticket-picker] .tp-float{left:auto;right:24px;bottom:24px;transform:none}[data-ticket-picker] .tp-float[data-yield-chat="1"]{right:96px}}
@media (prefers-reduced-motion:no-preference){[data-ticket-picker] .tp-float{animation:tp-pop 220ms ease}}
@keyframes tp-pop{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@media (min-width:1024px){@keyframes tp-pop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}}

/* ── checkout: bottom sheet / right drawer ─────────────────────────────── */
[data-ticket-picker] .tp-scrim{position:fixed;inset:0;z-index:100;background:color-mix(in srgb,var(--token-color-background,var(--token-color-ink)) 62%,transparent);backdrop-filter:blur(2px)}
[data-ticket-picker] .tp-sheet{position:fixed;left:0;right:0;bottom:0;z-index:101;display:flex;flex-direction:column;max-height:92svh;padding:0.5rem 0 0;border-top:1px solid var(--token-color-line);border-radius:22px 22px 0 0;background:var(--tp-surface);color:var(--token-color-ink);box-shadow:0 -24px 60px color-mix(in srgb,var(--token-color-background,transparent) 70%,transparent);touch-action:pan-y}
[data-ticket-picker] .tp-sheet-body{overflow:auto;overscroll-behavior:contain;padding:0 1.25rem calc(1.25rem + env(safe-area-inset-bottom))}
@media (min-width:1024px){[data-ticket-picker] .tp-sheet{inset:0 0 0 auto;width:480px;max-height:none;border-radius:0;border-width:0 0 0 1px;padding-top:1.25rem}[data-ticket-picker] .tp-sheet-body{padding:0 1.75rem 1.75rem}}
[data-ticket-picker] .tp-grab{flex:0 0 auto;width:44px;height:4px;margin:0.4rem auto 0.9rem;border-radius:2px;background:var(--token-color-line)}
@media (min-width:1024px){[data-ticket-picker] .tp-grab{display:none}}
[data-ticket-picker] .tp-sheet-head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:0 1.25rem 0.75rem}
@media (min-width:1024px){[data-ticket-picker] .tp-sheet-head{padding:0 1.75rem 0.75rem}}
[data-ticket-picker] .tp-sheet-head .tp-title{margin:0;font-family:var(--site-heading-font,inherit);font-size:1.2rem;font-weight:500;letter-spacing:0.02em}
[data-ticket-picker] .tp-close{min-width:44px;min-height:44px;border:1px solid var(--token-color-line);border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;padding:0 0.9rem}
[data-ticket-picker] .tp-close:hover{border-color:var(--tp-primary-45)}
[data-ticket-picker] .tp-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:0.4rem;list-style:none;margin:0 0 1.15rem;padding:0;font-size:0.66rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-progress li{padding-top:0.55rem;border-top:2px solid var(--token-color-line)}
[data-ticket-picker] .tp-progress li[data-state="done"]{border-color:var(--token-color-primary);color:var(--token-color-muted)}
[data-ticket-picker] .tp-progress li[data-state="current"]{border-color:var(--token-color-primary);color:var(--token-color-primary)}
[data-ticket-picker] .tp-summary{display:grid;gap:0.4rem;margin:0 0 1.15rem;padding:0.9rem 1rem;border:1px solid var(--token-color-line);border-radius:14px;background:var(--tp-ink-4);font-size:0.9rem}
[data-ticket-picker] .tp-summary-row{display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
[data-ticket-picker] .tp-summary-row[data-muted="1"]{color:var(--token-color-muted);font-size:0.82rem}
[data-ticket-picker] .tp-summary-row[data-total="1"]{margin-top:0.25rem;padding-top:0.55rem;border-top:1px solid var(--token-color-line);font-weight:600}
[data-ticket-picker] .tp-summary-row[data-total="1"] b{font-family:var(--site-heading-font,inherit);font-size:1.25rem;font-weight:500;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-summary .tp-cta-ghost{justify-self:start;min-height:36px;padding:0.3rem 0.75rem;font-size:0.8rem}
[data-ticket-picker] .tp-fine{margin:0.25rem 0 0;font-size:0.8rem;line-height:1.45;color:var(--token-color-muted)}
[data-ticket-picker] .tp-actions{display:grid;gap:0.6rem;margin-top:0.5rem}
[data-ticket-picker] .tp-back{min-height:44px;border:0;background:transparent;color:var(--token-color-muted);font:inherit;font-size:0.9rem;cursor:pointer;padding:0.5rem 0}
@media (prefers-reduced-motion:no-preference){[data-ticket-picker] .tp-sheet{animation:tp-rise 240ms ease}[data-ticket-picker] .tp-scrim{animation:tp-fade 200ms ease}}
@keyframes tp-rise{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes tp-fade{from{opacity:0}to{opacity:1}}
/* The guest-chat launcher (body-level, z 95) yields while a checkout is open. */
body:has([data-tp-checkout-open="1"]) [data-guest-chat-launcher]{opacity:0;pointer-events:none;transition:opacity 160ms ease}
`;
