"use client";

/**
 * event-tab-program — the Programa tab inside EventDetail (Wave 2, PR C;
 * proposal §4, §11 MVP).
 *
 * FIRST STATE IS ONE SWITCH. "This event has a program" writes
 * `events.program.enabled`; off, the tab is the switch and one sentence and
 * the public block does not render. On, the tab is the program's three
 * settings (public heading, set times public, group by) over the
 * run-of-show list (`event-tab-program-list`) and the add / edit sheet
 * (`event-tab-program-sheet`).
 *
 * EVERY WRITE IS A STAFF ACTION from `_events-schedule-actions.ts`
 * (tenant from the session, every id checked inside the tenant). Nothing
 * here touches Supabase, and the static test pins that. Rows come back
 * snake_case from the reader and go through the pure model's
 * `normalizeScheduleItemRow` so the groupers see one shape.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import type { EventListRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import {
  deleteScheduleItem,
  duplicateScheduleItem,
  importLineupAsScheduleItems,
  listEventSpaces,
  listScheduleItems,
  reorderScheduleItems,
  saveEventProgramSettings,
  saveScheduleItem,
  type ListEventSpacesResult,
} from "@/app/(workspace)/[tenantSlug]/admin/_events-schedule-actions";
import type { ScheduleSessionRef, ScheduleSpaceRef } from "@/lib/events/schedule/grouping";
import { DEFAULT_PROGRAM_SETTINGS, normalizeEventProgramSettings, normalizeScheduleItemRow, type EventProgramSettings, type ScheduleItem } from "@/lib/events/schedule/model";
import { draftFromItem, draftToInput, labelLocale, movedOrder, toSaveWire } from "@/lib/events/schedule/program-tab-model";
import { whenLabel } from "@/lib/events/public-event-time";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";

import { ActionButton, Outcome } from "../appointments-classes-ui";
import { useAdminShell } from "../../state";
import { CARD, Field, INPUT, Switch } from "../catalog/catalog-ui";
import { ProgramList } from "./event-tab-program-list";
import { ProgramItemSheet, type NightOption, type PlaceOption } from "./event-tab-program-sheet";

type Sheet = { mode: "add" } | { mode: "edit"; item: ScheduleItem } | null;
type GroupBy = "day" | "stage";

export function EventProgramTab({ event, locale }: { event: EventListRow; locale: string }) {
  const t = useT();
  const { bridgeTenantIdentity } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;
  const zone = event.timeZone || null;

  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [settings, setSettings] = useState<EventProgramSettings>({ ...DEFAULT_PROGRAM_SETTINGS });
  const [places, setPlaces] = useState<PlaceOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ kind: "done" | "refused"; text: string } | null>(null);
  const [heading, setHeading] = useState<string>(DEFAULT_PROGRAM_SETTINGS.heading);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const load = useCallback(() => {
    void listScheduleItems({ eventId: event.id }).then((r) => {
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      setLoadError(null);
      setItems(r.items.map(normalizeScheduleItemRow).filter((i): i is ScheduleItem => i !== null));
      const s = normalizeEventProgramSettings(r.settings);
      setSettings(s);
      setHeading(s.heading);
    });
  }, [event.id]);

  useEffect(load, [load]);
  useEffect(() => {
    let alive = true;
    void listEventSpaces({ eventId: event.id }).then((r: ListEventSpacesResult) => {
      if (!alive || !r.ok) return;
      setPlaces(r.spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })));
    });
    return () => {
      alive = false;
    };
  }, [event.id]);

  const sessions: ScheduleSessionRef[] = useMemo(() => event.sessions.map((s) => ({ id: s.id, startsAt: s.startsAt })), [event.sessions]);
  const nights: NightOption[] = useMemo(() => sessions.map((s) => ({ id: s.id, label: whenLabel(s.startsAt, zone, labelLocale(locale), false) })), [sessions, zone, locale]);
  const spaceRefs: ScheduleSpaceRef[] = useMemo(() => places.map((p, i) => ({ id: p.id, name: p.name, kind: p.kind, sortOrder: i })), [places]);
  const groupBy: GroupBy = settings.group_by === "stage" ? "stage" : "day";

  const saveSettings = (patch: { enabled?: boolean; heading?: string; setTimesPublic?: boolean; groupBy?: "day" | "stage" | "none" }, doneText?: string) => {
    setOutcome(null);
    start(async () => {
      const r = await saveEventProgramSettings({ eventId: event.id, settings: { ...patch, enabled: patch.enabled ?? settings.enabled } });
      if (!r.ok) {
        setOutcome({ kind: "refused", text: r.error });
        return;
      }
      const s = normalizeEventProgramSettings(r.settings);
      setSettings(s);
      setHeading(s.heading);
      if (doneText) setOutcome({ kind: "done", text: doneText });
    });
  };

  const commitHeading = () => {
    const next = heading.trim();
    if (!next) {
      setHeading(settings.heading);
      return;
    }
    if (next !== settings.heading) saveSettings({ heading: next }, t("dashboard.events.program.settings.saved"));
  };

  const rowWrite = (item: ScheduleItem, run: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setOutcome(null);
    setBusyId(item.id);
    start(async () => {
      const r = await run();
      setBusyId(null);
      if (!r.ok) {
        setOutcome({ kind: "refused", text: r.error });
        return;
      }
      load();
    });
  };

  const listActions = {
    onEdit: (item: ScheduleItem) => setSheet({ mode: "edit", item }),
    onDuplicate: (item: ScheduleItem) => rowWrite(item, () => duplicateScheduleItem({ id: item.id })),
    onToggleVisibility: (item: ScheduleItem) =>
      rowWrite(item, () => {
        // The whole row goes back through the pure schema; only `visibility` changes.
        const draft = draftFromItem(item, zone);
        const r = draftToInput({ ...draft, staffOnly: !draft.staffOnly }, zone, item.sortOrder);
        if (!r.ok) return Promise.resolve({ ok: false as const, error: t("dashboard.events.program.sheet.invalid") });
        return saveScheduleItem(toSaveWire(r.input, event.id, item.id));
      }),
    onDelete: (item: ScheduleItem) => {
      if (!window.confirm(interpolate(t("dashboard.events.program.row.deleteConfirm"), { title: item.title }))) return;
      rowWrite(item, () => deleteScheduleItem({ id: item.id }));
    },
    onMove: (item: ScheduleItem, withId: string) => rowWrite(item, () => reorderScheduleItems({ eventId: event.id, orderedIds: movedOrder(items ?? [], item.id, withId) })),
  };

  const importLineup = () => {
    setOutcome(null);
    start(async () => {
      const r = await importLineupAsScheduleItems({ eventId: event.id });
      if (!r.ok) {
        setOutcome({ kind: "refused", text: r.error });
        return;
      }
      setOutcome({ kind: "done", text: interpolate(t("dashboard.events.program.importDone"), { created: r.created, skipped: r.skipped }) });
      if (r.created > 0) load();
    });
  };

  const nextSortOrder = items ? items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1 : 0;

  return (
    <div className="flex max-w-[760px] flex-col gap-[14px]" data-testid="events-panel-program" data-enabled={settings.enabled ? "true" : "false"}>
      {loadError ? <Outcome kind="refused">{loadError}</Outcome> : null}

      {/* THE SWITCH. Off = this card alone. */}
      <div className={`${CARD} flex flex-col gap-[12px] p-[16px]`} data-testid="events-program-settings">
        <div className="flex items-center justify-between gap-[12px]">
          <div>
            <div className="font-admin-body text-[14px] font-semibold text-admin-ink">{t("dashboard.events.program.settings.enabled")}</div>
            <p className="m-0 mt-[2px] font-admin-body text-[12.5px] leading-[1.4] text-admin-ink-muted">{settings.enabled ? t("dashboard.events.program.settings.enabledOnHint") : t("dashboard.events.program.settings.enabledOffHint")}</p>
          </div>
          <Switch on={settings.enabled} onChange={(on) => saveSettings({ enabled: on })} label={t("dashboard.events.program.settings.enabled")} reason={items === null && !loadError ? t("dashboard.events.loading") : null} testId="events-program-enabled" />
        </div>
        {settings.enabled ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-[16px] border-t border-admin-border-soft pt-[12px] max-[720px]:grid-cols-1">
            <Field label={t("dashboard.events.program.settings.heading")} hint={t("dashboard.events.program.settings.headingHint")}>
              <input
                className={INPUT}
                value={heading}
                maxLength={80}
                disabled={busy}
                onChange={(e) => setHeading(e.target.value)}
                onBlur={commitHeading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                aria-label={t("dashboard.events.program.settings.heading")}
                data-testid="events-program-heading"
              />
            </Field>
            <Field label={t("dashboard.events.program.settings.setTimesPublic")} hint={t("dashboard.events.program.settings.setTimesPublicHint")}>
              <div className="flex h-[34px] items-center">
                <Switch on={settings.set_times_public} onChange={(on) => saveSettings({ setTimesPublic: on })} label={t("dashboard.events.program.settings.setTimesPublic")} testId="events-program-set-times-public" />
              </div>
            </Field>
            <Field label={t("dashboard.events.program.settings.groupBy")}>
              <div role="group" aria-label={t("dashboard.events.program.settings.groupBy")} className="inline-flex h-[34px] gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px]" data-testid="events-program-group-by">
                {(["day", "stage"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={groupBy === g}
                    disabled={busy}
                    onClick={() => groupBy !== g && saveSettings({ groupBy: g })}
                    data-testid={`events-program-group-by-${g}`}
                    className={`cursor-pointer rounded-[7px] border-0 px-[10px] font-admin-body text-[12px] font-semibold ${groupBy === g ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "bg-transparent text-admin-ink-muted"}`}
                  >
                    {g === "day" ? t("dashboard.events.program.settings.groupByNight") : t("dashboard.events.program.settings.groupByPlace")}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        ) : null}
        {outcome ? <Outcome kind={outcome.kind} testId="events-program-outcome">{outcome.text}</Outcome> : null}
      </div>

      {settings.enabled ? (
        <>
          <div className="flex flex-wrap items-center gap-[8px]">
            <ActionButton tone="primary" onClick={() => setSheet({ mode: "add" })} disabled={busy || event.status === "cancelled"} testId="events-program-add">
              {t("dashboard.events.program.add")}
            </ActionButton>
            <ActionButton onClick={importLineup} disabled={busy || event.status === "cancelled"} testId="events-program-import">
              {t("dashboard.events.program.importLineup")}
            </ActionButton>
            {items && items.length > 0 ? <span className="font-admin-body text-[12px] text-admin-ink-muted">{interpolate(t("dashboard.events.program.count"), { count: items.length })}</span> : null}
          </div>

          {items === null && !loadError ? (
            <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.loading")}</p>
          ) : items && items.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-admin-border-soft p-[20px]" data-testid="events-program-empty">
              <div className="font-admin-body text-[14px] font-semibold text-admin-ink">{t("dashboard.events.program.emptyTitle")}</div>
              <p className="m-0 mt-[6px] max-w-[560px] font-admin-body text-[13px] leading-[1.5] text-admin-ink-muted">{t("dashboard.events.program.emptyHint")}</p>
            </div>
          ) : items ? (
            <ProgramList items={items} sessions={sessions} spaces={spaceRefs} zone={zone} locale={locale} groupBy={groupBy} busyId={busyId} actions={listActions} />
          ) : null}
        </>
      ) : null}

      <ProgramItemSheet
        open={sheet !== null}
        eventId={event.id}
        tenantId={tenantId}
        zone={zone}
        nights={nights}
        places={places}
        item={sheet?.mode === "edit" ? sheet.item : null}
        nextSortOrder={nextSortOrder}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          setOutcome({ kind: "done", text: t("dashboard.events.program.sheet.saved") });
          load();
        }}
      />
    </div>
  );
}
