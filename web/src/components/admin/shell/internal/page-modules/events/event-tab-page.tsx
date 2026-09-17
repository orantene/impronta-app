"use client";

/**
 * event-tab-page — the "Page & Promotion" tab inside EventDetail.
 *
 * ONE DECISION: which website-builder page is this event's public page.
 * Linked, `/events/<slug>` (English) and `/es/eventos/<slug>` (Spanish)
 * render that page and the page's own URL redirects there; cleared, the
 * engine's own event page renders. The two canonical URLs are shown
 * read-only so the operator copies the right link and never the builder
 * page's old one. Every write is `setEventPage` (tenant-scoped,
 * capability-guarded). Promotion has no table yet and says nothing.
 */

import { useEffect, useState, useTransition } from "react";

import { loadEventPageLink, setEventPage, type EventPageLinkView } from "@/app/(workspace)/[tenantSlug]/admin/_events-page-actions";
import type { EventListRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { useT } from "@/i18n/use-t";

import { ActionButton, Outcome } from "../appointments-classes-ui";
import { useAdminShell } from "../../state";
import { CARD, Field, SELECT, SectionHead, SelectShell } from "../catalog/catalog-ui";

/** `""` in the select means the engine page (the column is null). */
const ENGINE = "";

export function EventPageTab({ event, onChanged }: { event: EventListRow; onChanged: () => void }) {
  const t = useT();
  const { effectiveTenant } = useAdminShell();
  const [view, setView] = useState<EventPageLinkView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string>(ENGINE);
  const [outcome, setOutcome] = useState<{ kind: "done" | "refused"; text: string } | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void loadEventPageLink({ eventId: event.id }).then((r) => {
      if (!alive) return;
      if (!r.ok) { setLoadError(r.error); return; }
      setView(r.view);
      setPageId(r.view.pageId ?? ENGINE);
    });
    return () => { alive = false; };
  }, [event.id]);

  const save = () => {
    setOutcome(null);
    start(async () => {
      const r = await setEventPage({ eventId: event.id, pageId: pageId === ENGINE ? null : pageId });
      if (!r.ok) { setOutcome({ kind: "refused", text: r.error }); return; }
      setOutcome({ kind: "done", text: t("dashboard.events.page.saved") });
      setView((v) => (v ? { ...v, pageId: pageId === ENGINE ? null : pageId } : v));
      onChanged();
    });
  };

  const dirty = view !== null && (view.pageId ?? ENGINE) !== pageId;
  const host = effectiveTenant.domain.replace(/\/$/, "");
  const urlFor = (path: string) => `https://${host}${path}`;

  return (
    <div className="flex max-w-[640px] flex-col gap-[14px]" data-testid="events-panel-page">
      {loadError ? <Outcome kind="refused">{loadError}</Outcome> : null}

      <div className={`${CARD} flex flex-col gap-[14px] p-[16px]`}>
        <SectionHead title={t("dashboard.events.page.title")} intro={t("dashboard.events.page.intro")} />
        <Field label={t("dashboard.events.page.pick")} hint={view && view.pages.length === 0 ? t("dashboard.events.page.none") : t("dashboard.events.page.pickHint")}>
          <SelectShell>
            <select
              className={SELECT}
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              disabled={view === null}
              aria-label={t("dashboard.events.page.pick")}
              data-testid="events-page-select"
            >
              <option value={ENGINE}>{t("dashboard.events.page.engine")}</option>
              {(view?.pages ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · /{p.slug}
                </option>
              ))}
            </select>
          </SelectShell>
        </Field>
        <div className="flex flex-wrap items-center gap-[8px]">
          <ActionButton tone="primary" onClick={save} disabled={busy || !dirty} testId="events-page-save">
            {busy ? t("dashboard.events.page.saving") : t("dashboard.events.page.save")}
          </ActionButton>
          {outcome ? <Outcome kind={outcome.kind} testId="events-page-outcome">{outcome.text}</Outcome> : null}
        </div>
      </div>

      <div className={`${CARD} flex flex-col gap-[8px] p-[16px]`} data-testid="events-page-canonical">
        <SectionHead title={t("dashboard.events.page.canonical")} intro={t("dashboard.events.page.canonicalHint")} />
        {view ? (
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[12px] gap-y-[6px] font-admin-body text-admin-13">
            <dt className="text-admin-ink-muted">{t("dashboard.events.page.canonicalEn")}</dt>
            <dd className="m-0 min-w-0 break-all text-admin-ink" data-testid="events-page-canonical-en">{urlFor(view.canonical.en)}</dd>
            <dt className="text-admin-ink-muted">{t("dashboard.events.page.canonicalEs")}</dt>
            <dd className="m-0 min-w-0 break-all text-admin-ink" data-testid="events-page-canonical-es">{urlFor(view.canonical.es)}</dd>
          </dl>
        ) : (
          <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.loading")}</p>
        )}
      </div>
    </div>
  );
}
