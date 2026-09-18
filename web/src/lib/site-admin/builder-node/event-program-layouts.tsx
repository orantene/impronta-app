"use client";

/**
 * event_program — the five layouts' markup. One component for many tenants,
 * so every layout is a real, designed option sharing the timeline's design
 * language: tokens, heading font for titles and times, hairlines, no boxes
 * inside boxes, no emoji, a thumb or cover only when an image exists.
 *
 *   timeline  the editorial run-of-show (time · rail dot · content · thumb)
 *   cards     1 → 2 → 3 grid, 16:10 cover or a surface panel with the time
 *   compact   dense agenda, one line per item, no images, no descriptions
 *   schedule  columns per space, 30-minute rows (grid); compact-by-space
 *             list on phones
 *   lineup    image-first performer wall, 2 → 3 → 4 tiles, initials fallback
 *
 * Every row / card / tile keeps `data-testid="event-program-item"` and the
 * same data attributes so one test walks every layout.
 */

import { initials, lineupName } from "./event-program-lineup-tiles";
import type { PlacedItem, ReadyProgram } from "./event-program-model";
import { buildScheduleGrid, type ScheduleGrid } from "./event-program-schedule-grid";

export type RowProps = {
  placed: PlacedItem;
  now: boolean;
  images: boolean;
  descriptions: boolean;
  kind: boolean;
  place: string | null;
  t: (k: string) => string;
};

export function placeName(program: Pick<ReadyProgram, "spaces">, spaceId: string | null): string | null {
  return spaceId ? (program.spaces.find((s) => s.id === spaceId)?.name ?? null) : null;
}

function performerLabel(placed: PlacedItem, t: (k: string) => string): string | null {
  const p = placed.item.performer;
  if (!p) return null;
  return p.tba && !p.name ? t("performerTba") : p.name;
}

function itemAttrs(placed: PlacedItem, now: boolean, image: boolean) {
  return {
    "data-testid": "event-program-item",
    "data-kind": placed.item.kind,
    "data-now": now ? "1" : undefined,
    "data-image": image ? "1" : undefined,
    "data-tba": placed.item.timeTba ? "1" : undefined,
  } as const;
}

function TimeCell({ placed, t, className = "ep-time" }: { placed: PlacedItem; t: (k: string) => string; className?: string }) {
  const { timeLabel, endTimeLabel, dayOffset } = placed;
  return (
    <div className={className}>
      {timeLabel ? (
        <>
          <span>
            {timeLabel}
            {dayOffset > 0 ? <span className="ep-plus" title={t("nextDay")} data-testid="event-program-plus-day">+{dayOffset}</span> : null}
          </span>
          {endTimeLabel ? <span className="ep-time-end">{endTimeLabel}</span> : null}
        </>
      ) : (
        <span className="ep-time-tba">{t("tba")}</span>
      )}
    </div>
  );
}

function MetaLine({ placed, now, kind, place, t }: Pick<RowProps, "placed" | "now" | "kind" | "place" | "t">) {
  const performer = placed.item.performer;
  const name = performerLabel(placed, t);
  const kindLabel = kind ? t(`kind_${placed.item.kind}`) : null;
  if (!name && !place && !kindLabel && !now) return null;
  return (
    <p className="ep-meta">
      {name ? (
        <span className="ep-performer" data-testid="event-program-performer">
          {performer?.profileHref ? <a href={performer.profileHref}>{name}</a> : name}
        </span>
      ) : null}
      {place ? <span className="ep-place">{place}</span> : null}
      {kindLabel ? <span className="ep-kind" data-testid="event-program-kind">{kindLabel}</span> : null}
      {now ? <span className="ep-now" data-testid="event-program-now" aria-label={t("nowLabel")}>{t("now")}</span> : null}
    </p>
  );
}

/** timeline: time · rail dot · content · thumb (4:5 at right from 640px, 56px square on phones). */
export function TimelineRow(props: RowProps) {
  const { placed, now, images, descriptions } = props;
  const { item } = placed;
  const cover = images && item.coverUrl ? item.coverUrl : null;
  return (
    <li className="ep-item" {...itemAttrs(placed, now, !!cover)}>
      <TimeCell placed={placed} t={props.t} />
      <span className="ep-dot" aria-hidden="true" data-testid="event-program-dot" />
      <div className="ep-body">
        <p className="ep-title">{item.title}</p>
        {item.subtitle ? <p className="ep-subtitle">{item.subtitle}</p> : null}
        {descriptions && item.description ? <p className="ep-desc">{item.description}</p> : null}
        <MetaLine {...props} />
      </div>
      {cover ? <img className="ep-cover" src={cover} alt="" loading="lazy" data-testid="event-program-cover" /> : null}
    </li>
  );
}

/** cards: 16:10 cover, or a surface panel with the time large; then time · title · description · meta. */
export function CardItem(props: RowProps) {
  const { placed, now, images, descriptions, t } = props;
  const { item } = placed;
  const cover = images && item.coverUrl ? item.coverUrl : null;
  return (
    <li className="ep-card" {...itemAttrs(placed, now, !!cover)}>
      {cover ? (
        <img className="ep-card-cover" src={cover} alt="" loading="lazy" data-testid="event-program-cover" />
      ) : (
        <div className="ep-card-panel" aria-hidden="true" data-testid="event-program-card-panel">
          <span className="ep-card-panel-time">{placed.timeLabel ?? t("tba")}</span>
        </div>
      )}
      <div className="ep-card-body">
        <TimeCell placed={placed} t={t} className="ep-card-time" />
        <p className="ep-title">{item.title}</p>
        {descriptions && item.description ? <p className="ep-desc ep-desc-2">{item.description}</p> : null}
        <MetaLine {...props} />
      </div>
    </li>
  );
}

/** compact: one line, `[time 64px] [title …] [performer, muted, right]`. */
export function CompactRow(props: RowProps) {
  const { placed, now, t } = props;
  const name = performerLabel(placed, t);
  return (
    <li className="ep-line" {...itemAttrs(placed, now, false)}>
      <span className="ep-line-time">
        {placed.timeLabel ?? <span className="ep-time-tba">{t("tba")}</span>}
        {placed.dayOffset > 0 ? <span className="ep-plus" data-testid="event-program-plus-day">+{placed.dayOffset}</span> : null}
      </span>
      <span className="ep-line-title">{placed.item.title}</span>
      {name ? <span className="ep-line-performer" data-testid="event-program-performer">{name}</span> : null}
      {now ? <span className="ep-now" data-testid="event-program-now" aria-label={t("nowLabel")}>{t("now")}</span> : null}
    </li>
  );
}

/** lineup: 4:5 cover with a bottom scrim and the name over it; initials panel without an image. */
export function LineupTile(props: RowProps) {
  const { placed, now, images, kind, t } = props;
  const { item } = placed;
  const cover = images && item.coverUrl ? item.coverUrl : null;
  const name = lineupName(item, t("performerTba"));
  const href = item.performer?.profileHref ?? null;
  const kindLabel = kind ? t(`kind_${item.kind}`) : null;
  const inner = (
    <>
      {cover ? <img className="ep-tile-cover" src={cover} alt="" loading="lazy" data-testid="event-program-cover" /> : (
        <span className="ep-tile-panel" aria-hidden="true" data-testid="event-program-tile-panel">{initials(name)}</span>
      )}
      <span className="ep-tile-scrim" aria-hidden="true" />
      <span className="ep-tile-text">
        <span className="ep-tile-meta">
          {placed.timeLabel ? <span>{placed.timeLabel}{placed.dayOffset > 0 ? <span className="ep-plus" data-testid="event-program-plus-day">+{placed.dayOffset}</span> : null}</span> : <span>{t("tba")}</span>}
          {kindLabel ? <span className="ep-kind" data-testid="event-program-kind">{kindLabel}</span> : null}
          {now ? <span className="ep-now" data-testid="event-program-now" aria-label={t("nowLabel")}>{t("now")}</span> : null}
        </span>
        <span className="ep-tile-name" data-testid="event-program-performer">{name}</span>
      </span>
    </>
  );
  return (
    <li className="ep-tile" {...itemAttrs(placed, now, !!cover)}>
      {href ? <a className="ep-tile-link" href={href} aria-label={name}>{inner}</a> : <span className="ep-tile-link">{inner}</span>}
    </li>
  );
}

/** schedule: the grid (from 640px) and the compact-by-space list (phones) for one night. */
export function ScheduleNight({ group, program, nowKey, loc, t, kind }: {
  group: { key: string; items: PlacedItem[] };
  program: Pick<ReadyProgram, "spaces" | "zone">;
  nowKey: string | null;
  loc: "en" | "es";
  t: (k: string) => string;
  kind: boolean;
}) {
  const grid: ScheduleGrid = buildScheduleGrid(group.items, program.spaces, program.zone, loc);
  const isNow = (p: PlacedItem) => nowKey === `${group.key}:${p.item.id}`;
  const byColumn = grid.columns.map((c, i) => ({ column: c, blocks: grid.blocks.filter((b) => b.column === i) }));
  const multiColumn = grid.columns.length > 1;
  return (
    <div className="ep-schedule" data-testid="event-program-schedule" data-columns={grid.columns.length}>
      {grid.slotLabels.length > 0 ? (
        <div className="ep-grid" style={{ gridTemplateColumns: `64px repeat(${grid.columns.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${grid.slotLabels.length}, minmax(2.75rem, auto))` }}>
          <span className="ep-grid-corner" aria-hidden="true" />
          {grid.columns.map((c) => <span key={c.key} className="ep-grid-head">{c.label}</span>)}
          {grid.slotLabels.map((label, r) => (
            <span key={`s${r}`} className="ep-grid-slot" style={{ gridRow: r + 2, gridColumn: 1 }}>{label}</span>
          ))}
          {grid.blocks.map((b) => (
            <div key={b.placed.item.id} className="ep-block" style={{ gridColumn: b.column + 2, gridRow: `${b.rowStart + 1} / span ${b.rowSpan}` }} {...itemAttrs(b.placed, isNow(b.placed), false)}>
              <span className="ep-block-time">{b.placed.timeLabel}{b.placed.endTimeLabel ? ` - ${b.placed.endTimeLabel}` : ""}</span>
              <span className="ep-block-title">{b.placed.item.title}</span>
              {performerLabel(b.placed, t) ? <span className="ep-block-performer" data-testid="event-program-performer">{performerLabel(b.placed, t)}</span> : null}
              {isNow(b.placed) ? <span className="ep-now" data-testid="event-program-now" aria-label={t("nowLabel")}>{t("now")}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {grid.unplaced.length > 0 ? (
        <ol className="ep-list ep-schedule-unplaced">
          {grid.unplaced.map((p) => <CompactRow key={p.item.id} placed={p} now={false} images={false} descriptions={false} kind={kind} place={null} t={t} />)}
        </ol>
      ) : null}
      <div className="ep-schedule-phone" data-testid="event-program-schedule-phone">
        {multiColumn ? (
          <nav className="ep-nav ep-space-chips" aria-label={t("places")}>
            {byColumn.filter((c) => c.blocks.length > 0).map((c) => (
              <a key={c.column.key} className="ep-chip" href={`#ep-${group.key}-${c.column.key}`}>{c.column.label}</a>
            ))}
          </nav>
        ) : null}
        {byColumn.filter((c) => c.blocks.length > 0).map((c) => (
          <section key={c.column.key} id={`ep-${group.key}-${c.column.key}`} className="ep-space">
            {multiColumn ? <h4 className="ep-group-title">{c.column.label}</h4> : null}
            <ol className="ep-list">
              {c.blocks.map((b) => <CompactRow key={b.placed.item.id} placed={b.placed} now={isNow(b.placed)} images={false} descriptions={false} kind={kind} place={null} t={t} />)}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
