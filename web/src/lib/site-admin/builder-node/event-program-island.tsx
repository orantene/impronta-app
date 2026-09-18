"use client";

/**
 * event_program — the event's timed program on a public page (proposal §7,
 * §9). Self-fetch class like `ticket_picker`: the event id comes from props
 * (authored, or the page's linked event injected by the renderer), the data
 * from the dynamically imported `loadEventProgram` action, which resolves the
 * tenant from the host and answers `enabled: false` for anything it will not
 * show. Dynamic import keeps `server-only` out of the fidelity/perf runs that
 * import this island through `render.tsx`.
 *
 * States, each on the root as `data-event-program` and a testid:
 *   not_configured  no usable event id. A placeholder in the editor, nothing
 *                   on the public page (a guest is never told to configure).
 *   loading         the action is in flight.
 *   disabled        `program.enabled` is false (or the action refused).
 *                   Same rule: placeholder in the editor, nothing public.
 *   unavailable     the import / action threw (network). Public gets one
 *                   quiet line rather than a blank band it cannot explain.
 *   empty           enabled, no published item (after filterKinds).
 *   ready           the program.
 *
 * "Now" is computed AFTER MOUNT from the client clock against instants; the
 * server render never carries it, so hydration cannot disagree.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { PublicEventProgram } from "@/app/(public)/_events/event-program-actions";
import { PROGRAM_COPY, pickProgramLocale } from "./event-program-copy";
import { EP_CSS } from "./event-program-css";
import { CardItem, CompactRow, LineupTile, ScheduleNight, TimelineRow, placeName, type RowProps } from "./event-program-layouts";
import { lineupItems } from "./event-program-lineup-tiles";
import {
  DEFAULT_LAYOUT,
  buildGroups,
  nowMarkerIndex,
  programHeading,
  resolveGroupMode,
  selectItems,
  type PlacedItem,
  type ProgramGroup,
  type ReadyProgram,
} from "./event-program-model";
import type { EventProgramGroupBy, EventProgramLayout } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOW_TICK_MS = 60_000;

export interface EventProgramIslandProps {
  /** Authored `eventId`, or the page's linked event. Empty ⇒ not configured. */
  eventId: string;
  /** True on the editor canvas: the not_configured / disabled states show a placeholder instead of nothing. */
  editor?: boolean;
  heading?: string;
  /** Small uppercase line above the heading (localizable). */
  eyebrow?: string;
  locale?: string;
  layout?: EventProgramLayout;
  groupBy?: EventProgramGroupBy;
  showTimes?: boolean;
  showImages?: boolean;
  showDescriptions?: boolean;
  /** A tiny uppercase kind word in the meta line. Default off: a kind is never a symbol. */
  showKind?: boolean;
  filterKinds?: ReadonlyArray<string>;
  limit?: number;
  /** TEST-ONLY: seed the answer; no action is called. */
  preload?: PublicEventProgram | null;
  /** TEST-ONLY: the clock for the "now" marker. */
  nowMs?: number;
}

type State = "not_configured" | "loading" | "disabled" | "unavailable" | "empty" | "ready";

export function EventProgramIsland(props: EventProgramIslandProps) {
  const { eventId, editor, heading, eyebrow, locale, showKind, layout, groupBy, showTimes, showImages, showDescriptions, filterKinds, limit, preload, nowMs: nowOverride } = props;
  const loc = pickProgramLocale(locale);
  const t = (key: string) => PROGRAM_COPY[loc][key] ?? PROGRAM_COPY.en[key] ?? key;
  const configured = UUID.test(eventId);

  const [data, setData] = useState<PublicEventProgram | null>(preload ?? null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState<number | null>(nowOverride ?? null);
  const [active, setActive] = useState<string | null>(null);
  const groupRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!configured || preload) return;
    let alive = true;
    (async () => {
      try {
        const { loadEventProgram } = await import("@/app/(public)/_events/event-program-actions");
        const res = await loadEventProgram({ eventId, locale: loc });
        if (alive) { setData(res); setFailed(false); }
      } catch {
        if (alive) { setData(null); setFailed(true); }
      }
    })();
    return () => { alive = false; };
  }, [configured, preload, eventId, loc]);

  // The client clock, after mount only, refreshed each minute while mounted.
  useEffect(() => {
    if (nowOverride !== undefined) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, [nowOverride]);

  const ready: ReadyProgram | null = data && data.enabled ? data : null;
  const times = showTimes !== false;
  const lay: EventProgramLayout = layout ?? DEFAULT_LAYOUT;
  // The lineup shows who is playing: only items with a performer or a cover
  // make a tile, and a program with none of those is EMPTY for this layout.
  const items = useMemo(() => {
    if (!ready) return [];
    const picked = selectItems(ready.items, { filterKinds, limit });
    return lay === "lineup" ? lineupItems(picked) : picked;
  }, [ready, filterKinds, limit, lay]);
  // The schedule grid already lays spaces out as columns, so grouping it by
  // place would split one night into single-column grids: night or nothing.
  const mode = useMemo(() => {
    if (!ready) return "none";
    const resolved = resolveGroupMode(groupBy, ready, items);
    return lay === "schedule" && resolved === "place" ? "none" : resolved;
  }, [ready, groupBy, items, lay]);
  const groups = useMemo(() => (ready ? buildGroups(ready, items, mode, loc, times) : []), [ready, items, mode, loc, times]);
  const nowKey = useMemo(() => {
    if (now === null) return null;
    for (const g of groups) {
      const idx = nowMarkerIndex(g.items, now);
      if (idx >= 0) return `${g.key}:${g.items[idx]!.item.id}`;
    }
    return null;
  }, [groups, now]);

  const state: State = !configured ? "not_configured" : failed ? "unavailable" : data === null ? "loading" : !ready ? "disabled" : items.length === 0 ? "empty" : "ready";
  const chrome = (children: ReactNode, hidden = false) => (
    <div data-event-program={state} data-testid={`event-program-${state}`} data-layout={lay} hidden={hidden || undefined}>
      {hidden ? null : <style>{EP_CSS}</style>}
      {children}
    </div>
  );

  if (state === "not_configured" || state === "disabled") {
    // Nothing on the public page: a guest is never shown a setup sentence.
    if (!editor) return chrome(null, true);
    return chrome(<p className="ep-status">{t(state)}</p>);
  }
  if (state === "loading") return chrome(<p className="ep-status" aria-busy="true">{t("loading")}</p>);
  if (state === "unavailable") return chrome(<p className="ep-status">{t("unavailable")}</p>);
  if (state === "empty") return chrome(<p className="ep-status">{t("empty")}</p>);

  const title = programHeading(heading, ready as ReadyProgram);
  const multi = groups.length > 1;
  const jump = (key: string) => {
    setActive(key);
    groupRefs.current.get(key)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };


  // Night chips for every layout but compact (which uses small headers) and
  // only with more than one group. Schedule adds its own space chips on phones.
  const chips = multi && lay !== "compact";
  const rowProps = (g: ProgramGroup, p: PlacedItem): RowProps => ({
    placed: p,
    now: nowKey === `${g.key}:${p.item.id}`,
    images: showImages !== false,
    descriptions: showDescriptions !== false,
    kind: showKind === true,
    place: placeName(ready as ReadyProgram, p.item.spaceId),
    t,
  });
  const groupBody = (g: ProgramGroup) => {
    if (lay === "schedule") return <ScheduleNight group={g} program={ready as ReadyProgram} nowKey={nowKey} loc={loc} t={t} kind={showKind === true} />;
    if (lay === "lineup") return <ul className="ep-tiles">{g.items.map((p) => <LineupTile key={p.item.id} {...rowProps(g, p)} />)}</ul>;
    if (lay === "cards") return <ul className="ep-cards">{g.items.map((p) => <CardItem key={p.item.id} {...rowProps(g, p)} />)}</ul>;
    if (lay === "compact") return <ol className="ep-list">{g.items.map((p) => <CompactRow key={p.item.id} {...rowProps(g, p)} />)}</ol>;
    return <ol className="ep-list">{g.items.map((p) => <TimelineRow key={p.item.id} {...rowProps(g, p)} />)}</ol>;
  };

  return chrome(
    <>
      {title || eyebrow ? (
        <header className="ep-head">
          {eyebrow ? <p className="ep-eyebrow" data-testid="event-program-eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="ep-heading">{title}</h2> : null}
        </header>
      ) : null}
      <div className="ep-shell" data-rail={chips && lay === "timeline" ? "1" : undefined}>
        {chips ? (
          <nav className="ep-nav" aria-label={t(mode === "place" ? "places" : "nights")} data-testid="event-program-nav">
            {groups.map((g) => (
              <button key={g.key} type="button" className="ep-chip" data-on={(active ?? groups[0]!.key) === g.key ? "1" : undefined} onClick={() => jump(g.key)}>
                {g.label}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="ep-groups">
          {groups.map((g) => (
            <section
              key={g.key}
              className="ep-group"
              data-testid="event-program-group"
              data-group-key={g.key}
              ref={(el) => { if (el) groupRefs.current.set(g.key, el); else groupRefs.current.delete(g.key); }}
            >
              {multi && g.label ? <h3 className="ep-group-title">{g.label}</h3> : null}
              {groupBody(g)}
            </section>
          ))}
        </div>
      </div>
    </>,
  );
}
