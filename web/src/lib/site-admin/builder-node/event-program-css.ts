/**
 * event_program stylesheet, injected once per island. Tokens only:
 * `--token-color-*` for every colour, `--site-heading-font` /
 * `--site-body-font` for type. No hex, no emoji, no glyph.
 *
 * This file carries the shared chrome (head, chips, groups, meta line), the
 * `timeline` layout and the `compact` layout; `cards`, `schedule` and
 * `lineup` live in their own sheets and are concatenated into `EP_CSS` so
 * every file stays well under the size ratchet.
 *
 * The `timeline` layout (default) is a premium editorial run-of-show
 * (owner ruling 2026-09-17: the LUMINA section it replaces mixed boxed cards
 * with plain rows, wasted vertical space and carried an emoji):
 *   - one column at every width, max 880px, centred, transparent background;
 *   - every row the same shape: `[time 96px][rail 24px][content][thumb 72px]`
 *     from 640px (a 4:5 cover, radius 8px), `[time 64px][rail 20px][content]
 *     [56px square]` on phones; the thumb column exists only with an image;
 *   - a 1px rail in primary at 35%, an 8px primary dot per row, the current
 *     item's dot with a soft 6px glow at 18%;
 *   - rows separated by the line token at 40%, no boxes, no hover;
 *   - night chips only with more than one group, sticky on phones.
 * `compact` is the dense agenda: one hairline row per item, no images.
 */
import { EP_CSS_CARDS } from "./event-program-css-cards";
import { EP_CSS_DRAWER } from "./event-program-css-drawer";
import { EP_CSS_LINEUP } from "./event-program-css-lineup";
import { EP_CSS_SCHEDULE } from "./event-program-css-schedule";

export const EP_CSS_BASE = `
[data-event-program]{color:var(--token-color-ink);font-family:var(--site-body-font,inherit);background:transparent;--ep-rail:color-mix(in srgb,var(--token-color-primary) 35%,transparent);--ep-glow:color-mix(in srgb,var(--token-color-primary) 18%,transparent);--ep-sep:color-mix(in srgb,var(--token-color-line) 40%,transparent);--ep-primary-12:color-mix(in srgb,var(--token-color-primary) 12%,transparent);--ep-surface:var(--token-color-surface-raised,color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-background)))}
[data-event-program="not_configured"],[data-event-program="disabled"],[data-event-program="empty"],[data-event-program="loading"],[data-event-program="unavailable"]{padding:1.25rem 1.35rem}
[data-event-program] .ep-status{margin:0;color:var(--token-color-muted,inherit)}
[data-event-program] .ep-trigger{all:unset;display:block;box-sizing:border-box;width:100%;cursor:pointer;text-align:left;font:inherit;color:inherit}
[data-event-program] .ep-trigger:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:3px;border-radius:8px}
[data-event-program] .ep-head{max-width:880px;margin:0 auto 1.5rem}
[data-event-program] .ep-eyebrow{margin:0 0 0.5rem;font-size:0.7rem;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:var(--token-color-primary)}
[data-event-program] .ep-heading{margin:0;font-family:var(--site-heading-font,inherit);font-weight:500;font-size:1.9rem;line-height:1.05;letter-spacing:-0.01em;color:var(--token-color-ink)}
[data-event-program] .ep-shell{display:flex;flex-direction:column;gap:1rem;max-width:880px;margin:0 auto}
[data-event-program][data-layout="cards"] .ep-shell,[data-event-program][data-layout="schedule"] .ep-shell,[data-event-program][data-layout="lineup"] .ep-shell,[data-event-program][data-layout="cards"] .ep-head,[data-event-program][data-layout="schedule"] .ep-head,[data-event-program][data-layout="lineup"] .ep-head{max-width:1200px}
[data-event-program] .ep-nav{position:sticky;top:0;z-index:2;display:flex;gap:0.5rem;margin:0 -1rem;padding:0.5rem 1rem;overflow-x:auto;scrollbar-width:none;background:var(--token-color-background);-webkit-overflow-scrolling:touch}
[data-event-program] .ep-nav::-webkit-scrollbar{display:none}
[data-event-program] .ep-chip{flex:0 0 auto;display:inline-flex;align-items:center;min-height:44px;padding:0.55rem 1.1rem;border:1px solid var(--token-color-line);border-radius:999px;background:transparent;color:var(--token-color-ink);font-family:inherit;font-size:0.7rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;cursor:pointer;transition:border-color 160ms ease,background-color 160ms ease,color 160ms ease}
[data-event-program] .ep-chip[data-on="1"]{border-color:var(--token-color-primary);background:var(--token-color-primary);color:var(--token-color-primary-on,var(--token-color-background))}
[data-event-program] .ep-chip:focus-visible{outline:2px solid var(--token-color-primary);outline-offset:2px}
[data-event-program] .ep-group{scroll-margin-top:72px}
[data-event-program] .ep-group-title{margin:1rem 0 0.25rem;font-size:0.7rem;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:var(--token-color-primary)}
[data-event-program] .ep-list{list-style:none;margin:0;padding:0;position:relative}
[data-event-program] .ep-item{position:relative;display:grid;grid-template-columns:64px 20px minmax(0,1fr);column-gap:0.75rem;align-items:start;min-height:44px;margin:0;padding:1rem 0;border-bottom:1px solid var(--ep-sep);background:transparent}
[data-event-program] .ep-row{margin:0;padding:0;list-style:none;min-width:0}
[data-event-program] .ep-row:last-child .ep-item{border-bottom:0}
[data-event-program] .ep-row>.ep-card{height:100%}
[data-event-program] .ep-line-cta{grid-column:2/4;font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase}
[data-event-program] .ep-item[data-image="1"]{grid-template-columns:64px 20px minmax(0,1fr) 56px}
[data-event-program] .ep-dot{grid-column:2;justify-self:center;width:8px;height:8px;margin-top:0.55rem;border-radius:50%;background:var(--token-color-primary)}
[data-event-program] .ep-item[data-now="1"] .ep-dot{box-shadow:0 0 0 6px var(--ep-glow)}
[data-event-program] .ep-time{grid-column:1;display:flex;flex-direction:column;gap:0.15rem;font-family:var(--site-heading-font,inherit);font-size:1.15rem;font-weight:500;line-height:1.25;color:var(--token-color-primary);font-variant-numeric:tabular-nums}
[data-event-program] .ep-time-end{font-family:var(--site-body-font,inherit);font-size:0.75rem;font-weight:400;color:var(--token-color-muted)}
[data-event-program] .ep-time-tba{font-family:var(--site-body-font,inherit);font-size:0.75rem;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;line-height:1.35;color:var(--token-color-muted)}
[data-event-program] .ep-plus{display:inline-block;margin-left:0.2rem;font-size:0.65rem;font-weight:600;vertical-align:super;color:var(--token-color-primary)}
[data-event-program] .ep-body{grid-column:3;min-width:0;display:flex;flex-direction:column;gap:0.35rem}
[data-event-program] .ep-title{margin:0;font-family:var(--site-heading-font,inherit);font-weight:500;font-size:1.15rem;line-height:1.2;color:var(--token-color-ink)}
[data-event-program] .ep-subtitle{margin:0;font-size:0.95rem;line-height:1.4;color:var(--token-color-ink)}
[data-event-program] .ep-desc{margin:0;font-size:0.95rem;line-height:1.5;color:var(--token-color-muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
[data-event-program] .ep-desc-2{-webkit-line-clamp:2}
[data-event-program] .ep-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0.35rem 0;margin:0.15rem 0 0;font-size:0.68rem;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;line-height:1.4;color:var(--token-color-muted)}
[data-event-program] .ep-meta>span+span::before{content:"\\00B7";margin:0 0.6rem;color:var(--token-color-muted)}
[data-event-program] .ep-performer a{color:inherit;text-decoration:underline;text-underline-offset:0.2em;text-decoration-color:var(--ep-rail)}
[data-event-program] .ep-place,[data-event-program] .ep-kind{color:var(--token-color-muted)}
[data-event-program] .ep-now{color:var(--token-color-primary);font-weight:700}
[data-event-program] .ep-cover{display:block;grid-column:4;width:56px;height:56px;object-fit:cover;border-radius:8px;background:var(--ep-primary-12)}
[data-event-program][data-layout="timeline"] .ep-list::before{content:"";position:absolute;top:0;bottom:0;left:calc(64px + 0.75rem + 10px);width:1px;background:var(--ep-rail)}
[data-event-program] .ep-line{display:grid;grid-template-columns:64px minmax(0,1fr) auto;column-gap:0.75rem;align-items:baseline;margin:0;padding:0.6rem 0;border-bottom:1px solid var(--ep-sep)}
[data-event-program] .ep-line:last-child{border-bottom:0}
[data-event-program] .ep-line-time{font-family:var(--site-heading-font,inherit);font-size:0.95rem;font-weight:500;color:var(--token-color-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
[data-event-program] .ep-line-title{font-family:var(--site-heading-font,inherit);font-size:1rem;font-weight:500;line-height:1.3;color:var(--token-color-ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-event-program] .ep-line-performer{font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted);text-align:right;white-space:nowrap}
[data-event-program] .ep-line .ep-now{font-size:0.68rem;letter-spacing:0.16em;text-transform:uppercase;grid-column:2/4}
[data-event-program][data-layout="compact"] .ep-shell{gap:0.5rem}
[data-event-program][data-layout="compact"] .ep-group-title{margin:0.75rem 0 0.1rem}
@media (min-width:640px){[data-event-program] .ep-item{grid-template-columns:96px 24px minmax(0,1fr);padding:1.25rem 0}[data-event-program] .ep-item[data-image="1"]{grid-template-columns:96px 24px minmax(0,1fr) 72px}[data-event-program] .ep-cover{width:72px;height:auto;aspect-ratio:4/5}[data-event-program] .ep-title{font-size:1.3rem}[data-event-program][data-layout="timeline"] .ep-list::before{left:calc(96px + 0.75rem + 12px)}[data-event-program] .ep-nav{margin:0;padding:0.5rem 0}[data-event-program] .ep-line{padding:0.75rem 0}}
@media (min-width:1024px){[data-event-program] .ep-heading{font-size:2.4rem}[data-event-program] .ep-shell[data-rail="1"]{display:grid;grid-template-columns:180px minmax(0,1fr);gap:2.5rem;align-items:start}[data-event-program] .ep-shell[data-rail="1"] .ep-nav{position:sticky;top:1rem;flex-direction:column;align-items:flex-start;overflow:visible;background:transparent;padding:0}[data-event-program] .ep-shell[data-rail="1"] .ep-chip{white-space:normal;text-align:left}[data-event-program] .ep-shell[data-rail="1"] .ep-groups{min-width:0}}
`;

export const EP_CSS = EP_CSS_BASE + EP_CSS_CARDS + EP_CSS_SCHEDULE + EP_CSS_LINEUP + EP_CSS_DRAWER;
