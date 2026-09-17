"use client";

// The `event_program` block's inspector body (everything but the Copy
// section, which the parent keeps): the event to read, the presentation and
// what each row shows. Own component because it owns a hook (the event list
// load) and the inspector's per-kind branch is an early return.
//
// THE EVENT SELECT SHOWS ONLY ON AN UNLINKED PAGE. A page an event claims
// through `events.page_id` binds itself at render time (`linkedEventId`), so
// asking the operator to pick the event again would be a trap: the answer
// could disagree with the link. The panel resolves the link from the page id
// the editor is working on; while that read is in flight the select stays
// hidden (a flash of "choose an event" on a linked page is the trap again).
//
// Same two contracts as the ticket picker: a FAILED read is surfaced with a
// manual fallback (paste the id), never an empty list read as "no events";
// the tenant is resolved inside the action, never sent.

import { useEffect, useState } from "react";

import type { EventProgramGroupBy, EventProgramLayout } from "@/lib/site-admin/builder-node/types";
import { PERFORMER_KINDS } from "@/lib/events/schedule/model";
import {
  listEventsForInspectorAction,
  resolveLinkedEventForPageInspectorAction,
  type InspectorEvent,
  type InspectorLinkedEvent,
} from "@/lib/site-admin/events/inspector-actions";

import { SelectField } from "./kit";
import { KIT } from "./kit/tokens";
import { useInspectorT } from "./kit/use-inspector-t";

type Props = {
  eventId: string;
  /** The cms_pages id being edited; null until the composition loaded. */
  pageId: string | null;
  layout: EventProgramLayout | undefined;
  groupBy: EventProgramGroupBy | undefined;
  showTimes: boolean | undefined;
  showImages: boolean | undefined;
  showDescriptions: boolean | undefined;
  filterKinds: ReadonlyArray<string> | undefined;
  limit: number | undefined;
  patch: (patch: Record<string, unknown>) => Promise<void> | void;
};

type Load = { status: "loading" } | { status: "ready"; items: InspectorEvent[] } | { status: "error" };

const PERFORMERS_ONLY = [...PERFORMER_KINDS];

function sameKinds(a: ReadonlyArray<string> | undefined, b: ReadonlyArray<string>): boolean {
  if (!a || a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((k) => s.has(k));
}

export function EventProgramEditor({ eventId, pageId, layout, groupBy, showTimes, showImages, showDescriptions, filterKinds, limit, patch }: Props) {
  const { t } = useInspectorT();
  const [events, setEvents] = useState<Load>({ status: "loading" });
  // `undefined` = not resolved yet; `null` = resolved, no event claims the page.
  const [linked, setLinked] = useState<InspectorLinkedEvent | null | undefined>(pageId ? undefined : null);

  useEffect(() => {
    if (!pageId) { setLinked(null); return; }
    let alive = true;
    setLinked(undefined);
    void resolveLinkedEventForPageInspectorAction({ pageId }).then((r) => {
      if (alive) setLinked(r.ok ? r.event : null);
    });
    return () => { alive = false; };
  }, [pageId]);

  const unlinked = linked === null;
  useEffect(() => {
    if (!unlinked) return;
    let alive = true;
    void listEventsForInspectorAction().then((r) => {
      if (!alive) return;
      setEvents(r.ok ? { status: "ready", items: r.events } : { status: "error" });
    });
    return () => { alive = false; };
  }, [unlinked]);

  const performersOnly = sameKinds(filterKinds, PERFORMERS_ONLY);
  const checkbox = (label: string, checked: boolean, onChange: (next: boolean) => void, testId: string) => (
    <label className={`${KIT.row} text-[12px]`} data-testid={testId}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      {t(label)}
    </label>
  );

  return (
    <>
      {unlinked ? (
        <div className={KIT.field} data-testid="event-program-event">
          <label className={KIT.label}>{t("Event")}</label>
          {events.status === "ready" && events.items.length > 0 ? (
            <select className={KIT.input} value={eventId} onChange={(e) => void patch({ eventId: e.currentTarget.value || undefined })}>
              <option value="">{t("Choose an event…")}</option>
              {events.items.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {(ev.title || ev.id) + (ev.status !== "published" ? ` (${ev.status})` : "")}
                </option>
              ))}
            </select>
          ) : events.status === "loading" ? (
            <select className={KIT.input} disabled defaultValue=""><option value="">{t("Loading your events…")}</option></select>
          ) : (
            <>
              {events.status === "error" ? (
                <p className={KIT.hint}>{t("Couldn't load your events. Paste the event id.")}</p>
              ) : (
                <p className={KIT.hint}>{t("No events yet. Create one under Events & Tickets, or paste an id.")}</p>
              )}
              <input type="text" className={KIT.input} value={eventId} placeholder={t("Event id")} onChange={(e) => void patch({ eventId: e.currentTarget.value || undefined })} />
            </>
          )}
        </div>
      ) : linked ? (
        <p className={KIT.hint} data-testid="event-program-linked">
          {t("This page belongs to an event, so the block shows that event's program:")} <b>{linked.title || linked.id}</b>
        </p>
      ) : null}

      <SelectField
        label="Style"
        value={layout ?? "timeline"}
        onChange={(next) => void patch({ layout: next })}
        options={[
          { value: "timeline", label: "Timeline" },
          { value: "cards", label: "Cards" },
          { value: "compact", label: "Compact list" },
        ]}
        dataControl="event-program-layout"
      />
      <SelectField
        label="Group by"
        value={groupBy ?? "auto"}
        onChange={(next) => void patch({ groupBy: next })}
        options={[
          { value: "auto", label: "Automatic (nights, then places)" },
          { value: "night", label: "Night" },
          { value: "place", label: "Place" },
          { value: "none", label: "No groups" },
        ]}
        dataControl="event-program-group-by"
      />

      <div className={KIT.field}>
        <label className={KIT.label}>{t("Each row shows")}</label>
        {checkbox("Times", showTimes !== false, (next) => void patch({ showTimes: next ? undefined : false }), "event-program-show-times")}
        {checkbox("Images", showImages !== false, (next) => void patch({ showImages: next ? undefined : false }), "event-program-show-images")}
        {checkbox("Descriptions", showDescriptions !== false, (next) => void patch({ showDescriptions: next ? undefined : false }), "event-program-show-descriptions")}
        {checkbox("Performers only (a lineup)", performersOnly, (next) => void patch({ filterKinds: next ? PERFORMERS_ONLY : undefined }), "event-program-performers-only")}
      </div>

      <div className={KIT.field}>
        <label className={KIT.label}>{t("Show at most")}</label>
        <input
          type="number"
          className={KIT.input}
          min={1}
          max={200}
          value={limit ?? ""}
          placeholder={t("All items")}
          onChange={(e) => {
            const n = Number.parseInt(e.currentTarget.value, 10);
            void patch({ limit: Number.isFinite(n) && n >= 1 ? Math.min(n, 200) : undefined });
          }}
          data-testid="event-program-limit"
        />
      </div>
    </>
  );
}
