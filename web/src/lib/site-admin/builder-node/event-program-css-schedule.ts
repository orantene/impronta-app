/**
 * event_program `schedule` layout: desktop-first grid for multi-stage nights.
 * Columns per space, rows per 30-minute slot (the template columns/rows are
 * inline because the counts come from the data), item blocks spanning their
 * duration as surface panels with a 1px line border. On phones the grid is
 * hidden and the compact-by-space list with a space chip row shows instead.
 * No images. Tokens only.
 */
export const EP_CSS_SCHEDULE = `
[data-event-program] .ep-schedule{display:flex;flex-direction:column;gap:1rem}
[data-event-program] .ep-grid{display:none;gap:4px;align-items:stretch}
[data-event-program] .ep-grid-corner{grid-column:1;grid-row:1}
[data-event-program] .ep-grid-head{grid-row:1;padding:0 0.5rem 0.5rem;font-size:0.7rem;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:var(--token-color-primary);border-bottom:1px solid var(--ep-sep)}
[data-event-program] .ep-grid-slot{padding:0.35rem 0.5rem 0 0;font-family:var(--site-heading-font,inherit);font-size:0.85rem;font-weight:500;color:var(--token-color-muted);font-variant-numeric:tabular-nums;border-top:1px solid var(--ep-sep)}
[data-event-program] .ep-block{display:flex;flex-direction:column;gap:0.2rem;min-width:0;padding:0.6rem 0.75rem;border:1px solid var(--token-color-line);border-radius:8px;background:var(--ep-surface);overflow:hidden}
[data-event-program] .ep-block[data-now="1"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px var(--ep-glow)}
[data-event-program] .ep-block-time{font-family:var(--site-heading-font,inherit);font-size:0.85rem;font-weight:500;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-event-program] .ep-block-title{font-family:var(--site-heading-font,inherit);font-size:1rem;font-weight:500;line-height:1.25;color:var(--token-color-ink)}
[data-event-program] .ep-block-performer{font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--token-color-muted)}
[data-event-program] .ep-block .ep-now{font-size:0.68rem;letter-spacing:0.16em;text-transform:uppercase}
[data-event-program] .ep-schedule-unplaced{margin-top:0.5rem}
[data-event-program] .ep-schedule-phone{display:flex;flex-direction:column;gap:0.5rem}
[data-event-program] .ep-space-chips{position:static;margin:0;padding:0.25rem 0}
[data-event-program] .ep-space{scroll-margin-top:72px}
@media (min-width:640px){[data-event-program] .ep-grid{display:grid}[data-event-program] .ep-schedule-phone{display:none}}
`;
