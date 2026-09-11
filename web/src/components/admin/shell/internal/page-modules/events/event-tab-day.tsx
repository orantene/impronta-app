"use client";

/**
 * event-tab-day — W17 (Venue & seating) and W18 (Event day) inside
 * EventDetail.
 *
 * W17: the space, layout, blocked interval and dining-in-the-window fields
 * have no writer on an event (`events.venue_id` is set at creation and
 * nothing edits it; layouts and intervals are Spaces S4-S6, parked), so
 * each is drawn disabled with its sentence; the ticket table below is real
 * (tiers joined to the night's pools).
 *
 * W18: every gate and box office rule on the board (entrances, scanner
 * devices, re-entry, wrong night, refund requested, refund confirmed,
 * override, offline scanning, device, door phase price, names, comp
 * allocation, meal redemption, staff) has no column; the card says what the
 * POS applies tonight as the engine's own fixed answer, disabled, and the
 * readiness strip is derived from the rows that exist (D-POS-57).
 */

import type { EventListRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";

import { ActionButton, UsedIn } from "../appointments-classes-ui";
import { CARD, Field, INPUT, ListHead, ListRow, Note, PageHeading } from "../catalog/catalog-ui";
import type { EventsNav } from "./EventsPage";
import { whenLabel } from "./EventsList";
import { useSessionPools } from "./event-tab-tickets";
import { eventDayReadiness, nightFigures } from "./events-model";

const COLS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_100px_minmax(0,1fr)_28px]";

function nightLabel(event: EventListRow, sessionId: string | null, locale: string, fallback: string): string {
  const sn = event.sessions.find((s) => s.id === sessionId) ?? null;
  return sn ? whenLabel(sn.startsAt, event.timeZone, locale, fallback, false) : fallback;
}

function OffField({ label, value, reason, quiet }: { label: string; value: string; reason: string; quiet?: boolean }) {
  return (
    <Field label={label} reason={quiet ? undefined : reason} className={quiet ? "opacity-70" : ""}>
      <select disabled className={INPUT} aria-label={label} title={reason} data-not-wired="true">
        <option>{value}</option>
      </select>
    </Field>
  );
}

export function EventVenueTab({ event, sessionId, locale }: { event: EventListRow; sessionId: string | null; locale: string }) {
  const t = useT();
  const pools = useSessionPools(sessionId);
  const figures = pools.rows ? nightFigures(pools.rows) : null;
  const noWriter = t("dashboard.events.venue.noWriterReason");
  return (
    <div className="flex flex-col gap-[14px]" data-testid="events-panel-venue">
      <PageHeading
        title={interpolate(t("dashboard.events.venue.title"), { date: nightLabel(event, sessionId, locale, t("dashboard.events.detail.noDate")) })}
        intro={t("dashboard.events.venue.intro")}
        actions={
          <>
            <ActionButton reason={noWriter}>{t("dashboard.events.venue.changeVenue")}</ActionButton>
            <ActionButton tone="primary" reason={noWriter}>
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
        <OffField label={t("dashboard.events.venue.layout")} value={t("dashboard.events.venue.layoutNone")} reason={t("dashboard.events.venue.layoutReason")} />
        <Field label={t("dashboard.events.venue.blocked")} reason={t("dashboard.events.venue.blockedReason")}>
          <input disabled className={INPUT} value={event.doorsOffsetMinutes > 0 ? interpolate(t("dashboard.events.overview.doorsBefore"), { minutes: event.doorsOffsetMinutes }) : t("dashboard.events.overview.doorsWith")} readOnly />
        </Field>
        <OffField label={t("dashboard.events.venue.dining")} value={t("dashboard.events.venue.diningNone")} reason={t("dashboard.events.venue.diningReason")} />
      </div>
      <div className={CARD}>
        <ListHead cols={COLS}>
          <span>{t("dashboard.events.tickets.colType")}</span>
          <span>{t("dashboard.events.venue.colUses")}</span>
          <span>{t("dashboard.events.venue.colCapacity")}</span>
          <span>{t("dashboard.events.tickets.colAllocation")}</span>
          <span />
        </ListHead>
        {event.tiers.length === 0 ? <p className="m-0 border-t border-admin-border-soft px-[18px] py-[20px] font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.tickets.empty")}</p> : null}
        {event.tiers.map((tier) => {
          const pool = pools.rows?.find((p) => p.poolKey === tier.poolKey) ?? null;
          return (
            <ListRow key={tier.id} cols={COLS}>
              <span className="truncate font-admin-body text-[13px] font-semibold text-admin-ink">{tier.label}</span>
              <span className="truncate text-admin-ink-muted">
                {tier.seatingMode === "space_group" ? t("dashboard.events.venue.usesTables") : interpolate(t("dashboard.events.venue.usesPool"), { pool: tier.poolKey })}
              </span>
              <span className="font-mono text-[12px] tabular-nums">{!sessionId ? "—" : pool === null ? "…" : pool.poolId === null ? t("dashboard.events.venue.noPool") : String((pool.unitsTotal ?? 0) + (pool.overbookUnits ?? 0))}</span>
              <span className="text-admin-ink-dim" title={t("dashboard.events.tickets.allocationReason")}>
                —
              </span>
              <span />
            </ListRow>
          );
        })}
      </div>
      <Note tone="warn">
        {figures && figures.capacity !== null
          ? interpolate(t("dashboard.events.venue.totalNote"), { capacity: figures.capacity, pooled: figures.pooled })
          : t("dashboard.events.venue.totalNoteNone")}
      </Note>
    </div>
  );
}

export function EventDayTab({ event, sessionId, nav, locale }: { event: EventListRow; sessionId: string | null; nav: EventsNav; locale: string }) {
  const t = useT();
  const pools = useSessionPools(sessionId);
  const noColumn = t("dashboard.events.day.noColumnReason");
  const readiness = eventDayReadiness(event, pools.rows);
  const readinessLabel = {
    published: t("dashboard.events.day.readyPublished"),
    tiers: t("dashboard.events.day.readyTiers"),
    night: t("dashboard.events.day.readyNight"),
    pools: t("dashboard.events.day.readyPools"),
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
    [t("dashboard.events.day.comps"), t("dashboard.events.day.compsValue")],
    [t("dashboard.events.day.meals"), t("dashboard.events.day.mealsValue")],
    [t("dashboard.events.day.staff"), t("dashboard.events.day.staffValue")],
  ];
  return (
    <div className="flex flex-col gap-[14px]" data-testid="events-panel-day">
      <PageHeading
        title={interpolate(t("dashboard.events.day.title"), { date: nightLabel(event, sessionId, locale, t("dashboard.events.detail.noDate")) })}
        intro={t("dashboard.events.day.intro")}
        actions={
          <>
            <ActionButton tone="primary" reason={noColumn}>
              {t("dashboard.events.day.save")}
            </ActionButton>
            <a href={`${nav.base}/pos?mode=door`} className="inline-flex h-[34px] items-center gap-[6px] rounded-[9px] border border-admin-ink bg-admin-ink px-[14px] font-admin-body text-admin-13 font-semibold text-white no-underline hover:opacity-90" data-testid="events-open-pos">
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
      <div className="grid grid-cols-2 gap-[16px]">
        <div className={`${CARD} flex flex-col gap-[12px] p-[16px]`}>
          <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.day.gate")}</div>
          <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-dim">{noColumn}</p>
          <div className="grid grid-cols-2 gap-[12px]">
            {gate.map(([label, value]) => (
              <OffField key={label} label={label} value={value} reason={noColumn} quiet />
            ))}
          </div>
        </div>
        <div className={`${CARD} flex flex-col gap-[12px] p-[16px]`}>
          <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.day.boxOffice")}</div>
          <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-dim">{noColumn}</p>
          <div className="grid grid-cols-2 gap-[12px]">
            {box.map(([label, value]) => (
              <OffField key={label} label={label} value={value} reason={noColumn} quiet />
            ))}
          </div>
        </div>
      </div>
      <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`} data-testid="events-day-readiness">
        <div className="font-admin-body text-[11px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{t("dashboard.events.day.readiness")}</div>
        <div className="grid grid-cols-4 gap-[10px]">
          {readiness.map((r) => (
            <div key={r.key} className={`rounded-[10px] px-[12px] py-[10px] font-admin-body ${r.ok ? "bg-admin-success-soft" : "bg-admin-coral-soft"}`} data-ready={r.ok ? "true" : "false"}>
              <div className={`text-[12.5px] font-semibold ${r.ok ? "text-admin-green" : "text-admin-coral-deep"}`}>{readinessLabel[r.key]}</div>
              <div className="text-[11.5px] text-admin-ink-muted">{r.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
