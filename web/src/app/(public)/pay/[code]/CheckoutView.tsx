"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { EngineFeeLines } from "@/components/payments/FeeLines";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import type { PayLinkPathPrefix } from "@/lib/payments/pay-link-url";

/**
 * TOKENS ONLY (TUL-437). This page sits on the seller's own site: `--token-color-*`,
 * `--site-radius-*` and `--site-heading-font` are her palette and type, projected by
 * the public layout (the ticket page does the same). An `admin-*` class here paints
 * the dashboard's look on a noir or editorial site; a static test pins their absence.
 */

export type CheckoutCalendarLinks = {
  readonly icsHref: string;
  readonly googleHref: string;
};

export type CheckoutViewProps = {
  readonly code: string;
  /** Presentation path; defaults to branded `/pay`. */
  readonly pathPrefix?: PayLinkPathPrefix;
  /** What the kept time is: drives the "kept while valid" wording. */
  readonly slotKind?: "appointment" | "appointment_no_time" | "pickup" | null;
  /** Closed page only: a session completed or money settled, so never say "nothing was taken". */
  readonly moneyMayHaveMoved?: boolean;
  readonly amountCents: number;
  readonly currency: string;
  readonly expiresAt: string;
  readonly status: "open" | "paid" | "expired" | "cancelled" | "replaced" | "unknown" | "startFailed" | "declined" | "processing" | "refunded" | "cancelledReturn";
  readonly lines: readonly { label: string; units: number; unitCents: number }[];
  readonly holdUntil: string | null;
  readonly stripeUrl: string | null;
  readonly threadHref: string | null;
  readonly receiptHref: string | null;
  /** Engine client fee lines (open state only); [] / absent = no breakdown. */
  readonly feeLines?: readonly FeeLine[];
  /** Seller shown on the confirmation ("Pagado a ..."). */
  readonly sellerName?: string | null;
  /** UI locale for money formatting ("es" | "en"). */
  readonly locale?: string;
  /** The link came from a conversation: the paid page sends the client back to it. */
  readonly autoReturn?: boolean;
  /** Dated booking: .ics download + Google Calendar (paid confirmation only). */
  readonly calendar?: CheckoutCalendarLinks | null;
  /** The link's currency differs from its order's: say so plainly instead of "status unknown". */
  readonly currencyMismatch?: { readonly linkCurrency: string; readonly orderCurrency: string };
};

export function CheckoutView(props: CheckoutViewProps) {
  const t = useT();
  const [phase, setPhase] = useState<CheckoutViewProps["status"]>(props.status);
  // The server re-renders with a new status once the webhook settles; follow it.
  useEffect(() => setPhase(props.status), [props.status]);
  const pathPrefix = props.pathPrefix ?? "/pay";
  const keepSlotKey =
    props.slotKind === "appointment"
      ? "public.thread.keepSlotAppointment"
      : props.slotKind === "appointment_no_time"
        ? "public.thread.keepSlotNoTime"
        : props.slotKind === "pickup"
        ? "public.thread.keepSlot"
        : "public.thread.keepSlotGeneric";
  // What the card is / was CHARGED: the service price plus the service fee when there is one.
  const chargedCents = props.feeLines?.find((l) => l.code === "total_charged")?.cents ?? props.amountCents;
  const feeCents = props.feeLines?.find((l) => l.code === "platform_fee")?.cents ?? 0;
  const total = formatDashboardMoneyCents(chargedCents, props.currency || null, props.locale ?? "es");
  const feeNote =
    feeCents > 0
      ? interpolate(t("public.thread.fees.includedNote"), {
          fee: formatDashboardMoneyCents(feeCents, props.currency || null, props.locale ?? "es"),
        })
      : null;

  if (phase === "paid") {
    return (
      <Shell>
        <PaidConfirmation
          title={t("public.thread.paidTitle")}
          sellerLine={props.sellerName ? interpolate(t("public.thread.paidTo"), { seller: props.sellerName }) : null}
          lines={props.lines.map((l) => `${l.units > 1 ? `${l.units} × ` : ""}${l.label}`)}
          total={total}
          feeNote={feeNote}
          note={t(keepSlotKey)}
          receiptHref={props.receiptHref}
          receiptLabel={t("public.thread.receipt")}
          threadHref={props.threadHref}
          backLabel={t("public.thread.backToThread")}
          autoReturn={props.autoReturn === true}
          redirectingLabel={t("public.thread.redirecting")}
          calendar={props.calendar ?? null}
          addToCalendarLabel={t("public.thread.addToCalendar")}
          googleCalendarLabel={t("public.thread.googleCalendar")}
        />
      </Shell>
    );
  }

  if (phase === "refunded") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {t("public.thread.refunded")}
        </h1>
        <p className="mt-3 text-[16px]" style={{ color: INK }}>
          {total}
        </p>
        {props.threadHref ? (
          <Action kind="secondary" href={props.threadHref}>
            {t("public.thread.backToThread")}
          </Action>
        ) : null}
      </Shell>
    );
  }

  if (phase === "processing") {
    return (
      <Shell>
        <ProcessingConfirmation
          title={t("public.thread.processingTitle")}
          body={t("public.thread.processingBody")}
          timeoutBody={t("public.thread.processingTimeout")}
          checkAgain={t("public.thread.checkAgain")}
          total={total}
          threadHref={props.threadHref}
          backLabel={t("public.thread.backToThread")}
        />
      </Shell>
    );
  }

  if (phase === "cancelledReturn") {
    return (
      <Shell>
        <h1 className="text-[24px] font-semibold leading-tight" style={titleStyle}>
          {t("public.thread.cancelledReturnTitle")}
        </h1>
        <p className="text-[15px]" style={{ color: MUTED }}>
          {t("public.thread.cancelledReturnBody")}
        </p>
        <p className="text-[20px] font-semibold tabular-nums" style={{ color: INK }}>
          {total}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Action kind="primary" href={`${pathPrefix}/${props.code}`}>
            {t("public.thread.tryAgain")}
          </Action>
          {props.threadHref ? (
            <Action kind="secondary" href={props.threadHref}>
              {t("public.thread.backToThread")}
            </Action>
          ) : null}
        </div>
      </Shell>
    );
  }

  if (phase === "declined") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {t("public.thread.declined")}
        </h1>
        <p className="mt-3" style={{ color: INK }}>
          {total}
        </p>
      </Shell>
    );
  }

  if (phase === "expired") {
    // The conversation is where a fresh request is asked for (D-150): the
    // page hands the thread over; this view used to drop it on the floor.
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {t("public.thread.expired")}
        </h1>
        {props.threadHref ? (
          <Action kind="secondary" href={props.threadHref}>
            {t("public.thread.backToThread")}
          </Action>
        ) : null}
      </Shell>
    );
  }

  if (phase === "cancelled") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {props.moneyMayHaveMoved ? t("public.thread.closedMaybePaid") : t("public.thread.cancelled")}
        </h1>
      </Shell>
    );
  }

  if (phase === "replaced") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {t("public.thread.replaced")}
        </h1>
      </Shell>
    );
  }

  if (phase === "unknown" && props.currencyMismatch) {
    const text = interpolate(t("public.thread.currencyMismatch"), props.currencyMismatch);
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {text}
        </h1>
      </Shell>
    );
  }

  if (phase === "startFailed") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {t("public.thread.startFailedTitle")}
        </h1>
        <p className="text-[15px]" style={{ color: MUTED }}>
          {t("public.thread.startFailedBody")}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Action kind="primary" href={`${pathPrefix}/${props.code}`}>
            {t("public.thread.startFailedRetry")}
          </Action>
          {props.threadHref ? (
            <Action kind="secondary" href={props.threadHref}>
              {t("public.thread.backToThread")}
            </Action>
          ) : null}
        </div>
      </Shell>
    );
  }

  if (phase === "unknown") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold" style={titleStyle}>
          {t("public.thread.unknown")}
        </h1>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-[22px] font-semibold" style={titleStyle}>
        {t("public.thread.pay")}
      </h1>
      <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
        {t(props.slotKind === "appointment_no_time" ? "public.thread.payByNoTime" : "public.thread.payBy")}
      </p>
      <ol className="mt-4 space-y-2">
        {props.lines.map((line, index) => (
          <li key={`${line.label}-${index}`} className="flex justify-between text-[15px]" style={{ color: INK }}>
            <span>
              {line.units} · {line.label}
            </span>
            <span className="tabular-nums">
              {formatDashboardMoneyCents(line.unitCents * line.units, props.currency || null, props.locale ?? "es")}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[20px] font-semibold tabular-nums" style={{ color: INK }}>
        {total}
      </p>
      {props.feeLines?.length ? (
        <EngineFeeLines
          lines={props.feeLines}
          currency={props.currency}
          label={(c) => t(`public.thread.fees.${c}`)}
          nonRefundable={t("public.thread.fees.nonRefundable")}
        />
      ) : (
        <p data-refund-fees-note="" className="mt-2 text-[13px]" style={{ color: MUTED }}>
          {t("public.thread.fees.nonRefundable")}
        </p>
      )}
      {props.holdUntil ? (
        <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
          {props.holdUntil}
        </p>
      ) : null}
      <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
        {props.expiresAt}
      </p>
      <p className="text-[13px]" style={{ color: MUTED }}>
        {t(keepSlotKey)}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {props.stripeUrl ? (
          <Action kind="primary" href={props.stripeUrl}>
            {t("public.thread.pay")}
          </Action>
        ) : (
          <Action kind="primary" href={`${pathPrefix}/${props.code}?confirm=mock`} onNavigate={() => setPhase("processing")}>
            {t("public.thread.pay")}
          </Action>
        )}
      </div>
    </Shell>
  );
}

const INK = "var(--token-color-ink, #1a1a1a)";
const MUTED = "var(--token-color-muted, #6b6b6b)";
const LINE = "var(--token-color-line, #e5e5e5)";
const RAISED = "var(--token-color-surface-raised, #ffffff)";
const SURFACE = "var(--token-color-background, var(--token-color-surface, #fafafa))";
const PRIMARY = "var(--token-color-primary, #1a1a1a)";
const PRIMARY_ON = "var(--token-color-primary-on, #ffffff)";
const RADIUS = "var(--site-radius-base, 0.75rem)";
const RADIUS_LG = "var(--site-radius-lg, 1rem)";
const HEADING = "var(--site-heading-font, inherit)";

const actionBase: CSSProperties = {
  display: "inline-flex",
  minHeight: 48,
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: RADIUS,
  padding: "0 16px",
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};
const primaryStyle: CSSProperties = {
  ...actionBase,
  background: PRIMARY,
  color: PRIMARY_ON,
  border: `1px solid ${PRIMARY}`,
};
const secondaryStyle: CSSProperties = {
  ...actionBase,
  background: "transparent",
  color: INK,
  border: `1px solid ${LINE}`,
};
const titleStyle: CSSProperties = { fontFamily: HEADING, color: INK };

function Action(props: {
  kind: "primary" | "secondary";
  href?: string;
  download?: string;
  external?: boolean;
  onClick?: () => void;
  onNavigate?: () => void;
  "data-pay-calendar"?: "ics" | "google";
  children: ReactNode;
}) {
  const style = props.kind === "primary" ? primaryStyle : secondaryStyle;
  if (props.href) {
    return (
      <a
        style={style}
        href={props.href}
        download={props.download}
        onClick={props.onNavigate}
        data-pay-calendar={props["data-pay-calendar"]}
        {...(props.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {props.children}
      </a>
    );
  }
  return (
    <button type="button" style={style} onClick={props.onClick} data-pay-calendar={props["data-pay-calendar"]}>
      {props.children}
    </button>
  );
}

const POLL_MS = 2500;
const POLL_MAX_MS = 45_000;
const RETURN_AFTER_S = 8;

type ProcessingCopy = {
  title: string;
  body: string;
  timeoutBody: string;
  checkAgain: string;
  total: string;
  threadHref: string | null;
  backLabel: string;
};

/** Stripe sent the client back before the webhook settled: re-read until it has, then say so. */
function ProcessingConfirmation(props: ProcessingCopy) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (timedOut) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started >= POLL_MAX_MS) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router, timedOut]);
  return <ProcessingView {...props} timedOut={timedOut} onCheckAgain={() => setTimedOut(false)} />;
}

export function ProcessingView(props: ProcessingCopy & { timedOut: boolean; onCheckAgain: () => void }) {
  return (
    <div role="status" aria-live="polite" data-pay-return="processing" className="flex flex-col gap-3">
      {props.timedOut ? null : (
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: LINE, borderTopColor: INK }}
        />
      )}
      <h1 className="text-[24px] font-semibold leading-tight" style={titleStyle}>
        {props.title}
      </h1>
      <p className="text-[15px]" style={{ color: MUTED }}>
        {props.timedOut ? props.timeoutBody : props.body}
      </p>
      <p className="text-[20px] font-semibold tabular-nums" style={{ color: INK }}>
        {props.total}
      </p>
      {props.timedOut ? (
        <div className="mt-4 flex flex-col gap-3">
          <Action kind="primary" onClick={props.onCheckAgain}>
            {props.checkAgain}
          </Action>
          {props.threadHref ? (
            <Action kind="secondary" href={props.threadHref}>
              {props.backLabel}
            </Action>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type PaidCopy = {
  title: string;
  sellerLine: string | null;
  lines: string[];
  total: string;
  /** "Includes $15 service fee." when the charge is price + fee. */
  feeNote?: string | null;
  note: string;
  receiptHref: string | null;
  receiptLabel: string;
  threadHref: string | null;
  backLabel: string;
  autoReturn: boolean;
  redirectingLabel: string;
  calendar: CheckoutCalendarLinks | null;
  addToCalendarLabel: string;
  googleCalendarLabel: string;
};

/** The paid page: a clear confirmation, then back to the conversation it came from. */
function PaidConfirmation(props: PaidCopy) {
  const [left, setLeft] = useState(RETURN_AFTER_S);
  const returning = props.autoReturn && Boolean(props.threadHref);
  useEffect(() => {
    if (!returning || !props.threadHref) return;
    if (left <= 0) {
      window.location.assign(props.threadHref);
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left, returning, props.threadHref]);
  return <PaidView {...props} secondsLeft={returning ? Math.max(left, 0) : null} />;
}

export function PaidView(props: PaidCopy & { secondsLeft: number | null }) {
  return (
    <div role="status" aria-live="polite" data-pay-return="paid" className="flex flex-col gap-3">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: PRIMARY, color: PRIMARY_ON }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h1 className="text-[26px] font-semibold leading-tight" style={titleStyle}>
        {props.title}
      </h1>
      {props.sellerLine ? (
        <p className="text-[15px]" style={{ color: MUTED }}>
          {props.sellerLine}
        </p>
      ) : null}
      <div
        className="mt-2 p-4"
        style={{ borderRadius: RADIUS_LG, border: `1px solid ${LINE}`, background: RAISED, color: INK }}
      >
        {props.lines.map((line, i) => (
          <p key={`${line}-${i}`} className="text-[15px]">
            {line}
          </p>
        ))}
        <p className="mt-2 text-[22px] font-semibold tabular-nums">{props.total}</p>
        {props.feeNote ? (
          <p data-pay-fee-note="" className="text-[13px]" style={{ color: MUTED }}>
            {props.feeNote}
          </p>
        ) : null}
      </div>
      <p className="text-[13px]" style={{ color: MUTED }}>
        {props.note}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {props.threadHref ? (
          <Action kind="primary" href={props.threadHref}>
            {props.backLabel}
          </Action>
        ) : null}
        {props.receiptHref ? (
          <Action kind="secondary" href={props.receiptHref}>
            {props.receiptLabel}
          </Action>
        ) : null}
        {props.calendar ? (
          <>
            <Action kind="secondary" href={props.calendar.icsHref} download="booking.ics" data-pay-calendar="ics">
              {props.addToCalendarLabel}
            </Action>
            <Action kind="secondary" href={props.calendar.googleHref} external data-pay-calendar="google">
              {props.googleCalendarLabel}
            </Action>
          </>
        ) : null}
      </div>
      {props.secondsLeft !== null ? (
        <p className="text-[13px]" style={{ color: MUTED }}>
          {interpolate(props.redirectingLabel, { n: String(props.secondsLeft) })}
        </p>
      ) : null}
    </div>
  );
}

function Shell(props: { children: ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center gap-3 px-5 py-10"
      style={{ background: SURFACE, color: INK }}
      data-pos-messages="checkout"
      data-pay-theme="tokens"
    >
      {props.children}
    </main>
  );
}
