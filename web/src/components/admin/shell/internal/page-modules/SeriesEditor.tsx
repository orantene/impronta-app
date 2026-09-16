"use client";

/**
 * SeriesEditor — board W10 (Appointments & Classes › Series › Generate
 * sessions): the series' definition as four rows of fields, the preview of
 * its dated sessions with the room conflicts, and on the right WHAT THE POS
 * GETS with the sweep's own warning.
 *
 * TWO WRITES, BOTH THE ENGINE'S. `Save series` runs `upsertSessionSeriesAction`
 * with the venue's zone (never the browser's); `Generate sessions` runs
 * `generateSessionsForSeriesAction` up to the date in the header, which is
 * idempotent: a session that already exists is counted as reused, never
 * doubled. Every refusal is the `dashboard.scheduling.engine.refusal.*`
 * sentence.
 *
 * THE PREVIEW IS THE READER'S. The rows are the series' dated sessions the
 * page already holds, and the conflicts are the same `decideMaterialisation`
 * the sweep runs (`skipped`), not a second simulation.
 *
 * NOT WIRED, said on the control (D-POS-119): Equipment positions, Booking
 * window, Waitlist hold, Pass eligibility, Attendance rule, Cancellation rule,
 * Edit template. Each is drawn where the board draws it, disabled with its
 * one-sentence reason.
 */

import { useState, type ReactNode } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { DEFAULT_WAITLIST_OFFER_MINUTES } from "@/lib/scheduling/session-waitlist";
import { addUtcDays } from "@/lib/scheduling/tz";
import { generateSessionsForSeriesAction, upsertSessionSeriesAction } from "@/lib/server-actions/scheduling-engine";
import type { ScheduleSeries, ScheduleVenue } from "@/lib/sessions/schedule-actions";
import { Icon } from "../primitives";
import { engineRefusalKey } from "./catalog/catalog-model";
import type { SessionRow } from "./appointments-classes-model";
import { ActionButton, BUTTON_PRIMARY, CARD, FactRow, INPUT, Outcome, SectionLabel, StatePill, UsedIn } from "./appointments-classes-ui";
import { whenLine } from "./appointments-format";
import type { StaffOption } from "./SessionPanelForms";

const K = "dashboard.adminAppointments.board.seriesEditor";
const B = "dashboard.adminAppointments.board";
const ISO_WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type SeriesDraft = {
  seriesId: string | null;
  title: string;
  weekdays: number[];
  localTime: string;
  durationMinutes: string;
  seats: string;
  startsOn: string;
  endsOn: string;
  venueId: string;
  offeringId: string;
  instructorUserId: string;
  isActive: boolean;
};

export type CatalogOption = { readonly id: string; readonly title: string };

export function draftFromSeries(series: ScheduleSeries | null, todayYmd: string, venues: readonly ScheduleVenue[]): SeriesDraft {
  if (!series) {
    return {
      seriesId: null,
      title: "",
      weekdays: [],
      localTime: "10:00",
      durationMinutes: "60",
      seats: "10",
      startsOn: todayYmd,
      endsOn: "",
      venueId: venues[0]?.id ?? "",
      offeringId: "",
      instructorUserId: "",
      isActive: true,
    };
  }
  return {
    seriesId: series.id,
    title: series.title,
    weekdays: [...series.weekdays],
    localTime: series.localTime,
    durationMinutes: String(series.durationMinutes),
    seats: String(series.seats),
    startsOn: series.startsOn,
    endsOn: series.endsOn ?? "",
    venueId: series.venueId ?? venues[0]?.id ?? "",
    offeringId: series.offeringId ?? "",
    instructorUserId: series.instructorUserId ?? "",
    isActive: series.isActive,
  };
}

const FIELD = "flex h-[36px] items-center gap-[8px] rounded-[9px] border border-admin-border bg-admin-card px-[12px] font-admin-body text-admin-13 text-admin-ink";
const FIELD_OFF = `${FIELD} cursor-not-allowed opacity-50`;
const LABEL = "mb-[6px] flex gap-[4px] font-admin-body text-[12px] font-semibold text-admin-ink";
const HINT = "mt-[5px] font-admin-body text-[11.5px] text-admin-ink-dim";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className={LABEL}>{label}</div>
      {children}
      {hint ? <div className={HINT}>{hint}</div> : null}
    </div>
  );
}

/** A field the engine has no writer for: the board's value, disabled, its reason as the title. */
function OffField({ label, value, reason }: { label: string; value: string; reason: string }) {
  return (
    <Field label={label}>
      <div className={FIELD_OFF} title={reason} aria-disabled data-not-wired="true">
        <span className="flex-1 truncate">{value}</span>
        <Icon name="chevron-down" size={14} stroke={1.75} color="var(--color-admin-ink-dim)" />
      </div>
    </Field>
  );
}

function Select({ value, onChange, children, testId }: { value: string; onChange: (v: string) => void; children: ReactNode; testId?: string }) {
  return (
    <div className={`${FIELD} relative`}>
      <select className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent px-[12px] font-admin-body text-admin-13 text-admin-ink" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        {children}
      </select>
      <span className="pointer-events-none ml-auto text-admin-ink-dim">
        <Icon name="chevron-down" size={14} stroke={1.75} />
      </span>
    </div>
  );
}

export function SeriesEditor({
  initial,
  series,
  sessions,
  venues,
  staff,
  items,
  posOn,
  todayYmd,
  onSaved,
  onGenerated,
  onClose,
}: {
  initial: SeriesDraft;
  /** The reader's row for an existing series (its refusal and skipped collisions), or null for a new one. */
  series: ScheduleSeries | null;
  /** The series' dated sessions the page holds. */
  sessions: readonly SessionRow[];
  venues: readonly ScheduleVenue[];
  staff: readonly StaffOption[];
  items: readonly CatalogOption[];
  posOn: boolean;
  todayYmd: string;
  onSaved: (seriesId: string) => void;
  onGenerated: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const [draft, setDraft] = useState<SeriesDraft>(initial);
  const [until, setUntil] = useState(() => addUtcDays(todayYmd, 28) ?? todayYmd);
  const [busy, setBusy] = useState<"save" | "generate" | null>(null);
  const [outcome, setOutcome] = useState<{ kind: "refused" | "done"; text: string } | null>(null);

  const venue = venues.find((v) => v.id === draft.venueId) ?? null;
  const set = <Key extends keyof SeriesDraft>(key: Key, value: SeriesDraft[Key]) => setDraft((d) => ({ ...d, [key]: value }));
  const nameOf = (userId: string | null) => (userId ? (staff.find((s) => s.id === userId)?.name ?? null) : null);

  const save = async () => {
    const durationMinutes = Number.parseInt(draft.durationMinutes, 10);
    const seats = Number.parseInt(draft.seats, 10);
    if (draft.weekdays.length === 0) return setOutcome({ kind: "refused", text: t(`${K}.needDays`) });
    if (!draft.venueId || !venue) return setOutcome({ kind: "refused", text: t(`${K}.needRoom`) });
    if (!draft.instructorUserId) return setOutcome({ kind: "refused", text: t(`${K}.needInstructor`) });
    if (!Number.isInteger(durationMinutes) || !Number.isInteger(seats)) return setOutcome({ kind: "refused", text: t(`${K}.needNumber`) });
    setBusy("save");
    setOutcome(null);
    try {
      const res = await upsertSessionSeriesAction({
        seriesId: draft.seriesId ?? undefined,
        title: draft.title,
        localTime: draft.localTime,
        timeZone: venue.timeZone,
        weekdays: [...draft.weekdays].sort((a, b) => a - b),
        durationMinutes,
        seats,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn || null,
        venueId: draft.venueId,
        offeringId: draft.offeringId || null,
        instructorUserId: draft.instructorUserId,
        isActive: draft.isActive,
      });
      if (res.ok) {
        set("seriesId", res.seriesId);
        setOutcome({ kind: "done", text: t(`${K}.saved`) });
        onSaved(res.seriesId);
      } else {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
      }
    } catch {
      setOutcome({ kind: "refused", text: t(engineRefusalKey("unavailable")) });
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    if (!draft.seriesId) return;
    setBusy("generate");
    setOutcome(null);
    try {
      const res = await generateSessionsForSeriesAction({ seriesId: draft.seriesId, untilDate: until });
      if (res.ok) {
        setOutcome({ kind: "done", text: interpolate(t(`${B}.generated`), { created: res.created, reused: res.reused }) });
        onGenerated();
      } else {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
      }
    } catch {
      setOutcome({ kind: "refused", text: t(engineRefusalKey("unavailable")) });
    } finally {
      setBusy(null);
    }
  };

  const skipped = series?.skipped ?? [];
  const previewGrid = "grid grid-cols-[1.2fr_120px_120px_130px_1fr_24px] items-center gap-[10px] px-[16px] *:min-w-0";
  const roomName = venue?.name ?? "—";
  const usedParts = [
    { where: t(`${B}.usedPos`), what: posOn ? t(`${B}.usedPosOn`) : t(`${B}.usedPosOff`) },
    { where: t(`${B}.usedWeb`), what: t(`${B}.usedWebWhat`) },
  ];

  return (
    <div data-testid="series-editor" className="grid min-h-full grid-cols-[1fr_360px] max-[720px]:grid-cols-[1fr]">
      <div className="flex min-w-0 flex-col gap-[14px] border-r border-admin-border px-[28px] py-[20px] max-[720px]:px-[14px]">
        <div className="flex items-center justify-between gap-[12px]">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">
              {draft.seriesId ? interpolate(t(`${K}.editTitle`), { title: draft.title || t(`${K}.newTitle`) }) : t(`${K}.newTitle`)}
            </div>
            <div className="mt-[4px] truncate text-admin-13 text-admin-ink-muted">{t(`${K}.subtitle`)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-[8px]">
            <button
              type="button"
              aria-label={t(`${K}.close`)}
              title={t(`${K}.close`)}
              disabled={busy !== null}
              className="inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong disabled:opacity-50"
              data-testid="series-editor-close"
              onClick={onClose}
            >
              <Icon name="x" size={14} stroke={1.75} />
            </button>
            <ActionButton reason={t(`${K}.editTemplateOff`)}>{t(`${K}.editTemplate`)}</ActionButton>
            <ActionButton onClick={() => void save()} disabled={busy !== null} testId="series-save">
              {busy === "save" ? t(`${K}.saving`) : t(`${K}.save`)}
            </ActionButton>
            <input type="date" aria-label={t(`${K}.generateUntil`)} className={`${INPUT} w-[140px]`} value={until} min={todayYmd} onChange={(e) => setUntil(e.target.value)} data-testid="series-generate-until" />
            <ActionButton
              tone="primary"
              reason={draft.seriesId ? null : t(`${K}.generateSaveFirst`)}
              disabled={busy !== null}
              onClick={() => void generate()}
              testId="series-generate"
            >
              {busy === "generate" ? t(`${B}.generateForm.working`) : t(`${K}.generate`)}
            </ActionButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[8px]">
          <UsedIn count={posOn ? 2 : 1} label={t(`${B}.usedIn`)} parts={usedParts} />
          <span className="font-admin-body text-[11.5px] text-admin-ink-dim">{t(`${K}.usedNote`)}</span>
        </div>

        {outcome ? (
          <Outcome kind={outcome.kind} testId="series-editor-message">
            {outcome.text}
          </Outcome>
        ) : null}

        {/* Row 0: what the engine needs and the board keeps in its header. */}
        <div className="grid grid-cols-4 gap-[12px]">
          <Field label={t(`${K}.title`)}>
            <input className={FIELD} placeholder={t(`${K}.titlePlaceholder`)} value={draft.title} onChange={(e) => set("title", e.target.value)} data-testid="series-title" />
          </Field>
          <Field label={t(`${K}.startsOn`)}>
            <input type="date" className={FIELD} value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
          </Field>
          <Field label={t(`${K}.endsOn`)} hint={t(`${K}.endsOnHint`)}>
            <input type="date" className={FIELD} value={draft.endsOn} min={draft.startsOn} onChange={(e) => set("endsOn", e.target.value)} />
          </Field>
          <Field label={t(`${K}.active`)}>
            <button
              type="button"
              role="switch"
              aria-checked={draft.isActive}
              className={`${FIELD} cursor-pointer justify-between`}
              onClick={() => set("isActive", !draft.isActive)}
            >
              <span className="truncate">{draft.isActive ? t(`${K}.activeOn`) : t(`${K}.activeOff`)}</span>
              <span className={`inline-block h-[18px] w-[32px] shrink-0 rounded-full p-[2px] ${draft.isActive ? "bg-admin-brand" : "bg-admin-border-strong"}`}>
                <span className={`block h-[14px] w-[14px] rounded-full bg-white ${draft.isActive ? "translate-x-[14px]" : ""}`} />
              </span>
            </button>
          </Field>
        </div>

        {/* Row 1: Days · Time · Studio · Instructor */}
        <div className="grid grid-cols-4 gap-[12px]">
          <Field label={t(`${K}.days`)}>
            <div className={`${FIELD} gap-[3px] px-[6px]`} role="group" aria-label={t(`${K}.days`)} data-testid="series-days">
              {ISO_WEEKDAY_KEYS.map((key, i) => {
                const iso = i + 1;
                const on = draft.weekdays.includes(iso);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    className={`h-[24px] flex-1 cursor-pointer rounded-[6px] px-0 font-admin-body text-[11px] font-semibold ${on ? "bg-admin-brand text-white" : "bg-admin-surface-alt text-admin-ink-muted hover:text-admin-ink"}`}
                    onClick={() => set("weekdays", on ? draft.weekdays.filter((d) => d !== iso) : [...draft.weekdays, iso])}
                  >
                    {t(`dashboard.adminSessions.weekday.${key}`).slice(0, 2)}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t(`${K}.time`)}>
            <div className={`${FIELD} gap-[6px] px-[8px]`}>
              <input type="time" className="min-w-[88px] flex-1 bg-transparent font-admin-body text-admin-13 text-admin-ink" value={draft.localTime} onChange={(e) => set("localTime", e.target.value)} aria-label={t(`${K}.time`)} />
              <span className="text-admin-ink-dim">·</span>
              <input type="number" min={1} max={1440} inputMode="numeric" className="w-[44px] bg-transparent text-right font-admin-body text-admin-13 tabular-nums text-admin-ink" value={draft.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} aria-label={t(`${K}.duration`)} />
              <span className="text-admin-ink-muted">min</span>
            </div>
          </Field>
          <Field label={t(`${K}.room`)} hint={t(`${K}.roomHint`)}>
            <Select value={draft.venueId} onChange={(v) => set("venueId", v)} testId="series-room">
              {venues.length === 0 ? <option value="">{t(`${K}.roomNone`)}</option> : null}
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(`${K}.instructor`)}>
            <Select value={draft.instructorUserId} onChange={(v) => set("instructorUserId", v)} testId="series-instructor">
              <option value="">{t(`${K}.instructorNone`)}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Row 2: Capacity · Equipment positions · Booking window · Waitlist */}
        <div className="grid grid-cols-4 gap-[12px]">
          <Field label={t(`${K}.capacity`)} hint={t(`${K}.capacityHint`)}>
            <input type="number" min={0} inputMode="numeric" className={FIELD} value={draft.seats} onChange={(e) => set("seats", e.target.value)} data-testid="series-seats" />
          </Field>
          <OffField label={t(`${K}.equipment`)} value={t(`${B}.panel.equipmentOff`)} reason={t(`${K}.equipmentOff`)} />
          <OffField label={t(`${K}.bookingWindow`)} value={t(`${K}.bookingWindowValue`)} reason={t(`${K}.bookingWindowOff`)} />
          <OffField label={t(`${K}.waitlist`)} value={interpolate(t(`${K}.waitlistValue`), { minutes: DEFAULT_WAITLIST_OFFER_MINUTES })} reason={t(`${K}.waitlistOff`)} />
        </div>

        {/* Row 3: Drop-in item · Pass eligibility · Attendance · Cancellation */}
        <div className="grid grid-cols-4 gap-[12px]">
          <Field label={t(`${K}.item`)} hint={t(`${K}.itemHint`)}>
            <Select value={draft.offeringId} onChange={(v) => set("offeringId", v)} testId="series-item">
              <option value="">{t(`${K}.itemNone`)}</option>
              {items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </Field>
          <OffField label={t(`${K}.passes`)} value={t(`${K}.passesOff`)} reason={t(`${K}.passesOff`)} />
          <OffField label={t(`${K}.attendance`)} value={t(`${K}.attendanceValue`)} reason={t(`${K}.attendanceOff`)} />
          <OffField label={t(`${K}.cancellation`)} value={t(`${B}.panel.cancellationOff`)} reason={t(`${K}.cancellationOff`)} />
        </div>

        {/* The preview: the series' dated sessions and the sweep's collisions. */}
        <div className={`${CARD} overflow-hidden`} data-testid="series-preview">
          <div className={`${previewGrid} py-[8px] font-admin-body text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted`}>
            <span>{t(`${K}.preview`)}</span>
            <span>{t(`${K}.previewRoom`)}</span>
            <span>{t(`${K}.previewInstructor`)}</span>
            <span>{t(`${K}.previewPlaces`)}</span>
            <span>{t(`${K}.previewConflicts`)}</span>
            <span />
          </div>
          {sessions.length === 0 && skipped.length === 0 ? (
            <div className="border-t border-admin-border-soft px-[16px] py-[20px] font-admin-body text-admin-13 text-admin-ink-muted">{t(`${K}.previewNone`)}</div>
          ) : null}
          {sessions.map((row) => (
            <div key={row.id} className={`${previewGrid} border-t border-admin-border-soft py-[9px] font-admin-body text-admin-12h text-admin-ink`} data-series-preview-row={row.id}>
              <span className="font-semibold">{whenLine(row.startsAt, row.timeZone, locale)}</span>
              <span className="truncate">{row.room ?? roomName}</span>
              <span className="truncate">{nameOf(row.instructorUserId) ?? "—"}</span>
              <span className="tabular-nums">{row.seatsTotal ?? "—"}</span>
              <StatePill tone={row.state === "cancelled" ? "critical" : "green"} className="justify-start">
                {row.state === "cancelled" ? t(`${K}.previewCancelled`) : t(`${K}.previewClear`)}
              </StatePill>
              <span className="inline-flex h-[20px] w-[20px] items-center justify-center text-admin-ink-dim">
                <Icon name="ellipsis" size={13} stroke={1.75} />
              </span>
            </div>
          ))}
          {skipped.map((k) => (
            <div key={`skip-${k.startsAt}`} className={`${previewGrid} border-t border-admin-border-soft py-[9px] font-admin-body text-admin-12h text-admin-ink`}>
              <span className="font-semibold">{whenLine(k.startsAt, series?.timeZone ?? null, locale)}</span>
              <span className="truncate">{roomName}</span>
              <span className="truncate">{nameOf(draft.instructorUserId) ?? "—"}</span>
              <span className="tabular-nums">{draft.seats}</span>
              <StatePill tone="coral" className="justify-start">
                {t(`${K}.previewSkipped`)}
              </StatePill>
              <span />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[12px] bg-admin-surface p-[18px]">
        <SectionLabel>{t(`${K}.posGets`)}</SectionLabel>
        <div className={`${CARD} px-[14px] py-[12px]`}>
          <FactRow label={t(`${K}.posPicker`)}>{t(`${K}.posPickerValue`)}</FactRow>
          <FactRow label={t(`${K}.posCheckin`)}>{t(`${K}.posCheckinValue`)}</FactRow>
          <FactRow label={t(`${K}.posWaitlist`)}>{interpolate(t(`${K}.posWaitlistValue`), { minutes: DEFAULT_WAITLIST_OFFER_MINUTES })}</FactRow>
          <FactRow label={t(`${K}.posDropIn`)}>{t(`${K}.posDropInValue`)}</FactRow>
        </div>
        {series?.refusalReason ? (
          <div className="flex items-start gap-[8px] rounded-[10px] bg-admin-coral-soft px-[12px] py-[10px] font-admin-body text-[12.5px] leading-[1.45] text-admin-coral-deep">
            <Icon name="alert" size={14} stroke={1.75} />
            <span>{t(`dashboard.adminSessions.refusals.reason.${series.refusalReason}`)}</span>
          </div>
        ) : null}
        {skipped.map((k) => (
          <div key={`note-${k.startsAt}`} className="flex items-start gap-[8px] rounded-[10px] bg-admin-coral-soft px-[12px] py-[10px] font-admin-body text-[12.5px] leading-[1.45] text-admin-coral-deep">
            <Icon name="alert" size={14} stroke={1.75} />
            <span>
              {interpolate(t(`${K}.collisionNote`), {
                when: whenLine(k.startsAt, series?.timeZone ?? null, locale),
                other: k.collidesWithTitle ?? t("dashboard.adminSessions.refusals.anotherSession"),
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The header's `Generate sessions` on W39 / W40: pick a series and a date,
 * run the same idempotent generator. A card under the header, not a route.
 */
export function GenerateSessionsForm({
  seriesOptions,
  todayYmd,
  onGenerated,
  onClose,
}: {
  seriesOptions: ReadonlyArray<{ id: string; title: string }>;
  todayYmd: string;
  onGenerated: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [seriesId, setSeriesId] = useState(seriesOptions[0]?.id ?? "");
  const [until, setUntil] = useState(() => addUtcDays(todayYmd, 28) ?? todayYmd);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: "refused" | "done"; text: string } | null>(null);

  const submit = async () => {
    if (!seriesId) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await generateSessionsForSeriesAction({ seriesId, untilDate: until });
      if (res.ok) {
        setOutcome({ kind: "done", text: interpolate(t(`${B}.generated`), { created: res.created, reused: res.reused }) });
        onGenerated();
      } else {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
      }
    } catch {
      setOutcome({ kind: "refused", text: t(engineRefusalKey("unavailable")) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-testid="generate-sessions-form"
      className={`${CARD} flex flex-col gap-[8px] p-[12px]`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t(`${B}.generateForm.title`)}</div>
      <p className="m-0 font-admin-body text-[11.5px] leading-[1.45] text-admin-ink-muted">{t(`${B}.generateForm.help`)}</p>
      <div className="grid grid-cols-[1fr_170px] gap-[8px]">
        <label className="flex flex-col gap-[4px] font-admin-body text-[12px] text-admin-ink-muted">
          <span>{t(`${B}.generateForm.series`)}</span>
          <select className={`${INPUT} cursor-pointer`} value={seriesId} onChange={(e) => setSeriesId(e.target.value)} data-testid="generate-sessions-series">
            {seriesOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-[4px] font-admin-body text-[12px] text-admin-ink-muted">
          <span>{t(`${B}.generateForm.until`)}</span>
          <input type="date" className={INPUT} value={until} min={todayYmd} onChange={(e) => setUntil(e.target.value)} data-testid="generate-sessions-until" />
        </label>
      </div>
      <div className="flex gap-[8px]">
        <button type="submit" disabled={busy || !seriesId} className={`${BUTTON_PRIMARY} disabled:opacity-60`} data-testid="generate-sessions-submit">
          {busy ? t(`${B}.generateForm.working`) : t(`${B}.generateForm.submit`)}
        </button>
        <ActionButton onClick={onClose} disabled={busy}>
          {t(`${B}.generateForm.close`)}
        </ActionButton>
      </div>
      {outcome ? (
        <Outcome kind={outcome.kind} testId="generate-sessions-message">
          {outcome.text}
        </Outcome>
      ) : null}
    </form>
  );
}
