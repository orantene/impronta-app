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
  locale?: string;
  layout?: EventProgramLayout;
  groupBy?: EventProgramGroupBy;
  showTimes?: boolean;
  showImages?: boolean;
  showDescriptions?: boolean;
  filterKinds?: ReadonlyArray<string>;
  limit?: number;
  /** TEST-ONLY: seed the answer; no action is called. */
  preload?: PublicEventProgram | null;
  /** TEST-ONLY: the clock for the "now" marker. */
  nowMs?: number;
}

type State = "not_configured" | "loading" | "disabled" | "unavailable" | "empty" | "ready";

export function EventProgramIsland(props: EventProgramIslandProps) {
  const { eventId, editor, heading, locale, layout, groupBy, showTimes, showImages, showDescriptions, filterKinds, limit, preload, nowMs: nowOverride } = props;
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
  const items = useMemo(() => (ready ? selectItems(ready.items, { filterKinds, limit }) : []), [ready, filterKinds, limit]);
  const mode = useMemo(() => (ready ? resolveGroupMode(groupBy, ready, items) : "none"), [ready, groupBy, items]);
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
    <div data-event-program={state} data-testid={`event-program-${state}`} data-ep-layout={layout ?? DEFAULT_LAYOUT} hidden={hidden || undefined}>
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

  return chrome(
    <>
      {title ? <h2 className="ep-heading">{title}</h2> : null}
      <div className="ep-shell" data-rail={multi ? "1" : undefined}>
        {multi ? (
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
              <ol className="ep-list">
                {g.items.map((p) => (
                  <ProgramRow key={p.item.id} placed={p} now={nowKey === `${g.key}:${p.item.id}`} images={showImages !== false} descriptions={showDescriptions !== false} t={t} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </>,
  );
}

function ProgramRow({ placed, now, images, descriptions, t }: { placed: PlacedItem; now: boolean; images: boolean; descriptions: boolean; t: (k: string) => string }) {
  const { item, timeLabel, endTimeLabel, dayOffset } = placed;
  const cover = images && item.coverUrl ? item.coverUrl : null;
  const performer = item.performer;
  const performerName = performer ? (performer.tba && !performer.name ? t("performerTba") : performer.name) : null;
  const kindLabel = item.kind === "doors" || item.kind === "close" || item.kind === "break" ? t(`kind_${item.kind}`) : null;
  return (
    <li className="ep-item" data-testid="event-program-item" data-kind={item.kind} data-now={now ? "1" : undefined} data-image={cover ? "1" : undefined} data-tba={item.timeTba ? "1" : undefined}>
      <div className="ep-time">
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
      {cover ? <img className="ep-cover" src={cover} alt="" loading="lazy" data-testid="event-program-cover" /> : null}
      <div className="ep-body">
        <p className="ep-title">{item.title}</p>
        {performerName ? (
          <p className="ep-performer" data-testid="event-program-performer">
            {performer?.profileHref ? <a href={performer.profileHref}>{performerName}</a> : performerName}
          </p>
        ) : null}
        {item.subtitle || kindLabel ? <p className="ep-meta">{item.subtitle ?? kindLabel}</p> : null}
        {descriptions && item.description ? <p className="ep-desc">{item.description}</p> : null}
        {now ? <span className="ep-now" data-testid="event-program-now" aria-label={t("nowLabel")}>{t("now")}</span> : null}
      </div>
    </li>
  );
}
