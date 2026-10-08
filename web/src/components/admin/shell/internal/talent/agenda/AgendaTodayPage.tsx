"use client";

import Link from "next/link";
import { todayReplyState } from "@/lib/messages-v5/inbox-view";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { todayTotals } from "@/lib/talent-agenda/derive";
import { loadTalentClients } from "@/lib/talent/clients-actions";
import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { agendaMoneyRows, talentOwedSummary } from "@/lib/talent/money-home";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import {
  pinMoneyLanding,
  todayMoneyTilesFromLedger,
  type MoneyLanding,
} from "@/lib/money/today-money-tiles";
import type { WebsiteSlice, WebsiteSliceKey } from "@/lib/talent/website-eligibility";
import { websiteSliceProgressSuffix } from "@/lib/talent/website-eligibility";
import { useOpenWebsiteSlice } from "@/components/talent/website-reward/useOpenWebsiteSlice";
import { WebsiteSetupToday, WebsiteTodayHero } from "@/components/talent/website-reward/WebsiteTodayHero";
import type { TalentSelfProfile } from "../../data-bridge";
import { PageHeader } from "../shared/page-chrome-1";
import { PrimaryButton, SecondaryButton } from "../../primitives";
import { MoneyBlock, NowBox, PaymentStateChip, TALENT_AGENDA_VARS } from "./primitives";
import { AgendaPayRequest } from "./AgendaPayRequest";
import { moneyFromLedger, rebookHint, rowFromAgendaItem, todayFromAgenda } from "./present";
import { placeLabelFor } from "./record-actions";
import { serviceLabel } from "./calendar-view";
import { hasBookingHoursWindows } from "@/lib/talent-agenda/first-day";
import {
  bookedLabel,
  durationMinutes,
  greetingFor,
  resolveQualityCardMode,
  resolveTodayMode,
  todayAppointmentAction,
  todayAppointments,
  todayAttentionAction,
  upNextDay,
  type AttentionTone,
} from "@/lib/talent-agenda/today-view";
import type { BookingHours } from "@/lib/scheduling/hours-types";
import { useAgendaCopy } from "./use-agenda-copy";
import { unscheduledAgendaItems } from "@/lib/talent-agenda/load-unscheduled";
import { settleServerAction } from "@/lib/client/settle-server-action";

const SLICE_LABEL: Record<WebsiteSliceKey, string> = {
  who: "Your name and what you do",
  photos: "Photos of your work",
  offer: "Things clients can book or ask about",
  intro: "A short intro",
  when: "When you are available",
  where: "Where you work",
};

const TONE_CLASS: Record<AttentionTone, string> = {
  info: "bg-sky-50 text-sky-800",
  warn: "bg-amber-50 text-amber-800",
  brand: "bg-[rgba(59,76,202,0.08)] text-[var(--tc-accent)]",
};

const CARD = "overflow-hidden rounded-2xl border border-black/10 bg-white";
const MUTED = "text-black/55";

function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

function clockLabel(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function initialsOf(item: TalentAgendaItem): string {
  if (item.client?.initials) return item.client.initials;
  const name = item.client?.name ?? item.managedBy?.name ?? item.title;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function CardHead({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">{children}</div>;
}

function CardTitle({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  // `quiet`: a card with nothing in it keeps a light label, not a heading above one grey line.
  return quiet ? (
    <h2 className={`text-[13px] font-medium ${MUTED}`}>{children}</h2>
  ) : (
    <h2 className="text-[15px] font-semibold text-[var(--tc-primary)]">{children}</h2>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex min-h-[36px] items-center whitespace-nowrap rounded-full border border-black/15 bg-white px-3.5 text-[13px] font-medium text-[var(--tc-primary)] hover:bg-black/[0.03] disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${MUTED}`}>{children}</div>
  );
}

export type TodayMonthCollected = { cents: number; count: number; currency: string };

export type TodayEligibility = {
  percent: number | null;
  slices: readonly WebsiteSlice[];
};

export function AgendaTodayPage({
  profile,
  items = [],
  onOpenAttention,
  onOpenCalendar,
  onNewBooking,
  onSendQuote,
  primaryAction = "booking",
  onOpenRecord,
  onOpenSite,
  onOpenProfile,
  onOpenMoney,
  newLabel,
  now,
  loadError,
  hours,
  eligibility,
  bookableCount = null,
  awaitingReplyCount = null,
  sitePublished = false,
  siteUrl = null,
  monthCollected = null,
  payoutsEnabled = null,
}: {
  profile: TalentSelfProfile | null;
  items?: TalentAgendaItem[];
  onOpenAttention: () => void;
  onOpenCalendar: () => void;
  onNewBooking?: () => void;
  onSendQuote?: () => void;
  /** DS-51: which header button is filled. Booking-first unless the trade quotes first. */
  primaryAction?: "booking" | "quote";
  onOpenRecord?: (id: string) => void;
  onOpenAvailability?: () => void;
  onOpenServices?: () => void;
  onOpenSite?: () => void;
  onOpenProfile?: () => void;
  /** Open Money after pinning a landing (M3 Due by today → mc_out_today). */
  onOpenMoney?: (landing: MoneyLanding) => void;
  newLabel?: string;
  now?: Date;
  loadError?: string | null;
  hours?: BookingHours | null;
  /** Keys from bridgeTalentCompletion.missing — drives first-run steps only. */
  completionMissingKeys?: string[] | null;
  /** The ONE completion value (useWebsiteEligibility). */
  eligibility?: TodayEligibility | null;
  /** Non-archived services; null while loading. */
  bookableCount?: number | null;
  /** Client threads awaiting her reply: the inbox "Needs reply" count (countAwaitingReply). null = still reading, "unavailable" = read failed. */
  awaitingReplyCount?: number | "unavailable" | null;
  sitePublished?: boolean;
  siteUrl?: string | null;
  /** Paid this month from the earnings bridge; null when not loaded. */
  monthCollected?: TodayMonthCollected | null;
  payoutsEnabled?: boolean | null;
}) {
  const copy = useAgendaCopy();
  const locale = copy.isSpanish ? "es-MX" : "en-GB";
  const clock = now ?? new Date();
  const [attentionLimit, setAttentionLimit] = useState(3);
  const [ideaDismissed, setIdeaDismissed] = useState(false);
  const [payFor, setPayFor] = useState<TalentAgendaItem | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const apply = () => setAttentionLimit(media.matches ? 2 : 3);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const ledgerTiles = useMemo(() => todayMoneyTilesFromLedger(), []);
  const ledgerItems = useMemo(() => {
    if (!onOpenMoney) return [];
    return moneyFromLedger({
      tiles: ledgerTiles,
      isSpanish: copy.isSpanish,
      onOpen: (landing) => {
        pinMoneyLanding(landing);
        onOpenMoney(landing);
      },
    });
  }, [copy.isSpanish, ledgerTiles, onOpenMoney]);

  const derived = todayFromAgenda(items, clock);
  const attention = derived.attention.filter((item) => !item.unscheduled);
  const replyState = todayReplyState(awaitingReplyCount);
  const awaitingReply = replyState === "waiting" && typeof awaitingReplyCount === "number" ? awaitingReplyCount : 0;
  const noTime = unscheduledAgendaItems(items);
  const appointments = todayAppointments(items, clock).filter((item) => !item.unscheduled);
  const upNext = (() => {
    const next = upNextDay(items, clock);
    if (!next) return null;
    const filtered = next.items.filter((item) => !item.unscheduled);
    return filtered.length ? { ...next, items: filtered } : null;
  })();
  const totals = todayTotals(
    items,
    clock,
    `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, "0")}-${String(clock.getDate()).padStart(2, "0")}`,
  );
  // F69: same source as /talent/money. The client ledger (agency_bookings
  // balances) plus the agenda's balances, via the one shared summary.
  const [ledgerClients, setLedgerClients] = useState<TalentClientRow[] | null>(null);
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    void settleServerAction(() => loadTalentClients(profileId), { label: "loadTalentClients", area: "talent-today" })
      .then((res) => {
        if (!cancelled) setLedgerClients(res.ok ? res.items : []);
      })
      .catch(() => {
        if (!cancelled) setLedgerClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);
  const owed = talentOwedSummary({
    clients: ledgerClients,
    agendaOwed: agendaMoneyRows(items, clock).owed,
    currency: monthCollected?.currency ?? null,
  });
  const idea = ideaDismissed ? null : rebookHint(items, clock);

  const firstName = profile?.displayName?.split(" ")[0] ?? "";
  const city = profile?.homeCity ?? "";
  const greeting = copy.t(greetingFor(clock));
  const title = firstName ? `${greeting}, ${firstName}` : copy.t("Today");
  const longDate = clock.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const shortDate = clock.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const subtitle = [longDate.charAt(0).toUpperCase() + longDate.slice(1), city].filter(Boolean).join(" · ");

  // Stop waiting for the offerings count after a few seconds so a failed load
  // still resolves to the regular Today instead of a permanent loading state.
  const [factsSettled, setFactsSettled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setFactsSettled(true), 6000);
    return () => window.clearTimeout(id);
  }, []);
  const mode = resolveTodayMode({
    agendaItemCount: items.length,
    settled: factsSettled,
    bookableCount,
    // A published directory profile is also not a new talent.
    sitePublished: sitePublished || profile?.workflowStatus === "published",
  });
  const percent = eligibility?.percent ?? null;
  const qualityMode = resolveQualityCardMode({ percent, sitePublished });
  const requiredSlices = (eligibility?.slices ?? []).filter((s) => s.required);
  const openSlice = useOpenWebsiteSlice();
  const leftCount = requiredSlices.filter((s) => s.done === false).length;
  const siteHost = siteUrl ? siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;

  const open = (id: string) => (onOpenRecord ? () => onOpenRecord(id) : undefined);

  // F23 / F34: ONE website card on Today, driven by the same state as the
  // pill and My presence (useWebsiteFlow). It replaced the Maison resume card,
  // which read setup_choices and named a palette the talent never picked.
  const resumeCard = profile ? <WebsiteTodayHero canBook={hasBookingHoursWindows(hours)} /> : null;

  if (loadError) {
    return (
      <div style={TALENT_AGENDA_VARS} className="space-y-4">
        <PageHeader title={title} subtitle={subtitle} />
        {resumeCard}
        <NowBox
          tone="danger"
          title={copy.t("Could not load your agenda")}
          body={loadError}
          primaryAction={{
            label: copy.t("Refresh"),
            onClick: () => {
              if (typeof window !== "undefined") window.location.reload();
            },
          }}
        />
      </div>
    );
  }

  if (mode === "loading") {
    // Facts still in flight: a neutral header, no greeting and no body, so a
    // new account never flashes the established Today before "Welcome".
    return (
      <div style={TALENT_AGENDA_VARS} className="space-y-4" aria-busy="true">
        <PageHeader title={copy.t("Today")} subtitle={subtitle} />
        <div className="h-28 animate-pulse rounded-2xl bg-black/[0.05]" />
        <div className="h-44 animate-pulse rounded-2xl bg-black/[0.05]" />
      </div>
    );
  }

  if (mode === "first_run") {
    // tc_new / tc_new_saved / tc_new_ready: one number (the website checklist)
    // and one next step, same state as the pill (F34).
    return (
      <div style={TALENT_AGENDA_VARS} className="space-y-4">
        <PageHeader
          title={firstName ? `${copy.t("Welcome")}, ${firstName}` : copy.t("Today")}
          subtitle={subtitle}
          actions={
            <SecondaryButton onClick={onNewBooking ?? onOpenCalendar}>
              {newLabel ?? copy.t("New booking")}
            </SecondaryButton>
          }
        />
        <WebsiteSetupToday canBook={hasBookingHoursWindows(hours)} />
      </div>
    );
  }

  const attentionTitle = (item: TalentAgendaItem): string => {
    const who = copy.t(item.client?.name ?? item.managedBy?.name ?? item.title);
    if (item.managedBy && (item.kind === "request" || item.booking === "requested")) {
      return `${copy.t(item.managedBy.name)} ${copy.t("invited you to a job")}`;
    }
    if (item.kind === "request" || item.booking === "requested") return `${who} ${copy.t("is waiting")}`;
    if (item.kind === "hold" || item.booking === "hold") return `${who} · ${copy.t("deposit not paid")}`;
    if (item.payment === "overdue") return `${who} · ${copy.t("balance overdue")}`;
    return who;
  };
  const attentionSub = (item: TalentAgendaItem): string => {
    const when = new Date(item.startsAt);
    const day = Number.isNaN(when.getTime())
      ? ""
      : when.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
    const parts = [
      [day, item.allDay ? "" : clockLabel(item.startsAt, locale)].filter(Boolean).join(" "),
      item.title,
      item.money.totalCents > 0 ? formatMoney(item.money.totalCents, item.money.currency, locale) : "",
    ];
    return parts.filter(Boolean).join(" · ");
  };

  const apptRow = (item: TalentAgendaItem, withAction: boolean) => {
    const mins = durationMinutes(item);
    const action = withAction ? todayAppointmentAction(item, clock) : null;
    const actionLabel = !action
      ? null
      : action.kind === "check_in"
        ? copy.t("Check in")
        : action.kind === "collect"
          ? `${copy.t("Collect")} ${formatMoney(action.cents ?? 0, item.money.currency, locale)}`
          : action.kind === "payment_link"
            ? copy.t("Send a payment link")
            : copy.t("Request deposit");
    // Deposit and link requests open the composer in place; the rest open the record.
    const onAction =
      action && (action.kind === "request_deposit" || action.kind === "payment_link")
        ? () => setPayFor(item)
        : open(item.id);
    const pay = rowFromAgendaItem(item, clock).paymentState;
    return (
      <div key={item.id} className="flex gap-3.5 border-t border-black/10 px-4 py-3">
        <button
          type="button"
          onClick={open(item.id)}
          className="flex min-w-0 flex-1 gap-3.5 text-left"
        >
          <div className="w-[62px] shrink-0 tabular-nums">
            <div className="text-[14.5px] font-bold text-[var(--tc-primary)]">
              {item.allDay ? copy.t("All day") : clockLabel(item.startsAt, locale)}
            </div>
            {mins ? <div className={`text-[11.5px] ${MUTED}`}>{mins} {copy.t("min")}</div> : null}
          </div>
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-black/[0.06] text-[12px] font-semibold text-[var(--tc-primary)]">
            {initialsOf(item)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-[var(--tc-primary)]">
              {copy.t(item.client?.name ?? item.managedBy?.name ?? item.title)}
            </div>
            <div className="truncate text-[12.5px] text-black/70">{serviceLabel(item) ?? copy.t("No service set")}</div>
            {placeLabelFor(item.where) ? (
              <div className={`mt-0.5 text-[11.5px] ${MUTED}`}>{placeLabelFor(item.where)}</div>
            ) : null}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {pay ? <PaymentStateChip state={pay} /> : null}
          {actionLabel ? <ActionButton label={actionLabel} onClick={onAction} /> : null}
        </div>
      </div>
    );
  };

  const currency = monthCollected?.currency ?? owed.currency ?? null;
  const monthName = clock.toLocaleDateString(locale, { month: "long" });
  const moneyCard =
    ledgerItems.length > 0 ? (
      <MoneyBlock items={ledgerItems} />
    ) : (
      <section className={CARD}>
        <CardHead>
          <CardTitle>{copy.t("Money")}</CardTitle>
          <span className={`text-[11.5px] ${MUTED}`}>
            {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
            {currency ? ` · ${currency.toUpperCase()}` : ""}
          </span>
        </CardHead>
        <div className="flex border-b border-t border-black/10">
          <button
            type="button"
            onClick={onOpenMoney ? () => onOpenMoney({ tab: "payments" }) : undefined}
            className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left"
          >
            <Label>{copy.t("Collected")}</Label>
            <div className="text-[22px] font-semibold tabular-nums text-[var(--tc-primary)]">
              {monthCollected ? formatMoney(monthCollected.cents, monthCollected.currency, locale) : "·"}
            </div>
            <div className={`text-[11.5px] ${MUTED}`}>
              {!monthCollected
                ? copy.t("Not available")
                : monthCollected.count > 0
                  ? `${monthCollected.count} ${copy.t("payments")}`
                  : copy.t("No payments yet this month")}
            </div>
          </button>
          <button
            type="button"
            onClick={
              onOpenMoney ? () => onOpenMoney({ tab: "outstanding", outFilt: "today" }) : undefined
            }
            className="flex min-w-0 flex-1 flex-col gap-0.5 border-l border-black/10 px-4 py-3 text-left"
          >
            <Label>{copy.t("Owed to you")}</Label>
            <div
              className={`text-[22px] font-semibold tabular-nums ${owed.cents > 0 ? "text-amber-700" : "text-[var(--tc-primary)]"}`}
            >
              {owed.currency ? formatMoney(owed.cents, owed.currency, locale) : formatMoney(0, currency ?? "USD", locale)}
            </div>
            <div className={`text-[11.5px] ${MUTED}`}>
              {owed.count > 0 ? `${owed.count} ${copy.t("balances")}` : copy.t("Nothing owed")}
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenMoney ? () => onOpenMoney({ tab: "payouts" }) : undefined}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-[var(--tc-primary)]">{copy.t("Next payout")}</div>
            <div className={`text-[11.5px] ${MUTED}`}>
              {payoutsEnabled === false ? copy.t("Payouts not set up") : copy.t("See payouts")}
            </div>
          </div>
        </button>
      </section>
    );

  let qualityCard: ReactNode = null;
  if (qualityMode === "live") {
    qualityCard = (
      <section className={`${CARD} p-4`}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--tc-ok)]" aria-hidden />
          <span className="text-[13.5px] font-semibold text-[var(--tc-ok)]">{copy.t("Your website is live")}</span>
        </div>
        {siteHost ? (
          <div className="mt-1.5 break-all text-[17px] font-semibold text-[var(--tc-primary)]">{siteHost}</div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {siteUrl ? (
            <a
              href={siteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[36px] items-center rounded-full bg-[var(--tc-action)] hover:bg-[var(--tc-action-hover)] px-3.5 text-[13px] font-medium text-white"
            >
              {copy.t("View website")}
            </a>
          ) : null}
          {onOpenSite ? <ActionButton label={copy.t("Edit site")} onClick={onOpenSite} /> : null}
        </div>
      </section>
    );
  } else if (qualityMode === "ready") {
    // Rendered by WebsiteTodayHero at the top (same state as the pill).
    qualityCard = null;
  } else if (qualityMode === "checklist" && percent != null) {
    qualityCard = (
      <section className={`${CARD} p-4`} data-testid="today-profile-quality">
        <div className="flex items-baseline gap-2">
          <div className="text-[30px] font-semibold tabular-nums tracking-tight text-[var(--tc-primary)]">{percent}%</div>
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold text-[var(--tc-primary)]">{copy.t("Profile quality")}</div>
            <div className={`text-[12px] ${MUTED}`}>
              {leftCount}{" "}
              {copy.t(leftCount === 1 ? "thing left before your free website" : "things left before your free website")}
            </div>
          </div>
        </div>
        <progress
          value={percent}
          max={100}
          aria-label={copy.t("Profile quality")}
          className="my-3 block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-black/[0.07] [&::-moz-progress-bar]:bg-[var(--tc-accent)] [&::-webkit-progress-bar]:bg-black/[0.07] [&::-webkit-progress-value]:bg-[var(--tc-accent)]"
        />
        <ul className="flex flex-col gap-1.5">
          {requiredSlices.map((slice) => (
            <li key={slice.key} className="flex items-start gap-2 text-[13px]">
              <span
                className={`mt-px grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] text-[10px] text-white ${slice.done ? "border-[var(--tc-accent)] bg-[var(--tc-accent)]" : "border-black/20"}`}
                aria-hidden
              >
                {slice.done ? "✓" : ""}
              </span>
              {slice.done === false ? (
                <button
                  type="button"
                  data-testid={`agenda-website-slice-${slice.key}`}
                  onClick={() => openSlice(slice.key)}
                  className="text-left text-[var(--tc-primary)] underline decoration-black/20 underline-offset-2"
                >
                  {copy.t(SLICE_LABEL[slice.key])}{websiteSliceProgressSuffix(slice)}
                </button>
              ) : (
                <span className={slice.done ? `${MUTED} line-through` : "text-[var(--tc-primary)]"}>
                  {copy.t(SLICE_LABEL[slice.key])}
                </span>
              )}
            </li>
          ))}
        </ul>
        {leftCount > 0 && (onOpenProfile || onOpenSite) ? (
          <div className="mt-3">
            <ActionButton
              label={`${copy.t("Finish these")} ${leftCount}`}
              onClick={onOpenProfile ?? onOpenSite}
            />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-4">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {primaryAction === "quote" ? (
              <SecondaryButton onClick={onNewBooking ?? onOpenCalendar}>
                {newLabel ?? copy.t("New booking")}
              </SecondaryButton>
            ) : (
              <PrimaryButton onClick={onNewBooking ?? onOpenCalendar}>
                + {newLabel ?? copy.t("New booking")}
              </PrimaryButton>
            )}
            {onSendQuote ? (
              primaryAction === "quote" ? (
                <PrimaryButton onClick={onSendQuote}>+ {copy.t("Send quote")}</PrimaryButton>
              ) : (
                <SecondaryButton onClick={onSendQuote}>{copy.t("Send quote")}</SecondaryButton>
              )
            ) : null}
          </div>
        }
      />

      {resumeCard}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_352px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className={CARD} data-testid="today-attention">
            <CardHead>
              <CardTitle quiet={attention.length === 0 && replyState === "none"}>{copy.t("Needs attention")}</CardTitle>
              {attention.length === 0 && replyState === "none" ? (
                <span className={`text-[13px] ${MUTED}`}>{copy.t("You are clear for now.")}</span>
              ) : null}
              {attention.length + (awaitingReply > 0 ? 1 : 0) > 0 ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800">
                  {attention.length + (awaitingReply > 0 ? 1 : 0)}
                </span>
              ) : null}
              <span className="flex-1" />
              {attention.length > attentionLimit ? (
                <button
                  type="button"
                  onClick={onOpenAttention}
                  className="min-h-[36px] px-1 text-[12.5px] font-medium text-[var(--tc-accent)]"
                >
                  {copy.t("View all")} {attention.length}
                </button>
              ) : null}
            </CardHead>
            {awaitingReply > 0 ? (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-black/10 px-4 py-3"
                data-testid="today-attention-awaiting-reply"
              >
                <Link
                  href="/talent/inbox?filter=needs-reply"
                  className="min-w-[min(100%,14rem)] flex-1 basis-[14rem] text-left"
                >
                  <div className="text-[14px] font-semibold text-[var(--tc-primary)]">
                    {awaitingReply === 1
                      ? copy.t("1 client waiting for a reply")
                      : copy.t("{n} clients waiting for a reply").replace("{n}", String(awaitingReply))}
                  </div>
                  <div className="mt-px text-[12.5px] text-black/70">{copy.t("Open Messages")}</div>
                </Link>
                <Link
                  href="/talent/inbox?filter=needs-reply"
                  className="inline-flex min-h-[36px] items-center whitespace-nowrap rounded-full border border-black/15 bg-white px-3.5 text-[13px] font-medium text-[var(--tc-primary)] hover:bg-black/[0.03]"
                >
                  {copy.t("Reply")}
                </Link>
              </div>
            ) : null}
            {attention.length === 0 && replyState === "checking" ? (
              <div className={`border-t border-black/10 px-4 py-3 text-[13px] ${MUTED}`} data-testid="today-attention-checking">
                {copy.t("Checking your messages")}
              </div>
            ) : null}
            {replyState === "unavailable" ? (
              <div className={`border-t border-black/10 px-4 py-3 text-[13px] ${MUTED}`} data-testid="today-attention-reply-unavailable">
                {copy.t("Could not check your messages.")}{" "}
                <Link href="/talent/inbox" className="font-semibold text-[var(--tc-accent)]">
                  {copy.t("Open Messages")}
                </Link>
              </div>
            ) : null}
            {attention.slice(0, attentionLimit).map((item, index) => {
                const act = todayAttentionAction(item);
                return (
                  <div key={item.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-black/10 px-4 py-3">
                    <span
                      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-[13px] font-bold ${TONE_CLASS[act.tone]}`}
                    >
                      {index + 1}
                    </span>
                    <button type="button" onClick={open(item.id)} className="min-w-[min(100%,14rem)] flex-1 basis-[14rem] text-left">
                      <div className="text-[14px] font-semibold text-[var(--tc-primary)]">{attentionTitle(item)}</div>
                      <div className="mt-px text-[12.5px] text-black/70">{attentionSub(item)}</div>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-[1100px]:basis-full max-[1100px]:justify-start max-[1100px]:pl-[42px]">
                      <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONE_CLASS[act.tone]}`}>
                        {act.tone === "brand" ? act.chip : copy.t(act.chip)}
                      </span>
                      <ActionButton label={copy.t(act.label)} onClick={open(item.id)} />
                    </div>
                  </div>
                );
              })}
          </section>

          {noTime.length > 0 ? (
            <section className={CARD} data-testid="today-no-time">
              <CardHead>
                <CardTitle>{copy.t("No time")}</CardTitle>
                <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[12px] font-semibold text-[var(--tc-primary)]">
                  {noTime.length}
                </span>
              </CardHead>
              {noTime.map((item) => {
                const who = copy.t(item.client?.name ?? item.title);
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-black/10 px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={open(item.id)}
                      className="min-w-[min(100%,14rem)] flex-1 basis-[14rem] text-left"
                    >
                      <div className="text-[14px] font-semibold text-[var(--tc-primary)]">{who}</div>
                      <div className="mt-px text-[12.5px] text-black/70">
                        {[item.title !== who ? item.title : "", copy.t("No time assigned")]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </button>
                    <ActionButton label={copy.t("Set a time")} onClick={open(item.id)} />
                  </div>
                );
              })}
            </section>
          ) : null}

          <section className={CARD} data-testid="today-agenda">
            <CardHead>
              <CardTitle quiet={appointments.length === 0}>
                {copy.t("Today")} · {shortDate}
              </CardTitle>
              <span className={`text-[12px] ${MUTED}`}>
                {appointments.length === 0
                  ? copy.t("No appointments today.")
                  : `${appointments.length} ${copy.t(appointments.length === 1 ? "appointment" : "appointments")} · ${bookedLabel(totals.bookedMinutes)} ${copy.t("booked")}`}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={onOpenCalendar}
                className="min-h-[36px] px-1 text-[12.5px] font-medium text-[var(--tc-accent)]"
              >
                {copy.t("Open calendar")}
              </button>
            </CardHead>
            {appointments.length > 0 ? appointments.map((item) => apptRow(item, true)) : null}
          </section>

          <section className={CARD} data-testid="today-up-next">
            <CardHead>
              <CardTitle quiet={!upNext}>{copy.t("Up next")}</CardTitle>
              {upNext ? (
                <span className={`text-[12px] ${MUTED}`}>
                  {upNext.day.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
                </span>
              ) : (
                <span className={`text-[13px] ${MUTED}`}>{copy.t("Nothing booked after today yet.")}</span>
              )}
            </CardHead>
            {upNext ? upNext.items.map((item) => apptRow(item, false)) : null}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {moneyCard}
          {qualityCard}
          {idea ? (
            <section className="flex flex-col gap-2 rounded-2xl bg-black/[0.03] px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <Label>{copy.t("One idea")}</Label>
                <button
                  type="button"
                  onClick={() => setIdeaDismissed(true)}
                  className="min-h-[32px] text-[12.5px] text-[var(--tc-accent)]"
                >
                  {copy.t("Dismiss")}
                </button>
              </div>
              <p className="text-[13.5px] leading-snug text-[var(--tc-primary)]">
                {idea.clientName} ({idea.lastService}) {copy.t("is due for a rebook. Send a booking link.")}
              </p>
              {onNewBooking ? (
                <div>
                  <ActionButton label={copy.t("Rebook")} onClick={onNewBooking} />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {payFor ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-white/95 p-4">
          <AgendaPayRequest orderId={payFor.orderId} onClose={() => setPayFor(null)} />
        </div>
      ) : null}
    </div>
  );
}
