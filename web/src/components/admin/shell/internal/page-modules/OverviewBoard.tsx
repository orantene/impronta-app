"use client";

/**
 * OverviewBoard — the workspace's Overview, as the Main board (WS005) draws
 * it: a greeting with the date and "N things need you", three actions (Open
 * POS · New appointment · Today), five numbers, the queue of what needs a
 * person sorted by consequence with a destination chip and ONE action per
 * row, the Today panel with Arrivals / Classes / Tables, and the setup
 * readiness bar.
 *
 * EVERY NUMBER IS A READER'S. The snapshot comes from `loadOverviewSnapshot`
 * through `/admin/page.tsx` (see overview-snapshot-store.ts). Nothing here
 * has a mock fallback: with no snapshot the board says it is loading; a card
 * whose reader failed says so.
 *
 * Token classes only; inline styles are frozen under components/admin/shell
 * (the one `style` is a CSS custom property for the readiness bar's width).
 */

import { useState } from "react";
import type { CSSProperties } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import { modesForPerson } from "@/lib/pos/modes";
import { DESTINATIONS } from "@/lib/workspace/destinations";
import type { NeedsYouRow, OverviewCopy, OverviewSnapshot, TodayBadge, TodayRow } from "@/lib/overview/model";
import { setupProgress } from "@/lib/overview/model";
import { useDashboardText } from "../dashboard-i18n";
import { Icon } from "../primitives";
import { meetsRole, useAdminShell } from "../state";
import { useOverviewSnapshot } from "./overview-snapshot-store";

const K = "dashboard.overviewBoard";

function greetingKey(hour: number): string {
  if (hour < 12) return "dashboard.adminOverview.greetingMorning";
  if (hour < 17) return "dashboard.adminOverview.greetingAfternoon";
  return "dashboard.adminOverview.greetingEvening";
}

const TONE_DOT: Record<NeedsYouRow["tone"], string> = {
  critical: "bg-admin-red",
  high: "bg-admin-coral",
  normal: "bg-admin-amber",
  info: "bg-admin-indigo",
};

const BADGE_TONE: Record<TodayBadge["tone"], string> = {
  green: "bg-admin-success-soft text-admin-green",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  slate: "bg-admin-amber-soft text-admin-amber",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  critical: "bg-admin-critical-soft text-admin-red",
};

const BUTTON =
  "inline-flex h-[34px] cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border px-[14px] font-admin-body text-admin-13 font-semibold [transition:border-color_var(--transition-admin-micro),background_var(--transition-admin-micro)]";
const BUTTON_PRIMARY = `${BUTTON} border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`;
const BUTTON_SECONDARY = `${BUTTON} border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`;
const BUTTON_ROW = `${BUTTON_SECONDARY} h-[30px] px-[10px] text-[12px]`;
const CARD = "rounded-[14px] border border-admin-border bg-admin-card";

export function OverviewBoard() {
  const snapshot = useOverviewSnapshot();
  const t = useT();
  const copy = useDashboardText();
  const {
    state,
    setPage,
    openDrawer,
    bridgeSessionIdentity,
    workspacePosEnabled,
    workspacePosModes,
    adminBasePath,
  } = useAdminShell();

  const firstName = (() => {
    const dn = bridgeSessionIdentity?.displayName?.trim();
    if (dn) return dn.split(/\s+/u)[0];
    const email = bridgeSessionIdentity?.email;
    if (email) return email.split("@")[0]?.split(/[.\-_]/u)[0] ?? null;
    return null;
  })();
  const now = snapshot ? new Date(snapshot.nowIso) : new Date();
  const locale = t("dashboard.adminOverview.dateLocale");
  const dateLabel = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "short",
    ...(snapshot ? { timeZone: snapshot.timeZone } : {}),
  });
  const greeting = interpolate(t(greetingKey(now.getHours())), {
    name: firstName ?? t("dashboard.adminOverview.greetingFallbackName"),
  });

  const posModes = workspacePosEnabled
    ? modesForPerson({ role: state.role, workspaceEnabledModes: workspacePosModes })
    : [];
  const canBook = meetsRole(state.role, "manager");
  const needCount = snapshot?.needsYou.length ?? 0;
  const money = snapshot?.money;
  const fmt = (cents: number) => formatMoneyCents(cents, money?.currency ?? "USD");

  const subline = snapshot
    ? [
        dateLabel,
        interpolate(t(`${K}.header.arrivalsToday`), { count: snapshot.arrivals.expected }),
        interpolate(t(needCount === 1 ? `${K}.header.needYouOne` : `${K}.header.needYouOther`), { count: needCount }),
      ].join(" · ")
    : `${dateLabel} · ${t(`${K}.loading`)}`;

  return (
    <div data-tulala-overview-board className="flex flex-col gap-[20px] font-admin-body">
      {/* Greeting + actions */}
      <div className="flex items-center justify-between gap-[16px]">
        <div>
          <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">
            {greeting}
          </h1>
          <div className="mt-[4px] text-admin-13 text-admin-ink-muted">{subline}</div>
        </div>
        <div className="flex items-center gap-[8px]">
          {posModes.length > 0 ? (
            <a href={`${adminBasePath}/pos?mode=${posModes[0]}`} className={`${BUTTON_PRIMARY} no-underline`}>
              <Icon name="credit" size={15} stroke={1.75} color="currentColor" />
              {t(`${K}.actions.openPos`)}
            </a>
          ) : (
            <button
              type="button"
              disabled
              title={t(`${K}.actions.openPosOff`)}
              className={`${BUTTON_PRIMARY} cursor-not-allowed opacity-50`}
            >
              <Icon name="credit" size={15} stroke={1.75} color="currentColor" />
              {t(`${K}.actions.openPos`)}
            </button>
          )}
          <button
            type="button"
            disabled={!canBook}
            title={canBook ? undefined : t(`${K}.actions.newAppointmentOff`)}
            onClick={() => openDrawer("new-booking")}
            className={`${BUTTON_SECONDARY} ${canBook ? "" : "cursor-not-allowed opacity-50"}`}
          >
            <Icon name="plus" size={14} stroke={1.75} color="currentColor" />
            {t(`${K}.actions.newAppointment`)}
          </button>
          <button type="button" onClick={() => setPage("calendar")} className={BUTTON_SECONDARY}>
            <Icon name="calendar" size={14} stroke={1.75} color="currentColor" />
            {t(`${K}.actions.today`)}
          </button>
        </div>
      </div>

      {/* Five numbers */}
      <div className="grid grid-cols-5 gap-[12px]">
        <Kpi
          label={t(`${K}.kpi.collectedToday`)}
          value={snapshot ? (money?.ok ? fmt(money.collectedTodayCents) : null) : undefined}
          sub={
            money?.ok
              ? interpolate(t(`${K}.kpi.collectedSplit`), { cash: fmt(money.cashCents), card: fmt(money.cardCents) })
              : undefined
          }
          unreadable={snapshot ? !money?.ok : false}
          unreadableText={t(`${K}.kpi.unreadable`)}
          onClick={() => setPage("payments")}
        />
        <Kpi
          label={t(`${K}.kpi.balancesDue`)}
          value={snapshot ? (money?.ok ? fmt(money.owedCents) : null) : undefined}
          sub={
            money?.ok
              ? interpolate(t(`${K}.kpi.balancesSub`), { count: money.owedCount, today: money.owedDueTodayCount })
              : undefined
          }
          subTone="coral"
          unreadable={snapshot ? !money?.ok : false}
          unreadableText={t(`${K}.kpi.unreadable`)}
          onClick={() => setPage("orders")}
        />
        <Kpi
          label={t(`${K}.kpi.arrivals`)}
          value={snapshot ? (snapshot.arrivals.ok ? String(snapshot.arrivals.expected) : null) : undefined}
          sub={
            snapshot?.arrivals.ok
              ? interpolate(t(`${K}.kpi.arrivalsSub`), {
                  inService: snapshot.arrivals.inService,
                  late: snapshot.arrivals.late,
                })
              : undefined
          }
          unreadable={snapshot ? !snapshot.arrivals.ok : false}
          unreadableText={t(`${K}.kpi.unreadable`)}
          onClick={() => setPage(state.visiblePages.includes("reservations") ? "reservations" : "appts")}
        />
        <Kpi
          label={t(`${K}.kpi.openOrders`)}
          value={snapshot ? (snapshot.orders.ok ? String(snapshot.orders.open) : null) : undefined}
          sub={
            snapshot?.orders.ok
              ? interpolate(t(`${K}.kpi.ordersSub`), {
                  preparing: snapshot.orders.inPreparation,
                  ready: snapshot.orders.ready,
                })
              : undefined
          }
          unreadable={snapshot ? !snapshot.orders.ok : false}
          unreadableText={t(`${K}.kpi.unreadable`)}
          onClick={() => setPage("orders")}
        />
        <Kpi
          label={t(`${K}.kpi.exceptions`)}
          value={snapshot ? String(snapshot.exceptions.total) : undefined}
          sub={
            snapshot
              ? snapshot.exceptions.unavailable.length > 0
                ? interpolate(t(`${K}.kpi.exceptionsPartial`), {
                    sources: snapshot.exceptions.unavailable.join(", "),
                  })
                : snapshot.exceptions.uncertainPayments > 0
                  ? interpolate(t(`${K}.kpi.uncertainPayments`), { count: snapshot.exceptions.uncertainPayments })
                  : t(`${K}.kpi.exceptionsNone`)
              : undefined
          }
          subTone={snapshot && snapshot.exceptions.uncertainPayments > 0 ? "critical" : undefined}
          onClick={() => setPage("issues")}
        />
      </div>

      {/* Queue + Today */}
      <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-[16px]">
        <section className={`${CARD} flex flex-col overflow-hidden`} aria-labelledby="tulala-needs-you">
          <div className="flex items-center justify-between gap-[10px] px-[18px] pb-[6px] pt-[16px]">
            <h2 id="tulala-needs-you" className="m-0 text-[14px]! font-semibold text-admin-ink">
              {t(`${K}.needsYou.title`)}
            </h2>
            <span className="text-[12px] text-admin-ink-muted">{t(`${K}.needsYou.sorted`)}</span>
          </div>
          {!snapshot ? (
            <LoadingRows count={4} />
          ) : snapshot.needsYou.length === 0 ? (
            <div className="border-t border-admin-border-soft px-[18px] py-[28px] text-admin-13 text-admin-ink-muted">
              {t(`${K}.needsYou.empty`)}
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {snapshot.needsYou.map((row) => (
                <li key={row.key} className="flex items-center gap-[14px] border-t border-admin-border-soft px-[18px] py-[12px]">
                  <span aria-hidden className={`h-[8px] w-[8px] shrink-0 rounded-full ${TONE_DOT[row.tone]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-admin-13 font-semibold text-admin-ink">{render(t, row.title)}</div>
                    <div className="mt-[2px] text-[12px] text-admin-ink-muted">{render(t, row.detail)}</div>
                  </div>
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-admin-surface-alt px-[8px] py-[2px] text-admin-11 font-semibold text-admin-ink">
                    {copy.t(DESTINATIONS[row.destination].label)}
                  </span>
                  {row.action.href ? (
                    <a href={row.action.href} className={`${BUTTON_ROW} no-underline`}>
                      {render(t, row.action.label)}
                    </a>
                  ) : (
                    <button type="button" disabled title={t(`${K}.needsYou.inspectOnly`)} className={`${BUTTON_ROW} cursor-not-allowed opacity-60`}>
                      {render(t, row.action.label)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex min-h-0 flex-col gap-[16px]">
          <TodayPanel snapshot={snapshot} />
          <SetupReadiness snapshot={snapshot} onFinish={() => setPage("settings")} />
        </div>
      </div>
    </div>
  );
}

function render(t: (key: string) => string, c: OverviewCopy): string {
  if ("text" in c) return c.text;
  return interpolate(t(c.key), c.params ?? {});
}

function Kpi({
  label,
  value,
  sub,
  subTone,
  unreadable,
  unreadableText,
  onClick,
}: {
  label: string;
  /** `undefined` = loading; `null` = the reader failed. */
  value: string | null | undefined;
  sub?: string;
  subTone?: "coral" | "critical";
  unreadable?: boolean;
  unreadableText?: string;
  onClick: () => void;
}) {
  const subClass =
    subTone === "critical" ? "text-admin-red" : subTone === "coral" ? "text-admin-coral-deep" : "text-admin-ink-dim";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CARD} cursor-pointer px-[16px] py-[14px] text-left hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro)]`}
    >
      <div className="text-admin-11h font-semibold uppercase tracking-[0.06em] text-admin-ink-muted">{label}</div>
      {value === undefined ? (
        <div aria-hidden className="mt-[8px] h-[24px] w-[72px] animate-pulse rounded-[6px] bg-admin-surface-alt" />
      ) : (
        <div className="mt-[6px] text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink tabular-nums">
          {value ?? "—"}
        </div>
      )}
      <div className={`mt-[3px] text-[12px] ${unreadable ? "text-admin-red" : subClass}`}>
        {unreadable ? unreadableText : (sub ?? " ")}
      </div>
    </button>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-[14px] border-t border-admin-border-soft px-[18px] py-[14px]">
          <span className="h-[8px] w-[8px] rounded-full bg-admin-surface-alt" />
          <div className="flex-1">
            <div className="h-[12px] w-[55%] animate-pulse rounded-[4px] bg-admin-surface-alt" />
            <div className="mt-[6px] h-[10px] w-[70%] animate-pulse rounded-[4px] bg-admin-surface-alt" />
          </div>
        </div>
      ))}
    </div>
  );
}

type TodayTab = OverviewSnapshot["today"]["tabs"][number];

function TodayPanel({ snapshot }: { snapshot: OverviewSnapshot | null }) {
  const t = useT();
  const tabs: readonly TodayTab[] = snapshot?.today.tabs ?? [];
  const [chosen, setChosen] = useState<TodayTab | null>(null);
  const tab: TodayTab | null = chosen && tabs.includes(chosen) ? chosen : (tabs[0] ?? null);
  const rows: readonly TodayRow[] = snapshot && tab ? snapshot.today[tab] : [];
  return (
    <section className={CARD} aria-labelledby="tulala-today">
      <div className="flex items-center justify-between gap-[10px] px-[18px] pb-[10px] pt-[16px]">
        <h2 id="tulala-today" className="m-0 text-[14px]! font-semibold text-admin-ink">
          {t(`${K}.today.title`)}
        </h2>
        <div role="tablist" aria-label={t(`${K}.today.title`)} className="inline-flex gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px]">
          {(["arrivals", "classes", "tables"] as const).map((key) => {
            const available = tabs.includes(key);
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!available}
                title={available ? undefined : t(`${K}.today.tabOff.${key}`)}
                onClick={() => setChosen(key)}
                className={`rounded-[7px] px-[10px] py-[5px] text-[12px] font-semibold ${
                  active
                    ? "bg-admin-card text-admin-ink shadow-admin-rest"
                    : available
                      ? "cursor-pointer bg-transparent text-admin-ink-muted hover:text-admin-ink"
                      : "cursor-not-allowed bg-transparent text-admin-ink-dim"
                }`}
              >
                {t(`${K}.today.tab.${key}`)}
              </button>
            );
          })}
        </div>
      </div>
      {!snapshot ? (
        <LoadingRows count={3} />
      ) : rows.length === 0 ? (
        <div className="border-t border-admin-border-soft px-[18px] py-[22px] text-admin-13 text-admin-ink-muted">
          {tab ? t(`${K}.today.empty.${tab}`) : t(`${K}.today.empty.none`)}
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.slice(0, 5).map((row) => (
            <li key={row.id} className="flex items-center gap-[12px] border-t border-admin-border-soft px-[18px] py-[10px]">
              <span className="w-[40px] shrink-0 font-mono text-[12px] text-admin-ink-muted tabular-nums">{row.time}</span>
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-admin-13 font-semibold text-admin-ink">
                  {row.href ? (
                    <a href={row.href} className="text-admin-ink no-underline hover:underline">
                      {row.title}
                    </a>
                  ) : (
                    row.title
                  )}
                </div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-admin-ink-muted">
                  {render(t, row.sub)}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-[4px]">
                {row.badges.map((b) => (
                  <span
                    key={b.key}
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-[8px] py-[2px] text-admin-11 font-semibold ${BADGE_TONE[b.tone]}`}
                  >
                    {interpolate(t(`${K}.today.badge.${b.key}`), { count: b.count ?? 0 })}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SetupReadiness({ snapshot, onFinish }: { snapshot: OverviewSnapshot | null; onFinish: () => void }) {
  const t = useT();
  if (!snapshot) {
    return (
      <section className={`${CARD} px-[18px] py-[14px]`}>
        <div aria-hidden className="h-[12px] w-[40%] animate-pulse rounded-[4px] bg-admin-surface-alt" />
        <div aria-hidden className="mt-[8px] h-[6px] rounded-full bg-admin-surface-alt" />
      </section>
    );
  }
  const { done, total } = setupProgress(snapshot.setup);
  const missing = snapshot.setup.filter((i) => !i.done).map((i) => t(`${K}.setup.item.${i.key}`));
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <section className={`${CARD} flex items-center gap-[12px] px-[18px] py-[14px]`} aria-label={t(`${K}.setup.title`)}>
      <div className="min-w-0 flex-1">
        <div className="text-admin-13 font-semibold text-admin-ink">
          {interpolate(t(`${K}.setup.progress`), { done, total })}
        </div>
        <div className="mt-[8px] h-[6px] overflow-hidden rounded-full bg-admin-surface-alt">
          <div
            style={{ "--tulala-setup-w": `${pct}%` } as CSSProperties}
            className="h-full w-[var(--tulala-setup-w)] bg-admin-brand [transition:width_.25s_ease]"
          />
        </div>
        <div className="mt-[6px] text-[12px] text-admin-ink-muted">
          {missing.length === 0
            ? t(`${K}.setup.complete`)
            : interpolate(t(`${K}.setup.missing`), { items: missing.join(" · ") })}
        </div>
      </div>
      <button type="button" onClick={onFinish} className={`${BUTTON_SECONDARY} h-[30px] text-[12px]`}>
        {t(`${K}.setup.finish`)}
      </button>
    </section>
  );
}
