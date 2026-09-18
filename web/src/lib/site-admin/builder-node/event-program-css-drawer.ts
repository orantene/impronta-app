/**
 * event_program item drawer: the ticket checkout's shell (bottom sheet
 * 88svh on phones, 440px right panel from 1024px, scrim) with the block's
 * type, plus the row trigger reset (a row that opens the drawer is a
 * `button` that must look exactly like the row). Tokens only.
 */
export const EP_CSS_DRAWER = `
[data-event-program] .ep-trigger{display:grid;width:100%;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;-webkit-appearance:none;appearance:none}
[data-event-program] .ep-trigger:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:3px;border-radius:8px}
[data-event-program] .ep-trigger.ep-card{display:flex}
[data-event-program] .ep-trigger.ep-tile-link{display:block}
[data-event-program] .ep-cta-cue{color:var(--token-color-primary);font-weight:600}
[data-event-program] .ep-cta-link{color:var(--token-color-primary);font-weight:600;text-decoration:underline;text-underline-offset:0.2em}
[data-event-program] .ep-scrim{position:fixed;inset:0;z-index:100;background:color-mix(in srgb,var(--token-color-background,var(--token-color-ink)) 62%,transparent);backdrop-filter:blur(2px)}
[data-event-program] .ep-sheet{position:fixed;left:0;right:0;bottom:0;z-index:101;display:flex;flex-direction:column;max-height:88svh;padding:0.75rem 0 0;border-top:1px solid var(--token-color-line);border-radius:22px 22px 0 0;background:var(--ep-surface);color:var(--token-color-ink)}
[data-event-program] .ep-sheet-head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:0 1.25rem 0.75rem;border-bottom:1px solid var(--ep-sep)}
[data-event-program] .ep-sheet-kicker{font-family:var(--site-heading-font,inherit);font-size:1rem;font-weight:500;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-event-program] .ep-close{min-height:44px;padding:0.5rem 1rem;border:1px solid var(--token-color-line);border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;font-size:0.75rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer}
[data-event-program] .ep-close:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:2px}
[data-event-program] .ep-sheet-body{display:flex;flex-direction:column;gap:1rem;overflow:auto;overscroll-behavior:contain;padding:1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom))}
[data-event-program] .ep-sheet-hero{display:block;width:100%;aspect-ratio:4/5;max-height:52svh;object-fit:cover;border-radius:12px;background:var(--ep-primary-12)}
[data-event-program] .ep-sheet-title{margin:0;font-family:var(--site-heading-font,inherit);font-size:1.7rem;font-weight:500;line-height:1.1;color:var(--token-color-ink)}
[data-event-program] .ep-sheet-performer{display:flex;flex-direction:column;gap:0.35rem;padding-top:0.75rem;border-top:1px solid var(--ep-sep)}
[data-event-program] .ep-sheet-name{margin:0;font-family:var(--site-heading-font,inherit);font-size:1.15rem;font-weight:500}
[data-event-program] .ep-sheet-bio,[data-event-program] .ep-sheet-desc{margin:0;font-size:0.95rem;line-height:1.55;color:var(--token-color-muted)}
[data-event-program] .ep-sheet-links{display:flex;flex-wrap:wrap;gap:0.35rem 1rem;margin:0.25rem 0 0;font-size:0.72rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase}
[data-event-program] .ep-sheet-links a{color:var(--token-color-primary);text-decoration:underline;text-underline-offset:0.2em;min-height:44px;display:inline-flex;align-items:center}
[data-event-program] .ep-sheet-gallery{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0.4rem}
[data-event-program] .ep-sheet-thumb{display:block;width:100%;aspect-ratio:1/1;margin:0;padding:0;border:2px solid transparent;border-radius:8px;overflow:hidden;background:var(--ep-primary-12);cursor:pointer}
[data-event-program] .ep-sheet-thumb[data-on="1"]{border-color:var(--token-color-primary)}
[data-event-program] .ep-sheet-thumb:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:2px}
[data-event-program] .ep-sheet-thumb img{display:block;width:100%;height:100%;object-fit:cover}
[data-event-program] .ep-sheet-video{aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:var(--ep-primary-12)}
[data-event-program] .ep-sheet-video iframe{display:block;width:100%;height:100%;border:0}
[data-event-program] .ep-sheet-sponsor{margin:0;font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--token-color-muted)}
[data-event-program] .ep-sheet-sponsor a{color:inherit;text-decoration:underline;text-underline-offset:0.2em}
[data-event-program] .ep-cta{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:48px;padding:0.85rem 1.6rem;border:0;border-radius:999px;font:inherit;font-size:0.8rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--token-color-background))}
[data-event-program] .ep-cta:focus-visible{outline:2px solid var(--token-color-ink);outline-offset:3px}
@media (min-width:1024px){[data-event-program] .ep-sheet{inset:0 0 0 auto;width:440px;max-height:none;border-radius:0;border-width:0 0 0 1px;padding-top:1.25rem}[data-event-program] .ep-sheet-head,[data-event-program] .ep-sheet-body{padding-left:1.75rem;padding-right:1.75rem}}
@media (prefers-reduced-motion:no-preference){[data-event-program] .ep-sheet{animation:ep-rise 240ms ease}[data-event-program] .ep-scrim{animation:ep-fade 200ms ease}}
@keyframes ep-rise{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes ep-fade{from{opacity:0}to{opacity:1}}
`;
