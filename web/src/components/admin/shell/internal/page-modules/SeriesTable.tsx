"use client";

/**
 * SeriesTable — the Series tab of Appointments & Classes, as board W40 draws
 * it: SERIES · CADENCE · ROOM · INSTRUCTOR · CAPACITY · GENERATED THROUGH ·
 * STATE with a row menu, then the two explainer cards ("What a series
 * holds", "Course vs drop-in") with the "Used in" line.
 *
 * Every row is a `session_series` row through `loadSchedule`; "generated
 * through" is the last dated session the nightly sweep produced and how
 * many, or the sweep's own refusal when it produced none. The row menu opens
 * the series' sessions on the Sessions tab, which is the one thing this
 * page can do with a series: no series editor or on-demand generator exists
 * (D-POS-18), and the board's W10 "Generate sessions" view is not built.
 */

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { Icon } from "../primitives";
import type { SeriesRow, SeriesRowState } from "./appointments-classes-model";
import { CARD, FactRow, StatePill, UsedIn, type PillTone } from "./appointments-classes-ui";

const K = "dashboard.adminAppointments.board.series";
const ISO_WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const STATE_TONE: Record<SeriesRowState, PillTone> = {
  published: "green",
  paused: "slate",
  needsAttention: "coral",
};

const ROW_GRID = "grid grid-cols-[1.5fr_1.2fr_110px_120px_120px_1.2fr_130px_24px] items-center gap-[10px] px-[16px] *:min-w-0";

function cadence(row: SeriesRow, t: (k: string) => string): string {
  const days = row.weekdays
    .map((d) => ISO_WEEKDAY_KEYS[d - 1])
    .filter((k): k is (typeof ISO_WEEKDAY_KEYS)[number] => k !== undefined)
    .map((k) => t(`dashboard.adminSessions.weekday.${k}`))
    .join(" · ");
  const minutes = t("dashboard.adminSessions.minutes").replace("{n}", String(row.durationMinutes));
  return [days, row.localTime, minutes].filter(Boolean).join(" · ");
}

export function SeriesTable({
  rows,
  posOn,
  onShowSessions,
}: {
  rows: readonly SeriesRow[];
  posOn: boolean;
  onShowSessions: (seriesId: string) => void;
}) {
  const t = useT();
  const locale = useDashboardLocale();

  const generated = (row: SeriesRow) => {
    if (row.refusalReason) return t(`dashboard.adminSessions.refusals.reason.${row.refusalReason}`);
    if (row.generatedThrough === null) return t("dashboard.adminSessions.noOccurrences");
    // "30 Nov", the board's order, whatever the locale's default order is.
    const parts = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      ...(row.timeZone ? { timeZone: row.timeZone } : {}),
    }).formatToParts(new Date(row.generatedThrough));
    const part = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
    const day = `${part("day")} ${part("month").replace(/\.$/, "")}`;
    const count = interpolate(t(row.sessionCount === 1 ? `${K}.sessionsOne` : `${K}.sessionsOther`), { count: row.sessionCount });
    const skipped = row.collisions > 0 ? ` · ${interpolate(t(`${K}.skipped`), { count: row.collisions })}` : "";
    return `${day} · ${count}${skipped}`;
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <div className={`${CARD} overflow-hidden`} data-testid="series-table">
        <div className={`${ROW_GRID} py-[8px] font-admin-body text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted`}>
          <span>{t(`${K}.col.series`)}</span>
          <span>{t(`${K}.col.cadence`)}</span>
          <span>{t(`${K}.col.room`)}</span>
          <span>{t(`${K}.col.instructor`)}</span>
          <span>{t(`${K}.col.capacity`)}</span>
          <span>{t(`${K}.col.generated`)}</span>
          <span>{t(`${K}.col.state`)}</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <div className="border-t border-admin-border-soft px-[16px] py-[28px] font-admin-body text-admin-13 text-admin-ink-muted">
            {t("dashboard.adminSessions.empty.body")}
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} data-series-row={row.id} className={`${ROW_GRID} border-t border-admin-border-soft py-[10px] font-admin-body text-admin-12h`}>
              <span className="font-semibold text-admin-ink">{row.title}</span>
              <span className="text-admin-ink-muted">{cadence(row, t)}</span>
              <span className="truncate text-admin-ink-muted">{row.room ?? "—"}</span>
              <span className="text-admin-ink-muted">—</span>
              <span className="tabular-nums text-admin-ink">{row.seats}</span>
              <span className="line-clamp-2 text-admin-ink-muted" title={generated(row)}>{generated(row)}</span>
              <StatePill tone={STATE_TONE[row.state]} state={row.state} className="justify-start">
                {t(`${K}.state.${row.state}`)}
              </StatePill>
              <button
                type="button"
                aria-label={t(`${K}.showSessions`)}
                title={t(`${K}.showSessions`)}
                className="inline-flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
                onClick={() => onShowSessions(row.id)}
              >
                <Icon name="ellipsis" size={13} stroke={1.75} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-2 gap-[14px]">
        <div className={`${CARD} px-[16px] py-[14px]`}>
          <div className="mb-[8px] font-admin-body text-admin-13 font-semibold text-admin-ink">{t(`${K}.holds.title`)}</div>
          <FactRow label={t(`${K}.holds.definition`)}>{t(`${K}.holds.definitionValue`)}</FactRow>
          <FactRow label={t(`${K}.holds.cadence`)}>{t(`${K}.holds.cadenceValue`)}</FactRow>
          <FactRow label={t(`${K}.holds.capacity`)}>{t(`${K}.holds.capacityValue`)}</FactRow>
          <FactRow label={t(`${K}.holds.people`)}>{t(`${K}.holds.peopleValue`)}</FactRow>
          <FactRow label={t(`${K}.holds.windows`)}>{t(`${K}.holds.windowsValue`)}</FactRow>
          <FactRow label={t(`${K}.holds.generate`)}>{t(`${K}.holds.generateValue`)}</FactRow>
        </div>
        <div className={`${CARD} px-[16px] py-[14px]`}>
          <div className="mb-[8px] font-admin-body text-admin-13 font-semibold text-admin-ink">{t(`${K}.kinds.title`)}</div>
          <FactRow label={t(`${K}.kinds.course`)}>{t(`${K}.kinds.courseValue`)}</FactRow>
          <FactRow label={t(`${K}.kinds.dropIn`)}>{t(`${K}.kinds.dropInValue`)}</FactRow>
          <FactRow label={t(`${K}.kinds.three`)}>{t(`${K}.kinds.threeValue`)}</FactRow>
          <div className="mt-[8px]">
            <UsedIn
              count={posOn ? 2 : 1}
              label={t("dashboard.adminAppointments.board.usedIn")}
              parts={[
                { where: t("dashboard.adminAppointments.board.usedPos"), what: posOn ? t("dashboard.adminAppointments.board.usedPosOn") : t("dashboard.adminAppointments.board.usedPosOff") },
                { where: t("dashboard.adminAppointments.board.usedWeb"), what: t("dashboard.adminAppointments.board.usedWebWhat") },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
