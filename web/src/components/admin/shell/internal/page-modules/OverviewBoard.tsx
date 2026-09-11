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
import { useRouter } from "next/navigation";

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

/** On the phone the destination chip takes the row's tone (MW02: Checking · Tonight · 2 d). */
const ROW_PILL_TONE: Record<NeedsYouRow["tone"], string> = {
  critical: "max-[720px]:bg-admin-critical-soft max-[720px]:text-admin-red",
  high: "max-[720px]:bg-admin-coral-soft max-[720px]:text-admin-coral-deep",
  normal: "max-[720px]:bg-admin-amber-soft max-[720px]:text-admin-amber",
  info: "max-[720px]:bg-admin-indigo-soft max-[720px]:text-admin-indigo",
};

const BADGE_TONE: Record<TodayBadge["tone"], string> = {
  green: "bg-admin-success-soft text-admin-green",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  slate: "bg-admin-amber-soft text-admin-amber",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  critical: "bg-admin-critical-soft text-admin-red",
};

// Size and colour are separate strings on purpose: the row action is the
// secondary button at 30px/12px, and Tailwind does not let a later class win
// over an earlier `h-[34px]` in the same string (the row buttons rendered at
// 34px for exactly that reason).
const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border font-admin-body font-semibold [transition:border-color_var(--transition-admin-micro),background_var(--transition-admin-micro)]";
const BUTTON_SIZE = "h-[34px] px-[14px] text-admin-13";
const BUTTON_SIZE_ROW = "h-[30px] px-[10px] text-[12px]";
const TONE_PRIMARY = "border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep";
const TONE_SECONDARY = "border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong";
const BUTTON_PRIMARY = `${BUTTON_BASE} ${BUTTON_SIZE} ${TONE_PRIMARY}`;
const BUTTON_SECONDARY = `${BUTTON_BASE} ${BUTTON_SIZE} ${TONE_SECONDARY}`;
const BUTTON_ROW = `${BUTTON_BASE} ${BUTTON_SIZE_ROW} ${TONE_SECONDARY}`;
const CARD = "rounded-[14px] border border-admin-border bg-admin-card";
/** MW02 draws the queue's first rows; the rest wait behind one line. */
const MOBILE_QUEUE_ROWS = 5;

export function OverviewBoard() {
  const snapshot = useOverviewSnapshot();
  const t = useT();
  const router = useRouter();
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
    // The board is one screen (Main: `overflow:hidden` on the page column):
    // the height is the viewport under the top bar, the queue scrolls inside
    // its own card, and the readiness bar stays where the board draws it.
    // `leading-[1.2]`: the boards set no line-height (the browser's
    // `normal`); the admin body's 1.65 made every row and card taller.
    <div
      data-tulala-overview-board
      className="-mb-[36px] flex h-[calc(100vh-var(--proto-cbar,50px)-56px-48px)] min-h-[560px] flex-col gap-[20px] font-admin-body leading-[1.2] max-[720px]:h-auto max-[720px]:min-h-0 max-[720px]:gap-[12px] max-[720px]:mb-0"
    >
      {/* Greeting + actions. MW02: the phone keeps the greeting and the subline; Open POS lives in the More sheet and the calendar is a tab. */}
      <div className="flex items-center justify-between gap-[16px]">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">
            {greeting}
          </h1>
          <div className="mt-[4px] text-admin-13 leading-[1.25] text-admin-ink-muted max-[720px]:text-admin-12h">{subline}</div>
        </div>
        <div className="flex items-center gap-[8px] max-[720px]:hidden">
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

      {/* Five numbers; three on the phone (MW02: Collected · Due · Arrivals). */}
      <div className="grid shrink-0 grid-cols-5 gap-[12px] max-[720px]:grid-cols-3 max-[720px]:gap-[8px]">
        <Kpi
          label={t(`${K}.kpi.collectedToday`)}
          shortLabel={t(`${K}.kpi.collectedShort`)}
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
          shortLabel={t(`${K}.kpi.balancesShort`)}
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
          desktopOnly
        />
        <Kpi
          desktopOnly
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

      {/* Queue + Today; one column on the phone, each card under its eyebrow (MW02). */}
      <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-[16px] max-[720px]:grid-cols-1 max-[720px]:gap-[12px]">
        <div className="flex min-h-0 flex-col max-[720px]:gap-[12px]">
        <div aria-hidden className="hidden text-[11px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted max-[720px]:block">
          {t(`${K}.needsYou.title`)}
        </div>
        <section className={`${CARD} flex min-h-0 flex-col overflow-hidden`} aria-labelledby="tulala-needs-you">
          <div className="flex shrink-0 items-center justify-between gap-[10px] px-[18px] pb-[6px] pt-[16px] max-[720px]:hidden">
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
            <ul className="m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0">
              {snapshot.needsYou.map((row, index) => (
                <li key={row.key} className={`flex shrink-0 items-center gap-[14px] border-t border-admin-border-soft px-[18px] py-[12px] max-[720px]:gap-[10px] max-[720px]:px-[14px] max-[720px]:first:border-t-0 ${index >= MOBILE_QUEUE_ROWS ? "max-[720px]:hidden" : ""}`}>
                  <span aria-hidden className={`h-[8px] w-[8px] shrink-0 rounded-full max-[720px]:hidden ${TONE_DOT[row.tone]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-admin-13 font-semibold text-admin-ink max-[720px]:text-[14.5px] max-[720px]:leading-[1.3]">{render(t, row.title)}</div>
                    <div className="mt-[2px] text-[12px] text-admin-ink-muted max-[720px]:text-admin-12h">{render(t, row.detail)}</div>
                    {/* The phone's row carries its action as a line, not a button. */}
                    {row.action.href ? (
                      <a href={row.action.href} className="mt-[4px] hidden text-admin-12h font-semibold text-admin-brand no-underline max-[720px]:inline-block">
                        {render(t, row.action.label)} ›
                      </a>
                    ) : (
                      <span className="mt-[4px] hidden text-admin-12h text-admin-ink-dim max-[720px]:inline-block" title={t(`${K}.needsYou.inspectOnly`)}>
                        {render(t, row.action.label)}
                      </span>
                    )}
                  </div>
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full bg-admin-surface-alt px-[8px] py-[2px] text-admin-11 font-semibold text-admin-ink ${ROW_PILL_TONE[row.tone]}`}>
                    {copy.t(DESTINATIONS[row.destination].label)}
                  </span>
                  {row.action.href ? (
                    <a href={row.action.href} className={`${BUTTON_ROW} no-underline max-[720px]:hidden`}>
                      {render(t, row.action.label)}
                    </a>
                  ) : (
                    <button type="button" disabled title={t(`${K}.needsYou.inspectOnly`)} className={`${BUTTON_ROW} cursor-not-allowed opacity-60 max-[720px]:hidden`}>
                      {render(t, row.action.label)}
                    </button>
                  )}
                </li>
              ))}
              {/* The phone shows the first rows and says how many more wait in Issues. */}
              {snapshot.needsYou.length > MOBILE_QUEUE_ROWS ? (
                <li className="hidden border-t border-admin-border-soft px-[14px] py-[12px] max-[720px]:block">
                  <button type="button" onClick={() => setPage("issues")} className="cursor-pointer border-0 bg-transparent p-0 text-admin-13 font-semibold text-admin-brand">
                    {interpolate(t(`${K}.needsYou.moreOnPhone`), { count: snapshot.needsYou.length - MOBILE_QUEUE_ROWS })} ›
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </section>
        </div>

        <div className="flex min-h-0 flex-col gap-[16px] overflow-y-auto max-[720px]:gap-[12px]">
          <TodayPanel snapshot={snapshot} />
          <div className="contents max-[720px]:hidden">
            <SetupReadiness snapshot={snapshot} onFinish={() => router.push(`${adminBasePath}/setup`)} />
          </div>
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
  desktopOnly,
  shortLabel,
}: {
  /** Not one of the phone's three numbers (MW02). */
  desktopOnly?: boolean;
  /** The phone's word for the same number (MW02: Collected · Due). */
  shortLabel?: string;
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
      className={`${CARD} min-w-0 cursor-pointer px-[16px] py-[14px] text-left hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro)] max-[720px]:rounded-[12px] max-[720px]:px-[12px] max-[720px]:py-[12px] ${desktopOnly ? "max-[720px]:hidden" : ""}`}
    >
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-admin-11h font-semibold uppercase tracking-[0.06em] text-admin-ink-muted max-[720px]:text-admin-10h">
        {shortLabel ? (
          <>
            <span className="max-[720px]:hidden">{label}</span>
            <span className="hidden max-[720px]:inline">{shortLabel}</span>
          </>
        ) : (
          label
        )}
      </div>
      {value === undefined ? (
        <div aria-hidden className="mt-[8px] h-[24px] w-[72px] animate-pulse rounded-[6px] bg-admin-surface-alt" />
      ) : (
        <div className={`mt-[6px] overflow-hidden text-ellipsis whitespace-nowrap text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums max-[720px]:mt-[2px] max-[720px]:text-[20px] ${subTone === "coral" ? "max-[720px]:text-admin-coral-deep" : "text-admin-ink"}`}>
          {value ?? "—"}
        </div>
      )}
      <div className={`mt-[3px] text-[12px] ${unreadable ? "text-admin-red" : `${subClass} max-[720px]:hidden`}`}>
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
      <div className="flex items-center justify-between gap-[10px] px-[18px] pb-[10px] pt-[16px] max-[720px]:px-[14px] max-[720px]:pt-[12px]">
        <h2 id="tulala-today" className="m-0 text-[14px]! font-semibold text-admin-ink max-[720px]:text-[11px]! max-[720px]:font-bold max-[720px]:uppercase max-[720px]:tracking-[0.08em] max-[720px]:text-admin-ink-muted">
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
            <li key={row.id} className="flex items-center gap-[12px] border-t border-admin-border-soft px-[18px] py-[10px] max-[720px]:gap-[10px] max-[720px]:px-[14px] max-[720px]:py-[12px]">
              <span className="w-[40px] shrink-0 font-mono text-[12px] text-admin-ink-muted tabular-nums max-[720px]:hidden">{row.time}</span>
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-admin-13 font-semibold text-admin-ink max-[720px]:text-[14.5px]">
                  <span className="hidden tabular-nums max-[720px]:inline">{row.time} · </span>
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
      <button type="button" onClick={onFinish} className={`${BUTTON_BASE} h-[30px] px-[14px] text-[12px] ${TONE_SECONDARY}`}>
        {t(`${K}.setup.finish`)}
      </button>
    </section>
  );
}
