"use client";

/**
 * EventCreate — the CreateEvent board's Essentials step. The name, the sales
 * model and the doors offset are what `createEvent` writes. A Pass also
 * writes `eventSeriesUpsert` (E14). Every other field on the board
 * (organizer, format, category, summary, venue, images, language,
 * visibility, slug, age, contact, terms, owner) has no column on `events`
 * or no writer and is drawn disabled with its sentence (D-POS-56). Steps 3
 * to 5 are not built: a night is scheduled from the Sessions page once the
 * draft exists, tickets are added on the event's Tickets tab.
 */

import { useState, useTransition } from "react";

import { createEvent } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { useT } from "@/i18n/use-t";
import { eventSeriesUpsert } from "@/lib/server-actions/venue-engine";

import { ActionButton, Outcome, SectionLabel } from "../appointments-classes-ui";
import { CARD, Field, INPUT, PageHeading } from "../catalog/catalog-ui";
import { Icon } from "../../primitives";
import type { EventsNav } from "./EventsPage";

type SalesModel = "ticket" | "rsvp" | "registration" | "pass";

export function EventCreate({ nav, onCreated }: { nav: EventsNav; onCreated: () => void }) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [model, setModel] = useState<SalesModel>("ticket");
  const [doors, setDoors] = useState("0");
  const [seriesName, setSeriesName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const noColumn = t("dashboard.events.create.noColumnReason");

  const steps: Array<{ n: number; label: string; state: "done" | "active" | "off"; reason?: string }> = [
    { n: 1, label: t("dashboard.events.create.stepTemplate"), state: "done" },
    { n: 2, label: t("dashboard.events.create.stepEssentials"), state: "active" },
    { n: 3, label: t("dashboard.events.create.stepDates"), state: "off", reason: t("dashboard.events.create.stepDatesReason") },
    { n: 4, label: t("dashboard.events.create.stepAccess"), state: "off", reason: t("dashboard.events.create.stepAccessReason") },
    { n: 5, label: t("dashboard.events.create.stepPublish"), state: "off", reason: t("dashboard.events.create.stepPublishReason") },
  ];

  const save = () => {
    setError(null);
    start(async () => {
      const res = await createEvent({ title, admissionKind: model, doorsOffsetMinutes: Math.max(0, Math.round(Number(doors) || 0)) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (model === "pass" && seriesName.trim()) {
        await eventSeriesUpsert({ name: seriesName.trim() });
      }
      onCreated();
      nav.go({ event: res.eventId, tab: "tickets" });
    });
  };

  const readiness = [
    { ok: title.trim().length > 0, label: t("dashboard.events.create.readyName") },
    { ok: false, label: t("dashboard.events.create.readyVenue") },
    { ok: false, label: t("dashboard.events.create.readyTickets") },
    { ok: false, label: t("dashboard.events.create.readyImage") },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-[24px]" data-testid="events-create-form">
      <form
        className="flex flex-col gap-[16px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) save();
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-[12px]">
          <PageHeading title={t("dashboard.events.create.title")} intro={t("dashboard.events.create.intro")} />
          <ol className="m-0 flex list-none flex-wrap items-center gap-[14px] p-0 font-admin-body text-[12.5px]">
            {steps.map((s) => (
              <li key={s.n} title={s.reason} className={`flex items-center gap-[6px] ${s.state === "active" ? "font-semibold text-admin-ink" : s.state === "done" ? "text-admin-brand" : "text-admin-ink-dim"}`}>
                <span
                  className={`inline-flex h-[20px] w-[20px] items-center justify-center rounded-full text-[11px] font-bold ${
                    s.state === "active" ? "bg-admin-brand text-white" : s.state === "done" ? "bg-admin-brand-soft text-admin-brand" : "bg-admin-surface-alt text-admin-ink-dim"
                  }`}
                >
                  {s.state === "done" ? <Icon name="check" size={11} stroke={2.5} /> : s.n}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-[16px]">
          <Field label={t("dashboard.events.create.name")} required hint={t("dashboard.events.create.nameHint")}>
            <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} maxLength={200} className={INPUT} placeholder={t("dashboard.events.create.namePlaceholder")} aria-label={t("dashboard.events.create.name")} autoFocus />
          </Field>
          <Field label={t("dashboard.events.create.salesModel")} required hint={t("dashboard.events.create.salesModelHint")}>
            <select value={model} onChange={(e) => setModel(e.target.value === "rsvp" ? "rsvp" : e.target.value === "registration" ? "registration" : e.target.value === "pass" ? "pass" : "ticket")} disabled={busy} className={INPUT} aria-label={t("dashboard.events.create.salesModel")}>
              <option value="ticket">{t("dashboard.events.create.modelTicket")}</option>
              <option value="rsvp">{t("dashboard.events.create.modelRsvp")}</option>
              <option value="registration">{t("dashboard.events.create.modelRegistration")}</option>
              <option value="pass">{t("dashboard.events.create.modelPass")}</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-[16px]">
          <Field label={t("dashboard.events.create.organizer")} required reason={t("dashboard.events.create.organizerReason")}>
            <input disabled className={INPUT} value="" readOnly />
          </Field>
          <Field label={t("dashboard.events.create.format")} reason={noColumn}>
            <select disabled className={INPUT}>
              <option>{t("dashboard.events.create.formatInPerson")}</option>
            </select>
          </Field>
          <Field label={t("dashboard.events.create.doors")} hint={t("dashboard.events.create.doorsHint")}>
            <input id="ev-doors" inputMode="numeric" value={doors} onChange={(e) => setDoors(e.target.value)} disabled={busy} className={INPUT} aria-label={t("dashboard.events.create.doors")} />
          </Field>
        </div>
        <Field
          label={t("dashboard.events.create.series")}
          hint={t("dashboard.events.create.seriesHint")}
          reason={model === "pass" ? undefined : t("dashboard.events.create.seriesReason")}
        >
          <input
            value={seriesName}
            onChange={(e) => setSeriesName(e.target.value)}
            disabled={busy || model !== "pass"}
            className={INPUT}
            placeholder={t("dashboard.events.create.seriesPlaceholder")}
            aria-label={t("dashboard.events.create.series")}
            data-testid="events-series-name"
          />
        </Field>
        <Field label={t("dashboard.events.create.summary")} reason={noColumn}>
          <input disabled className={INPUT} value="" readOnly />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[16px]">
          <Field label={t("dashboard.events.create.venue")} required reason={t("dashboard.events.create.venueReason")}>
            <div className={`${CARD} flex items-center gap-[10px] px-[12px] py-[10px] opacity-60`}>
              <Icon name="map-pin" size={14} stroke={1.75} />
              <span className="font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.create.venueNone")}</span>
            </div>
          </Field>
          <Field label={t("dashboard.events.create.images")} reason={t("dashboard.events.create.imagesReason")}>
            <div className="flex gap-[8px]">
              <span className="h-[60px] w-[96px] rounded-[10px] bg-admin-surface-alt" />
              <span className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-[10px] border border-dashed border-admin-border text-admin-ink-dim">
                <Icon name="plus" size={14} stroke={1.75} />
              </span>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-[16px]">
          <Field label={t("dashboard.events.create.language")} reason={noColumn}>
            <input disabled className={INPUT} value="" readOnly />
          </Field>
          <Field label={t("dashboard.events.create.visibility")} reason={t("dashboard.events.create.visibilityReason")}>
            <select disabled className={INPUT}>
              <option>{t("dashboard.events.create.visibilityPublic")}</option>
            </select>
          </Field>
          <Field label={t("dashboard.events.create.publicUrl")} reason={t("dashboard.events.create.publicUrlReason")}>
            <input disabled className={INPUT} value="" readOnly />
          </Field>
          <Field label={t("dashboard.events.create.age")} reason={noColumn}>
            <input disabled className={INPUT} value="" readOnly />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-[16px]">
          <Field label={t("dashboard.events.create.contact")} reason={noColumn}>
            <input disabled className={INPUT} value="" readOnly />
          </Field>
          <Field label={t("dashboard.events.create.terms")} reason={noColumn}>
            <input disabled className={INPUT} value="" readOnly />
          </Field>
          <Field label={t("dashboard.events.create.owner")} reason={noColumn}>
            <input disabled className={INPUT} value="" readOnly />
          </Field>
        </div>
        {error ? <Outcome kind="refused" testId="events-create-refused">{error}</Outcome> : null}
      </form>
      <aside className="flex flex-col gap-[14px] border-l border-admin-border pl-[20px]">
        <SectionLabel>{t("dashboard.events.create.datesPreview")}</SectionLabel>
        <div className={`${CARD} px-[14px] py-[12px] font-admin-body text-[12.5px] text-admin-ink-muted`}>{t("dashboard.events.create.datesPreviewEmpty")}</div>
        <SectionLabel>{t("dashboard.events.create.readiness")}</SectionLabel>
        <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
          {readiness.map((r) => (
            <li key={r.label} className={`flex items-center gap-[8px] font-admin-body text-[12.5px] ${r.ok ? "text-admin-brand" : "text-admin-coral-deep"}`}>
              <Icon name={r.ok ? "check" : "alert"} size={13} stroke={1.75} />
              {r.label}
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <ActionButton onClick={save} disabled={busy || title.trim().length === 0} testId="events-save-draft" className="w-full">
          {busy ? t("dashboard.events.create.saving") : t("dashboard.events.create.saveDraft")}
        </ActionButton>
        <ActionButton tone="primary" reason={t("dashboard.events.create.stepDatesReason")} className="w-full">
          {t("dashboard.events.create.continueDates")}
        </ActionButton>
        <button type="button" onClick={() => nav.go({})} className="font-admin-body text-[12px] text-admin-ink-muted hover:text-admin-ink">
          {t("dashboard.events.create.back")}
        </button>
      </aside>
    </div>
  );
}
