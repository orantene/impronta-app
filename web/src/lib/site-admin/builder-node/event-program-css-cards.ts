/**
 * event_program `cards` layout: a 1 → 2 → 3 grid (640px / 1024px). Each card
 * is a 16:10 cover, or without an image a 16:10 surface panel with the time
 * large in the heading font, then time · title · description (2 lines) ·
 * meta. One 1px line border at 40%, radius 12px, no shadow, no hover lift.
 * Tokens only.
 */
export const EP_CSS_CARDS = `
[data-event-program] .ep-cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr;gap:1rem}
[data-event-program] .ep-card{display:flex;flex-direction:column;margin:0;border:1px solid var(--ep-sep);border-radius:12px;overflow:hidden;background:transparent}
[data-event-program] .ep-card-cover{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--ep-primary-12)}
[data-event-program] .ep-card-panel{display:grid;place-items:center;width:100%;aspect-ratio:16/10;background:var(--ep-surface)}
[data-event-program] .ep-card-panel-time{font-family:var(--site-heading-font,inherit);font-size:2.4rem;font-weight:500;line-height:1;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-event-program] .ep-card-body{display:flex;flex-direction:column;gap:0.35rem;padding:1rem 1.1rem 1.15rem}
[data-event-program] .ep-card-time{display:flex;flex-direction:row;align-items:baseline;gap:0.5rem;font-family:var(--site-heading-font,inherit);font-size:1rem;font-weight:500;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-event-program] .ep-card .ep-title{font-size:1.15rem}
[data-event-program] .ep-card[data-now="1"]{border-color:var(--token-color-primary)}
@media (min-width:640px){[data-event-program] .ep-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1024px){[data-event-program] .ep-cards{grid-template-columns:repeat(3,minmax(0,1fr));gap:1.25rem}}
`;
