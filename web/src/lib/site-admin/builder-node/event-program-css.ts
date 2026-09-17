/**
 * event_program stylesheet, injected once per island. Every colour is a
 * projected tenant token (`--token-color-*`); no hex literal, no parallel
 * palette. Mobile first (proposal §9):
 *   - the group nav is a sticky horizontal chip strip on phones and a side
 *     rail from 1024px; it exists only with more than one group;
 *   - the timeline is VERTICAL at every width (a horizontal timeline is a
 *     desktop-only style the MVP does not ship), time column 64px;
 *   - cards are one column on phones, three from 768px;
 *   - every tap target is 44px or taller.
 */
export const EP_CSS = `
[data-event-program]{color:var(--token-color-ink);font:inherit;--ep-ink-4:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent));--ep-ink-8:color-mix(in srgb,var(--token-color-ink) 8%,var(--token-color-surface-raised,transparent));--ep-primary-12:color-mix(in srgb,var(--token-color-primary) 12%,transparent);--ep-primary-24:color-mix(in srgb,var(--token-color-primary) 24%,transparent);--ep-surface:var(--token-color-surface-raised,var(--token-color-background))}
[data-event-program="not_configured"],[data-event-program="disabled"],[data-event-program="empty"],[data-event-program="loading"],[data-event-program="unavailable"]{padding:1.25rem 1.35rem}
[data-event-program] .ep-status{margin:0;color:var(--token-color-muted,inherit)}
[data-event-program] .ep-heading{margin:0 0 1rem;font-size:1.35rem;font-weight:600;letter-spacing:-0.01em;line-height:1.2}
[data-event-program] .ep-shell{display:flex;flex-direction:column;gap:1rem}
[data-event-program] .ep-nav{position:sticky;top:0;z-index:2;display:flex;gap:0.5rem;margin:0 -1rem;padding:0.5rem 1rem;overflow-x:auto;scrollbar-width:none;background:var(--token-color-background);-webkit-overflow-scrolling:touch}
[data-event-program] .ep-nav::-webkit-scrollbar{display:none}
[data-event-program] .ep-chip{flex:0 0 auto;min-height:44px;padding:0.55rem 1rem;border:1px solid var(--token-color-line);border-radius:999px;background:var(--ep-ink-4);color:var(--token-color-ink);font:inherit;font-size:0.9rem;font-weight:600;white-space:nowrap;cursor:pointer;transition:border-color 160ms ease,background-color 160ms ease}
[data-event-program] .ep-chip[data-on="1"]{border-color:var(--token-color-primary);background:var(--ep-primary-12)}
[data-event-program] .ep-chip:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:2px}
[data-event-program] .ep-group{scroll-margin-top:72px}
[data-event-program] .ep-group-title{margin:0.5rem 0 0.75rem;font-size:0.78rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted)}
[data-event-program] .ep-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.75rem}
[data-event-program] .ep-item{position:relative;display:grid;grid-template-columns:64px 1fr;gap:0.85rem;align-items:start;min-height:44px;margin:0;padding:0.85rem 1rem;border:1px solid var(--token-color-line);border-radius:14px;background:var(--ep-ink-4)}
[data-event-program] .ep-item[data-now="1"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px var(--ep-primary-24)}
[data-event-program] .ep-time{display:flex;flex-direction:column;gap:0.15rem;font-variant-numeric:tabular-nums;font-size:0.9rem;font-weight:600;line-height:1.25}
[data-event-program] .ep-time-end{font-weight:400;color:var(--token-color-muted)}
[data-event-program] .ep-time-tba{font-size:0.78rem;font-weight:500;color:var(--token-color-muted)}
[data-event-program] .ep-plus{display:inline-block;margin-left:0.25rem;font-size:0.7rem;font-weight:700;color:var(--token-color-primary);vertical-align:super}
[data-event-program] .ep-body{min-width:0;display:flex;flex-direction:column;gap:0.25rem}
[data-event-program] .ep-title{margin:0;font-size:1rem;font-weight:600;line-height:1.3}
[data-event-program] .ep-performer{margin:0;font-size:0.9rem;line-height:1.35}
[data-event-program] .ep-performer a{color:inherit;text-decoration:underline;text-underline-offset:0.15em}
[data-event-program] .ep-meta{margin:0;font-size:0.82rem;line-height:1.35;color:var(--token-color-muted)}
[data-event-program] .ep-desc{margin:0.25rem 0 0;font-size:0.9rem;line-height:1.45;color:var(--token-color-muted)}
[data-event-program] .ep-now{display:inline-flex;align-items:center;gap:0.35rem;margin-top:0.35rem;padding:0.2rem 0.6rem;border-radius:999px;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase}
[data-event-program] .ep-cover{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:var(--ep-ink-8)}
[data-event-program] .ep-item[data-image="1"]{grid-template-columns:64px 72px 1fr}
[data-event-program] .ep-item[data-image="1"] .ep-cover{aspect-ratio:1/1}
[data-event-program] .ep-item[data-kind="doors"],[data-event-program] .ep-item[data-kind="close"],[data-event-program] .ep-item[data-kind="break"]{background:transparent;border-style:dashed}
[data-event-program][data-ep-layout="timeline"] .ep-list{position:relative;padding-left:0}
[data-event-program][data-ep-layout="timeline"] .ep-list::before{content:"";position:absolute;top:0.5rem;bottom:0.5rem;left:78px;width:2px;background:var(--token-color-line)}
[data-event-program][data-ep-layout="timeline"] .ep-item{border:0;background:transparent;padding:0.35rem 0}
[data-event-program][data-ep-layout="timeline"] .ep-item::before{content:"";position:absolute;left:73px;top:0.85rem;width:12px;height:12px;border-radius:50%;background:var(--token-color-background);border:2px solid var(--token-color-line);box-sizing:border-box}
[data-event-program][data-ep-layout="timeline"] .ep-item[data-now="1"]{box-shadow:none}
[data-event-program][data-ep-layout="timeline"] .ep-item[data-now="1"]::before{background:var(--token-color-primary);border-color:var(--token-color-primary)}
[data-event-program][data-ep-layout="timeline"] .ep-body{padding-left:1.25rem;padding-bottom:0.75rem;border-bottom:1px solid var(--token-color-line)}
[data-event-program][data-ep-layout="timeline"] .ep-item[data-image="1"]{grid-template-columns:64px 1fr}
[data-event-program][data-ep-layout="timeline"] .ep-item[data-image="1"] .ep-cover{width:72px;aspect-ratio:1/1;float:right;margin:0 0 0.5rem 0.75rem}
[data-event-program][data-ep-layout="cards"] .ep-list{display:grid;grid-template-columns:1fr;gap:0.85rem}
[data-event-program][data-ep-layout="cards"] .ep-item{grid-template-columns:1fr;padding:0;overflow:hidden;background:var(--ep-surface)}
[data-event-program][data-ep-layout="cards"] .ep-item[data-image="1"]{grid-template-columns:1fr}
[data-event-program][data-ep-layout="cards"] .ep-item[data-image="1"] .ep-cover{aspect-ratio:4/3;border-radius:0}
[data-event-program][data-ep-layout="cards"] .ep-time{flex-direction:row;gap:0.35rem;padding:0.85rem 1rem 0}
[data-event-program][data-ep-layout="cards"] .ep-body{padding:0.35rem 1rem 1rem}
[data-event-program][data-ep-layout="compact"] .ep-list{gap:0}
[data-event-program][data-ep-layout="compact"] .ep-item{border:0;border-bottom:1px solid var(--token-color-line);border-radius:0;background:transparent;padding:0.65rem 0.25rem}
[data-event-program][data-ep-layout="compact"] .ep-item[data-image="1"]{grid-template-columns:64px 44px 1fr}
[data-event-program][data-ep-layout="compact"] .ep-title{font-size:0.95rem}
[data-event-program][data-ep-layout="compact"] .ep-desc{display:none}
@media (min-width:768px){[data-event-program][data-ep-layout="cards"] .ep-list{grid-template-columns:repeat(3,minmax(0,1fr))}[data-event-program] .ep-nav{margin:0;padding:0.5rem 0}}
@media (min-width:1024px){[data-event-program] .ep-shell[data-rail="1"]{display:grid;grid-template-columns:200px minmax(0,1fr);gap:2rem;align-items:start}[data-event-program] .ep-shell[data-rail="1"] .ep-nav{position:sticky;top:1rem;flex-direction:column;overflow:visible;background:transparent;padding:0}[data-event-program] .ep-shell[data-rail="1"] .ep-chip{white-space:normal;text-align:left}[data-event-program] .ep-shell[data-rail="1"] .ep-groups{min-width:0}}
`;
