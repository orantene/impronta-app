/**
 * event_program `lineup` layout: the image-first performer wall, 2 → 3 → 4
 * tiles (640px / 1024px). Each tile is a 4:5 cover with a bottom scrim (the
 * background token, transparent to 85%) and the name in the heading font
 * over it; time and the optional kind word small above the name. A tile
 * without an image is the surface panel with initials in the heading font.
 * The whole tile links to the performer's profile when there is one. Tokens
 * only; no glyph.
 */
export const EP_CSS_LINEUP = `
[data-event-program] .ep-tiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0.75rem}
[data-event-program] .ep-tile{margin:0;min-width:0}
[data-event-program] .ep-tile-link{position:relative;display:block;aspect-ratio:4/5;border-radius:12px;overflow:hidden;background:var(--ep-surface);color:var(--token-color-ink);text-decoration:none}
[data-event-program] a.ep-tile-link:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:3px}
[data-event-program] .ep-tile-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
[data-event-program] .ep-tile-panel{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--site-heading-font,inherit);font-size:2.6rem;font-weight:500;letter-spacing:0.04em;color:var(--token-color-primary)}
[data-event-program] .ep-tile-scrim{position:absolute;left:0;right:0;bottom:0;height:60%;background:linear-gradient(to bottom,transparent,color-mix(in srgb,var(--token-color-background) 85%,transparent))}
[data-event-program] .ep-tile-text{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:0.25rem;padding:0.85rem 0.9rem}
[data-event-program] .ep-tile-meta{display:flex;flex-wrap:wrap;gap:0.35rem 0;font-size:0.68rem;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-event-program] .ep-tile-meta>span+span::before{content:"\\00B7";margin:0 0.5rem}
[data-event-program] .ep-tile-name{font-family:var(--site-heading-font,inherit);font-size:1.15rem;font-weight:500;line-height:1.15;color:var(--token-color-ink)}
[data-event-program] .ep-tile[data-now="1"] .ep-tile-link{box-shadow:inset 0 0 0 2px var(--token-color-primary)}
@media (min-width:640px){[data-event-program] .ep-tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}[data-event-program] .ep-tile-name{font-size:1.3rem}}
@media (min-width:1024px){[data-event-program] .ep-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
