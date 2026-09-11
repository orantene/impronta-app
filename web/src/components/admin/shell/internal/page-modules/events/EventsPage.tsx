"use client";

/**
 * EventsPage — the destination the registry calls `events`, drawn as the
 * boards: W16 (the list), CreateEvent (the essentials), EventDetail (one
 * event, ten tabs), W17 (Venue & seating) and W18 (Event day).
 *
 * ONE ROUTE, SEVERAL STATES. `?segment=` picks the list's segment,
 * `?event=<id>` opens an event, `?tab=` its tab, `?compose=new` the create
 * form (the rail's own "Add new event" query). Nothing here is a second
 * route; the door stays its own server page at `/admin/events/door`.
 *
 * EVERY ROW IS THE READER'S. `loadWorkspaceEvents` resolves the tenant from
 * the session and never from a parameter. A refusal is shown as a sentence,
 * never as an empty list. Token classes only; inline styles are frozen under
 * components/admin/shell.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { loadWorkspaceEvents, type EventListRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { useT } from "@/i18n/use-t";

import { useAdminShell } from "../../state";
import { Outcome } from "../appointments-classes-ui";
import { EventCreate } from "./EventCreate";
import { EventDetail } from "./EventDetail";
import { EventsList } from "./EventsList";
import { segmentFromQuery, tabFromQuery, type DetailTab, type EventSegment } from "./events-model";

export type EventsNav = {
  base: string;
  segment: EventSegment;
  eventId: string | null;
  tab: DetailTab;
  composing: boolean;
  go: (next: { segment?: EventSegment; event?: string | null; tab?: DetailTab; compose?: boolean }) => void;
  href: (next: { segment?: EventSegment; event?: string | null; tab?: DetailTab; compose?: boolean }) => string;
};

function buildHref(base: string, q: { segment?: EventSegment; event?: string | null; tab?: DetailTab; compose?: boolean }): string {
  const p = new URLSearchParams();
  if (q.event) {
    p.set("event", q.event);
    if (q.tab && q.tab !== "tickets") p.set("tab", q.tab);
  } else if (q.compose) {
    p.set("compose", "new");
  } else if (q.segment && q.segment !== "upcoming") {
    p.set("segment", q.segment);
  }
  const qs = p.toString();
  return `${base}/events${qs ? `?${qs}` : ""}`;
}

export function EventsPage() {
  const { adminBasePath } = useAdminShell();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useT();
  const locale = useDashboardLocale();

  const segment = segmentFromQuery(searchParams.get("segment"));
  const eventId = searchParams.get("event");
  const tab = tabFromQuery(searchParams.get("tab"));
  const composing = searchParams.get("compose") === "new";

  const href = useCallback((next: Parameters<EventsNav["href"]>[0]) => buildHref(adminBasePath, next), [adminBasePath]);
  const go = useCallback(
    (next: Parameters<EventsNav["go"]>[0]) => {
      router.replace(buildHref(adminBasePath, next), { scroll: false });
    },
    [router, adminBasePath],
  );
  const nav = useMemo<EventsNav>(() => ({ base: adminBasePath, segment, eventId, tab, composing, go, href }), [adminBasePath, segment, eventId, tab, composing, go, href]);

  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; events: EventListRow[]; nowIso: string }>({ kind: "loading" });

  const load = useCallback(() => {
    void loadWorkspaceEvents().then((res) => {
      if (res.ok) setState({ kind: "ready", events: res.events, nowIso: new Date().toISOString() });
      else setState({ kind: "error", message: res.error });
    });
  }, []);

  useEffect(load, [load]);

  if (state.kind === "loading") {
    return (
      <p role="status" className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">
        {t("dashboard.events.loading")}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <Outcome kind="refused" testId="events-load-refused">
        {t("dashboard.events.loadFailed")} {state.message}
      </Outcome>
    );
  }

  if (nav.composing) return <EventCreate nav={nav} onCreated={load} />;
  if (nav.eventId) {
    const event = state.events.find((e) => e.id === nav.eventId) ?? null;
    if (event) return <EventDetail event={event} nav={nav} locale={locale} onChanged={load} />;
    return (
      <Outcome kind="refused" testId="events-not-found">
        {t("dashboard.events.notFound")}
      </Outcome>
    );
  }
  return <EventsList events={state.events} nav={nav} nowIso={state.nowIso} locale={locale} />;
}
