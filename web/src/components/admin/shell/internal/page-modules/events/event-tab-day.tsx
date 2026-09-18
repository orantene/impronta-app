"use client";

/**
 * event-tab-day — W17 (Venue & seating) and W18 (Event day) inside
 * EventDetail.
 *
 * W17: Change venue stays disabled (`events.venue_id` is set at creation).
 * Layout save is `eventSeatMapUpsert`. Seat hold is `admissionHoldSeats`
 * (E03); expired holds are the reaper (E05). Dining and blocked interval
 * stay disabled. The ticket table below is real (tiers joined to the
 * night's pools).
 *
 * W18: every gate and box office rule on the board (entrances, scanner
 * devices, re-entry, wrong night, refund requested, refund confirmed,
 * override, offline scanning, device, door phase price, names, comp
 * allocation, meal redemption, staff) has no column; the card says what the
 * POS applies tonight as the engine's own fixed answer, disabled, and the
 * readiness strip is derived from the rows that exist (D-POS-57).
 *
 * RUN OF SHOW (events-program §4, §12): the night's `event_schedule_items`,
 * staff rows included, read through `listScheduleItems` and grouped by night
 * with the same grouper the Programa tab and the public block use. Read-only
 * here; editing lives in the Programa tab. "Ahora" is the client clock after
 * mount, never the server's.
 */

import { useCallback, useEffect, useState, useTransition } from "react";

import { loadSessionComps, type EventListRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { listScheduleItems } from "@/app/(workspace)/[tenantSlug]/admin/_events-schedule-actions";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { groupItemsByNight, type NightGroup, type PlacedScheduleItem } from "@/lib/events/schedule/grouping";
import { normalizeScheduleItemRow, type ScheduleItem } from "@/lib/events/schedule/model";
import { nowItemIds } from "@/lib/events/schedule/now-marker";
import { admissionComp, admissionHoldSeats, eventSeatMapUpsert, layoutsList } from "@/lib/server-actions/venue-engine";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";

import { ScanLine } from "lucide-react";

import { ActionButton, UsedIn } from "../appointments-classes-ui";
import { CARD, Field, INPUT } from "../catalog/catalog-ui";
import type { EventsNav } from "./EventsPage";
import { whenLabel } from "./EventsList";
import { useSessionPools } from "./event-tab-tickets";
import { eventDayReadiness, nightFigures, type DetailTab } from "./events-model";
import { DenseHead, DenseRow, EventsHeading, EventsNote, SELECT, SelectShell } from "./events-ui";

const COLS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_100px_minmax(0,1fr)_16px]";

function nightLabel(event: EventListRow, sessionId: string | null, locale: string, fallback: string): string {
  const sn = event.sessions.find((s) => s.id === sessionId) ?? null;
  return sn ? whenLabel(sn.startsAt, event.timeZone, locale, fallback, false) : fallback;
}

function OffField({ label, value, reason, quiet }: { label: string; value: string; reason: string; quiet?: boolean }) {
  return (
    <Field label={label} reason={quiet ? undefined : reason} className={quiet ? "opacity-70" : ""}>
      <SelectShell>
        <select disabled className={SELECT} aria-label={label} title={reason} data-not-wired="true">
          <option>{value}</option>
        </select>
      </SelectShell>
    </Field>
  );
}

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

export function EventVenueTab({ event, sessionId, locale }: { event: EventListRow; sessionId: string | null; locale: string }) {
  const t = useT();
  const pools = useSessionPools(sessionId);
  const figures = pools.rows ? nightFigures(pools.rows) : null;
  const noWriter = t("dashboard.events.venue.noWriterReason");
  const [layoutId, setLayoutId] = useState("");
  const [layoutOptions, setLayoutOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [seats, setSeats] = useState<Array<{ id: string; label: string }>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    void layoutsList().then((res) => {
      if (!res.ok) return;
      setLayoutOptions(res.layouts.map((row) => ({ id: row.id, name: row.name })));
      const active = res.layouts.find((row) => row.isActive) ?? res.layouts[0];
      if (active) setLayoutId((prev) => prev || active.id);
      const spaceById = new Map(res.spaces.map((s) => [s.id, s]));
      const nextSeats = res.items
        .filter((item) => item.layoutId === (active?.id ?? "") && spaceById.get(item.spaceId)?.kind === "seat")
        .map((item) => {
          const space = spaceById.get(item.spaceId);
          return { id: item.spaceId, label: space?.code || space?.name || item.spaceId };
        });
      setSeats(nextSeats);
    });
  }, []);

  useEffect(() => {
    if (!layoutId) return;
    void layoutsList().then((res) => {
      if (!res.ok) return;
      const spaceById = new Map(res.spaces.map((s) => [s.id, s]));
      setSeats(
        res.items
          .filter((item) => item.layoutId === layoutId && spaceById.get(item.spaceId)?.kind === "seat")
          .map((item) => {
            const space = spaceById.get(item.spaceId);
            return { id: item.spaceId, label: space?.code || space?.name || item.spaceId };
          }),
      );
    });
  }, [layoutId]);

  const sentence = (reason: string) => t(VENUE_ENGINE_REFUSALS[isRefusal(reason) ? reason : "unavailable"]);

  return (
    <div className="flex flex-col gap-[14px]" data-testid="events-panel-venue">
      <EventsHeading
        title={interpolate(t("dashboard.events.venue.title"), { date: nightLabel(event, sessionId, locale, t("dashboard.events.detail.noDate")) })}
        intro={t("dashboard.events.venue.intro")}
        actions={
          <>
            <ActionButton reason={noWriter}>{t("dashboard.events.venue.changeVenue")}</ActionButton>
            <ActionButton
              tone="primary"
              disabled={busy || !sessionId || !layoutId}
              testId="events-venue-save"
              onClick={() => {
                if (!sessionId || !layoutId) return;
                setNotice(null);
                start(async () => {
                  const res = await eventSeatMapUpsert({ sessionId, layoutId });
                  setNotice(res.ok ? t("dashboard.events.venue.saved") : sentence(res.reason));
                });
              }}
            >
              {t("dashboard.events.venue.save")}
            </ActionButton>
          </>
        }
      />
      <UsedIn
        count={2}
        label={t("dashboard.events.usedIn.label")}
        parts={[
          { where: t("dashboard.events.usedIn.pos"), what: t("dashboard.events.venue.usedInPos") },
          { where: t("dashboard.events.usedIn.web"), what: t("dashboard.events.venue.usedInWeb") },
        ]}
      />
      <div className="grid grid-cols-2 gap-[16px]">
        <OffField label={t("dashboard.events.venue.space")} value={t("dashboard.events.venue.spaceNone")} reason={noWriter} />
        <Field label={t("dashboard.events.venue.layout")}>
          <SelectShell>
            <select
              className={SELECT}
              aria-label={t("dashboard.events.venue.layout")}
              value={layoutId}
              onChange={(e) => setLayoutId(e.target.value)}
              data-testid="events-venue-layout"
            >
              <option value="">{t("dashboard.events.venue.layoutNone")}</option>
              {layoutOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </SelectShell>
        </Field>
        <Field label={t("dashboard.events.venue.blocked")} reason={t("dashboard.events.venue.blockedReason")}>
          <input disabled className={INPUT} value={event.doorsOffsetMinutes > 0 ? interpolate(t("dashboard.events.overview.doorsBefore"), { minutes: event.doorsOffsetMinutes }) : t("dashboard.events.overview.doorsWith")} readOnly />
        </Field>
        <OffField label={t("dashboard.events.venue.dining")} value={t("dashboard.events.venue.diningNone")} reason={t("dashboard.events.venue.diningReason")} />
      </div>
      <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`} data-testid="events-seat-map">
        <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.venue.seats")}</div>
        {seats.length === 0 ? (
          <p className="m-0 font-admin-body text-[12.5px] text-admin-ink-muted">{t("dashboard.events.venue.seatsEmpty")}</p>
        ) : (
          <div className="flex flex-wrap gap-[8px]">
            {seats.map((seat) => {
              const on = picked.includes(seat.id);
              return (
                <button
                  key={seat.id}
                  type="button"
                  aria-pressed={on}
                  data-testid={`events-seat-${seat.id}`}
                  onClick={() => setPicked((prev) => (on ? prev.filter((id) => id !== seat.id) : [...prev, seat.id]))}
                  className={`rounded-[8px] border px-[10px] py-[8px] font-admin-body text-[12.5px] ${on ? "border-admin-brand bg-admin-brand-soft font-semibold text-admin-brand" : "border-admin-border bg-admin-card text-admin-ink"}`}
                >
                  {seat.label}
                </button>
              );
            })}
          </div>
        )}
        <ActionButton
          disabled={busy || !sessionId || picked.length === 0}
          testId="events-hold-seats"
          onClick={() => {
            if (!sessionId) return;
            setNotice(null);
            start(async () => {
              const res = await admissionHoldSeats({
                sessionId,
                seatIds: picked,
                operationKey: crypto.randomUUID(),
              });
              if (!res.ok) {
                setNotice(sentence(res.reason));
                return;
              }
              setHoldUntil(res.expiresAt);
              setNotice(interpolate(t("dashboard.events.venue.heldUntil"), { when: res.expiresAt }));
            });
          }}
        >
          {t("dashboard.events.venue.holdSeats")}
        </ActionButton>
        {holdUntil ? <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">{interpolate(t("dashboard.events.venue.heldUntil"), { when: holdUntil })}</p> : null}
        {notice ? <p role="status" className="m-0 font-admin-body text-[12.5px] text-admin-ink">{notice}</p> : null}
      </div>
      <div className={CARD}>
        <DenseHead cols={COLS}>
          <span>{t("dashboard.events.tickets.colType")}</span>
          <span>{t("dashboard.events.venue.colUses")}</span>
          <span>{t("dashboard.events.venue.colCapacity")}</span>
          <span>{t("dashboard.events.tickets.colAllocation")}</span>
          <span />
        </DenseHead>
        {event.tiers.length === 0 ? <p className="m-0 border-t border-admin-border-soft px-[18px] py-[20px] font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.tickets.empty")}</p> : null}
        {event.tiers.map((tier) => {
          const pool = pools.rows?.find((p) => p.poolKey === tier.poolKey) ?? null;
          return (
            <DenseRow key={tier.id} cols={COLS}>
              <span className="truncate font-admin-body text-[13px] font-semibold text-admin-ink">{tier.label}</span>
              <span className="truncate text-admin-ink-muted">
                {tier.seatingMode === "space_group" ? t("dashboard.events.venue.usesTables") : interpolate(t("dashboard.events.venue.usesPool"), { pool: tier.poolKey })}
              </span>
              <span className="font-mono text-[12px] tabular-nums">{!sessionId ? "—" : pool === null ? "…" : pool.poolId === null ? t("dashboard.events.venue.noPool") : String((pool.unitsTotal ?? 0) + (pool.overbookUnits ?? 0))}</span>
              <span className="text-admin-ink-dim" title={t("dashboard.events.tickets.allocationReason")}>
                —
              </span>
              <span />
            </DenseRow>
          );
        })}
      </div>
      <EventsNote>
        {figures && figures.capacity !== null
          ? interpolate(t("dashboard.events.venue.totalNote"), { capacity: figures.capacity, pooled: figures.pooled })
          : t("dashboard.events.venue.totalNoteNone")}
      </EventsNote>
    </div>
  );
}

/** The Programa tab's id. Its panel lands in its own PR; the href pattern is EventDetail's own. */
const PROGRAM_TAB = "program" as DetailTab;

/** Refreshes the "Ahora" mark; a set is on for an hour, a minute is plenty. */
const NOW_TICK_MS = 60_000;

type RunOfShowState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: ScheduleItem[] };

function useRunOfShow(eventId: string): RunOfShowState {
  const [state, setState] = useState<RunOfShowState>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    void listScheduleItems({ eventId }).then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setState({ kind: "error", message: res.error });
        return;
      }
      const items: ScheduleItem[] = [];
      for (const row of res.items) {
        const item = normalizeScheduleItemRow(row);
        if (item) items.push(item);
      }
      setState({ kind: "ready", items });
    });
    return () => {
      alive = false;
    };
  }, [eventId]);
  return state;
}

/** The client clock, read after mount and once a minute; null on the server render. */
function useNowMs(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Tonight's groups: the selected night plus any "general" rows; every night when none is selected. */
function groupsForNight(groups: NightGroup[], sessionId: string | null): NightGroup[] {
  if (!sessionId) return groups;
  return groups.filter((g) => g.sessionId === null || g.sessionId === sessionId);
}

const ROS_COLS = "grid-cols-[84px_minmax(0,1fr)_auto]";

function RunOfShowRow({ placed, now, staffOnlyLabel, nowLabel, tbaLabel }: { placed: PlacedScheduleItem; now: boolean; staffOnlyLabel: string; nowLabel: string; tbaLabel: string }) {
  const { item } = placed;
  const detail = item.performerName ?? item.subtitle;
  return (
    <DenseRow cols={ROS_COLS} testId={`events-ros-item-${item.id}`} className={now ? "bg-admin-brand-soft" : ""}>
      <span className="flex items-baseline gap-[3px] font-mono text-[12px] tabular-nums text-admin-ink" data-testid="events-ros-time">
        {placed.timeLabel ? (
          <>
            {placed.timeLabel}
            {placed.dayOffset > 0 ? <sup className="text-[9px] font-semibold text-admin-ink-muted">{`+${placed.dayOffset}`}</sup> : null}
          </>
        ) : (
          <span className="font-admin-body text-[12px] text-admin-ink-muted">{tbaLabel}</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-admin-body text-[13px] font-semibold text-admin-ink">{item.title}</span>
        {detail ? <span className="block truncate font-admin-body text-[12px] text-admin-ink-muted">{detail}</span> : null}
      </span>
      <span className="flex items-center gap-[6px]">
        {item.visibility === "staff" ? (
          <span className="rounded-[5px] bg-admin-surface-alt px-[7px] py-[2px] font-admin-body text-[11px] font-semibold text-admin-ink-muted" data-testid="events-ros-staff-only">
            {staffOnlyLabel}
          </span>
        ) : null}
        {now ? (
          <span className="rounded-[5px] bg-admin-brand px-[7px] py-[2px] font-admin-body text-[11px] font-semibold text-white" data-testid="events-ros-now">
            {nowLabel}
          </span>
        ) : null}
      </span>
    </DenseRow>
  );
}

/** The night's rows, staff items included, read-only. Editing is the Programa tab. */
function RunOfShowStrip({ event, sessionId, nav, locale }: { event: EventListRow; sessionId: string | null; nav: EventsNav; locale: string }) {
  const t = useT();
  const state = useRunOfShow(event.id);
  const nowMs = useNowMs();
  const labelLocale = locale === "es" ? "es" : "en";
  const groups = state.kind === "ready" ? groupsForNight(groupItemsByNight(state.items, event.sessions, event.timeZone, { locale: labelLocale }), sessionId) : [];
  const nowIds = new Set(nowMs === null ? [] : groups.flatMap((g) => nowItemIds(g.items, nowMs)));
  const showHeaders = groups.length > 1;
  const programHref = nav.href({ event: event.id, tab: PROGRAM_TAB });
  const staffOnly = t("dashboard.events.day.runOfShow.staffOnly");
  const nowLabel = t("dashboard.events.day.runOfShow.now");
  const tbaLabel = t("dashboard.events.day.runOfShow.tba");
  return (
    <div className={CARD} data-testid="events-run-of-show" data-state={state.kind}>
      <div className="flex items-center justify-between gap-[12px] px-[18px] py-[12px]">
        <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.day.runOfShow.title")}</div>
        {state.kind === "ready" && groups.length > 0 ? (
          <a href={programHref} className="font-admin-body text-[12.5px] font-semibold text-admin-brand no-underline hover:underline" data-testid="events-ros-edit-link">
            {t("dashboard.events.day.runOfShow.editLink")}
          </a>
        ) : null}
      </div>
      {state.kind === "error" ? <p role="status" className="m-0 border-t border-admin-border-soft px-[18px] py-[14px] font-admin-body text-[12.5px] text-admin-ink-muted">{state.message}</p> : null}
      {state.kind === "ready" && groups.length === 0 ? (
        <p className="m-0 border-t border-admin-border-soft px-[18px] py-[14px] font-admin-body text-[12.5px] text-admin-ink-muted" data-testid="events-ros-empty">
          {t("dashboard.events.day.runOfShow.empty")}{" "}
          <a href={programHref} className="font-semibold text-admin-brand no-underline hover:underline">
            {t("dashboard.events.day.runOfShow.emptyLink")}
          </a>
        </p>
      ) : null}
      {groups.map((g) => (
        <div key={g.key} data-testid={`events-ros-night-${g.key}`}>
          {showHeaders ? <div className="border-t border-admin-border-soft px-[18px] py-[8px] font-admin-body text-[11px] font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">{g.label}</div> : null}
          {g.items.map((p) => (
            <RunOfShowRow key={p.item.id} placed={p} now={nowIds.has(p.item.id)} staffOnlyLabel={staffOnly} nowLabel={nowLabel} tbaLabel={tbaLabel} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EventDayTab({ event, sessionId, nav, locale }: { event: EventListRow; sessionId: string | null; nav: EventsNav; locale: string }) {
  const t = useT();
  const pools = useSessionPools(sessionId);
  const noColumn = t("dashboard.events.day.noColumnReason");
  const [compName, setCompName] = useState("");
  const [compEmail, setCompEmail] = useState("");
  const [compReason, setCompReason] = useState("");
  const [compTier, setCompTier] = useState(event.tiers[0]?.id ?? "");
  const [compNotice, setCompNotice] = useState<string | null>(null);
  const [comps, setComps] = useState<{ count: number; names: string[] } | null>(null);
  const refreshComps = useCallback(() => {
    if (!sessionId) { setComps(null); return; }
    void loadSessionComps(sessionId).then((r) => setComps(r.ok ? { count: r.count, names: r.names } : null));
  }, [sessionId]);
  useEffect(refreshComps, [refreshComps]);
  const [compBusy, startComp] = useTransition();
  const readiness = eventDayReadiness(event, pools.rows);
  const readinessLabel = {
    published: t("dashboard.events.day.readyPublished"),
    tiers: t("dashboard.events.day.readyTiers"),
    night: t("dashboard.events.day.readyNight"),
    pools: t("dashboard.events.day.readyPools"),
    cover: t("dashboard.events.day.readyCover"),
    refunds: t("dashboard.events.day.readyRefunds"),
  };
  const gate: Array<[string, string]> = [
    [t("dashboard.events.day.entrances"), t("dashboard.events.day.entrancesValue")],
    [t("dashboard.events.day.scanners"), t("dashboard.events.day.scannersValue")],
    [t("dashboard.events.day.reentry"), t("dashboard.events.day.reentryValue")],
    [t("dashboard.events.day.wrongNight"), t("dashboard.events.day.wrongNightValue")],
    [t("dashboard.events.day.refundRequested"), t("dashboard.events.day.refundRequestedValue")],
    [t("dashboard.events.day.refundConfirmed"), t("dashboard.events.day.refundConfirmedValue")],
    [t("dashboard.events.day.override"), t("dashboard.events.day.overrideValue")],
    [t("dashboard.events.day.offline"), t("dashboard.events.day.offlineValue")],
  ];
  const box: Array<[string, string]> = [
    [t("dashboard.events.day.device"), t("dashboard.events.day.deviceValue")],
    [t("dashboard.events.day.doorPrice"), t("dashboard.events.day.doorPriceValue")],
    [t("dashboard.events.day.names"), t("dashboard.events.day.namesValue")],
    [
      t("dashboard.events.day.comps"),
      comps && comps.count > 0
        ? interpolate(t("dashboard.events.day.compsCount"), { count: comps.count, names: comps.names.join(", ") + (comps.count > comps.names.length ? ` +${comps.count - comps.names.length}` : "") })
        : t("dashboard.events.day.compsValue"),
    ],
    [t("dashboard.events.day.meals"), t("dashboard.events.day.mealsValue")],
    [t("dashboard.events.day.staff"), t("dashboard.events.day.staffValue")],
  ];
  return (
    <div className="flex flex-col gap-[14px]" data-testid="events-panel-day">
      <EventsHeading
        title={interpolate(t("dashboard.events.day.title"), { date: nightLabel(event, sessionId, locale, t("dashboard.events.detail.noDate")) })}
        intro={t("dashboard.events.day.intro")}
        actions={
          <>
            <ActionButton tone="primary" reason={noColumn}>
              {t("dashboard.events.day.save")}
            </ActionButton>
            <a href={`${nav.base}/pos?mode=door`} className="inline-flex h-[34px] items-center gap-[6px] rounded-[9px] border border-admin-ink-muted bg-admin-ink-muted px-[14px] font-admin-body text-admin-13 font-semibold text-white no-underline hover:opacity-90" data-testid="events-open-pos">
              <ScanLine aria-hidden size={13} strokeWidth={1.75} />
              {t("dashboard.events.day.openPos")}
            </a>
          </>
        }
      />
      <UsedIn
        count={2}
        label={t("dashboard.events.usedIn.label")}
        parts={[
          { where: t("dashboard.events.usedIn.pos"), what: t("dashboard.events.usedIn.posWhat") },
          { where: t("dashboard.events.usedIn.web"), what: t("dashboard.events.day.usedInWeb") },
        ]}
      />
      <RunOfShowStrip event={event} sessionId={sessionId} nav={nav} locale={locale} />
      <div className="grid grid-cols-2 gap-[16px]">
        <div className={`${CARD} flex flex-col gap-[12px] p-[16px]`}>
          <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.day.gate")}</div>
          <p className="m-0 -mt-[6px] font-admin-body text-[11.5px] leading-[1.2] text-admin-ink-dim">{noColumn}</p>
          <div className="grid grid-cols-2 gap-[12px]">
            {gate.map(([label, value]) => (
              <OffField key={label} label={label} value={value} reason={noColumn} quiet />
            ))}
          </div>
        </div>
        <div className={`${CARD} flex flex-col gap-[12px] p-[16px]`}>
          <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.day.boxOffice")}</div>
          <p className="m-0 -mt-[6px] font-admin-body text-[11.5px] leading-[1.2] text-admin-ink-dim">{noColumn}</p>
          <div className="grid grid-cols-2 gap-[12px]">
            {box.map(([label, value]) => (
              <OffField key={label} label={label} value={value} reason={noColumn} quiet />
            ))}
          </div>
        </div>
      </div>
      <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`} data-testid="events-day-readiness">
        <div className="font-admin-body text-[11px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{t("dashboard.events.day.readiness")}</div>
        <div className="grid grid-cols-3 gap-[10px] max-[720px]:grid-cols-2">
          {readiness.map((r) => (
            <div key={r.key} className={`rounded-[10px] px-[12px] py-[10px] font-admin-body ${r.ok ? "bg-admin-success-soft" : "bg-admin-coral-soft"}`} data-ready={r.ok ? "true" : "false"}>
              <div className={`text-[12.5px] font-semibold ${r.ok ? "text-admin-green" : "text-admin-coral-deep"}`}>{readinessLabel[r.key]}</div>
              <div className="text-[11.5px] text-admin-ink-muted">{r.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`} data-testid="events-comp">
        <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.day.compTitle")}</div>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label={t("dashboard.events.day.compName")}>
            <input value={compName} onChange={(e) => setCompName(e.target.value)} className={INPUT} data-testid="events-comp-name" />
          </Field>
          <Field label={t("dashboard.events.day.compEmail")}>
            <input value={compEmail} onChange={(e) => setCompEmail(e.target.value)} className={INPUT} data-testid="events-comp-email" />
          </Field>
          <Field label={t("dashboard.events.day.compReason")}>
            <input value={compReason} onChange={(e) => setCompReason(e.target.value)} className={INPUT} data-testid="events-comp-reason" />
          </Field>
          <Field label={t("dashboard.events.tickets.colType")}>
            <SelectShell>
              <select value={compTier} onChange={(e) => setCompTier(e.target.value)} className={SELECT} data-testid="events-comp-tier">
                {event.tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </SelectShell>
          </Field>
        </div>
        <ActionButton
          tone="primary"
          disabled={compBusy || !sessionId || !compName.trim() || !compReason.trim() || !compTier}
          testId="events-comp-save"
          onClick={() => {
            if (!sessionId) return;
            setCompNotice(null);
            startComp(async () => {
              const res = await admissionComp({
                sessionId,
                tierVariantId: compTier,
                holderName: compName.trim(),
                holderEmail: compEmail.includes("@") ? compEmail.trim() : null,
                reason: compReason.trim(),
                operationKey: crypto.randomUUID(),
              });
              setCompNotice(res.ok ? t("dashboard.events.day.compDone") : t(VENUE_ENGINE_REFUSALS[res.reason in VENUE_ENGINE_REFUSALS ? (res.reason as VenueEngineRefusal) : "unavailable"]));
              if (res.ok) refreshComps();
            });
          }}
        >
          {t("dashboard.events.day.compAction")}
        </ActionButton>
        {compNotice ? <p role="status" className="m-0 font-admin-body text-[12.5px] text-admin-ink">{compNotice}</p> : null}
      </div>
    </div>
  );
}
