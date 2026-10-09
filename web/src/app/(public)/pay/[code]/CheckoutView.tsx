"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { interpolate } from "@/i18n/interpolate";
import { translatorFor, useT } from "@/i18n/use-t";
import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import type { PayLinkPathPrefix } from "@/lib/payments/pay-link-url";
import { payMoney } from "@/lib/payments/pay-page-format";

import {
  Action,
  AmountBlock,
  ExpiryRow,
  INK,
  MUTED,
  PolicyLine,
  Shell,
  StatusHeader,
  SummaryCard,
  TrustRow,
  type SummaryRow,
} from "./PayParts";

/**
 * The pay page, every state (TUL-467): ready, confirming, paid, taking longer,
 * cancelled-back-from-Stripe, expired, already paid, replaced, refunded, error. It wears
 * the seller's site tokens only (see PayParts) and carries one primary action per state.
 * Copy lives under `public.payPage` (a DRAFT until the owner approves the deck).
 */

export type CheckoutCalendarLinks = {
  readonly icsHref: string;
  readonly googleHref: string;
};

export type CheckoutStatus =
  | "open"
  | "paid"
  | "expired"
  | "cancelled"
  | "replaced"
  | "unknown"
  | "startFailed"
  | "declined"
  | "processing"
  | "refunded"
  | "cancelledReturn";

export type CheckoutViewProps = {
  readonly code: string;
  /** Presentation path; defaults to branded `/pay`. */
  readonly pathPrefix?: PayLinkPathPrefix;
  /** What the kept time is: drives the "time is held" line. */
  readonly slotKind?: "appointment" | "appointment_no_time" | "pickup" | null;
  /** Closed page only: a session completed or money settled, so never say "nothing was taken". */
  readonly moneyMayHaveMoved?: boolean;
  readonly amountCents: number;
  readonly currency: string;
  /** "Válido hasta las 9:24 pm", as parts (talent's zone); null = say nothing about validity. */
  readonly expiry?: { readonly time: string; readonly day: string | null } | null;
  readonly status: CheckoutStatus;
  readonly lines: readonly { label: string; units: number; unitCents: number }[];
  readonly stripeUrl: string | null;
  readonly threadHref: string | null;
  readonly receiptHref: string | null;
  /** Engine client fee lines; [] / absent = no breakdown. */
  readonly feeLines?: readonly FeeLine[];
  /** The business the client pays ("Pagado a ..."). */
  readonly sellerName?: string | null;
  readonly logoUrl?: string | null;
  /** UI locale for money and copy ("es" | "en" | "fr"). */
  readonly locale?: string;
  /** The link came from a conversation: the paid page sends the client back to it. */
  readonly autoReturn?: boolean;
  /** Paid link opened again later (not the return from Stripe). */
  readonly alreadyPaid?: boolean;
  /** Dated booking: .ics download + Google Calendar (paid confirmation only). */
  readonly calendar?: CheckoutCalendarLinks | null;
  /** "Sáb 10 oct · 5:00 pm (CST)" and the place, when the booking has them. */
  readonly whenLabel?: string | null;
  readonly whereLabel?: string | null;
  /** "≈ US$55" under a non-USD amount. */
  readonly usdLine?: string | null;
  /** Deposit link: what remains for the day of the appointment. */
  readonly depositBalanceCents?: number | null;
  /** The talent's own cancellation text; absent = the default line. */
  readonly policyText?: string | null;
  /** The newer link when this one was replaced. */
  readonly newLinkHref?: string | null;
  /** Partly refunded: how much came back. */
  readonly refundedCents?: number | null;
  /** The site home on the seller's host: the way out when there is no conversation. */
  readonly siteHref?: string;
  /** The link's currency differs from its order's: say so plainly instead of "status unknown". */
  readonly currencyMismatch?: { readonly linkCurrency: string; readonly orderCurrency: string };
};

type T = (key: string) => string;

/** Runtime bits the stateful wrappers feed the pure view. */
export type PayRuntime = {
  readonly timedOut?: boolean;
  readonly onCheckAgain?: () => void;
  readonly secondsLeft?: number | null;
};

export function CheckoutView(props: CheckoutViewProps) {
  const dashboardT = useT();
  const t: T = props.locale ? translatorFor(props.locale) : dashboardT;
  const [phase, setPhase] = useState<CheckoutStatus>(props.status);
  // The server re-renders with a new status once the webhook settles; follow it.
  useEffect(() => setPhase(props.status), [props.status]);
  const view = (runtime: PayRuntime) => (
    <PayStateView {...props} status={phase} t={t} runtime={runtime} onPayNavigate={() => setPhase("processing")} />
  );
  if (phase === "processing") return <ProcessingRuntime>{view}</ProcessingRuntime>;
  if (phase === "paid" && props.autoReturn && props.threadHref) {
    return <PaidRuntime threadHref={props.threadHref}>{view}</PaidRuntime>;
  }
  return view({});
}

const POLL_MS = 2500;
const POLL_MAX_MS = 45_000;
const RETURN_AFTER_S = 8;

/** Stripe sent the client back before the webhook settled: re-read until it has, then say so. */
function ProcessingRuntime(props: { children: (rt: PayRuntime) => ReactNode }) {
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
  return <>{props.children({ timedOut, onCheckAgain: () => setTimedOut(false) })}</>;
}

/** The paid page, then back to the conversation it came from. */
function PaidRuntime(props: { threadHref: string; children: (rt: PayRuntime) => ReactNode }) {
  const [left, setLeft] = useState(RETURN_AFTER_S);
  useEffect(() => {
    if (left <= 0) {
      window.location.assign(props.threadHref);
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left, props.threadHref]);
  return <>{props.children({ secondsLeft: Math.max(left, 0) })}</>;
}

const FEE_LABEL_KEY: Partial<Record<FeeLine["code"], string>> = {
  service_subtotal: "public.thread.fees.service_subtotal",
  base_reservation_fee: "public.thread.fees.base_reservation_fee",
  platform_fee: "public.thread.fees.platform_fee",
  processing_fee: "public.thread.fees.processing_fee",
  total_charged: "public.thread.fees.total_charged",
};

function chargedOf(props: CheckoutViewProps): number {
  return props.feeLines?.find((l) => l.code === "total_charged")?.cents ?? props.amountCents;
}

/** The place the client goes when there is no conversation: the seller's site. */
function SiteAction(props: CheckoutViewProps & { t: T; kind: "primary" | "secondary" | "link" }) {
  const label = props.sellerName
    ? interpolate(props.t("public.payPage.goToSite"), { business: props.sellerName })
    : props.t("public.payPage.goToSiteFallback");
  return (
    <Action kind={props.kind} href={props.siteHref ?? "/"}>
      {label}
    </Action>
  );
}

/** "Volver a la conversación" when a thread exists, else "Ir al sitio de <negocio>". */
function WayBack(props: CheckoutViewProps & { t: T; kind: "primary" | "secondary" | "link" }) {
  return props.threadHref ? (
    <Action kind={props.kind} href={props.threadHref}>
      {props.t("public.thread.backToThread")}
    </Action>
  ) : (
    <SiteAction {...props} />
  );
}

function summaryRows(props: CheckoutViewProps): SummaryRow[] {
  const rows: SummaryRow[] = [];
  if (props.whenLabel) rows.push({ key: "when", icon: "calendar", label: "", value: props.whenLabel });
  if (props.whereLabel) rows.push({ key: "where", icon: "pin", label: "", value: props.whereLabel });
  return rows;
}

function feeRows(props: CheckoutViewProps & { t: T }, money: (cents: number) => string): SummaryRow[] {
  // The client's lines only: seller-side codes (talent_quote, workspace_margin...) never print here.
  const rows: SummaryRow[] = [];
  for (const l of props.feeLines ?? []) {
    const key = FEE_LABEL_KEY[l.code];
    if (key) rows.push({ key: l.code, label: props.t(key), value: money(l.cents), strong: l.code === "total_charged" });
  }
  return rows;
}

export function PayStateView(props: CheckoutViewProps & { t: T; runtime?: PayRuntime; onPayNavigate?: () => void }) {
  const { t } = props;
  const locale = props.locale ?? "es";
  const money = (cents: number) => payMoney(cents, props.currency || null, locale);
  const charged = money(chargedOf(props));
  const business = props.sellerName ?? null;
  const frame = (children: ReactNode) => (
    <Shell business={business} logoUrl={props.logoUrl}>
      {children}
    </Shell>
  );
  const stack = (children: ReactNode) => <div className="mt-2 flex flex-col gap-2">{children}</div>;

  switch (props.status) {
    case "paid": {
      const alreadyPaid = props.alreadyPaid === true;
      const secondsLeft = props.runtime?.secondsLeft ?? null;
      return frame(
        <>
          <StatusHeader
            icon="check"
            tone="success"
            dataReturn="paid"
            title={t(alreadyPaid ? "public.payPage.alreadyPaidTitle" : "public.payPage.paidTitle")}
            body={
              alreadyPaid
                ? t("public.payPage.alreadyPaidBody")
                : business
                  ? interpolate(t("public.payPage.paidTo"), { business })
                  : null
            }
          />
          <SummaryCard
            items={props.lines.map((l) => ({ label: `${l.units > 1 ? `${l.units} × ` : ""}${l.label}`, price: money(l.unitCents * l.units) }))}
            fees={feeRows(props, money)}
            rows={summaryRows(props)}
          />
          <p className="m-0 text-[20px] font-semibold tabular-nums" style={{ color: INK }} data-pay-charged="">
            {interpolate(t("public.payPage.charged"), { amount: charged })}
          </p>
          {stack(
            <>
              <WayBack {...props} kind="primary" />
              {props.receiptHref ? (
                <Action kind="secondary" href={props.receiptHref}>
                  {t("public.payPage.viewReceipt")}
                </Action>
              ) : null}
              {props.calendar ? (
                <>
                  <Action kind="secondary" href={props.calendar.icsHref} download="booking.ics" data-pay-calendar="ics">
                    {t("public.payPage.addToCalendar")}
                  </Action>
                  <Action kind="secondary" href={props.calendar.googleHref} external data-pay-calendar="google">
                    {t("public.payPage.googleCalendar")}
                  </Action>
                </>
              ) : null}
            </>,
          )}
          {secondsLeft !== null ? (
            <p className="m-0 text-[13px]" style={{ color: MUTED }}>
              {interpolate(t("public.payPage.returning"), { n: String(secondsLeft) })}
            </p>
          ) : null}
        </>,
      );
    }

    case "processing": {
      const slow = props.runtime?.timedOut === true;
      return frame(
        <>
          <StatusHeader
            icon="clock"
            spinner={!slow}
            dataReturn="processing"
            title={t(slow ? "public.payPage.slowTitle" : "public.payPage.processingTitle")}
            body={t(slow ? "public.payPage.slowBody" : "public.payPage.processingBody")}
          />
          <p className="m-0 text-[22px] font-semibold tabular-nums" style={{ color: INK }}>
            {charged}
          </p>
          {slow
            ? stack(
                <>
                  <Action kind="primary" onClick={props.runtime?.onCheckAgain}>
                    {t("public.payPage.checkAgain")}
                  </Action>
                  <WayBack {...props} kind="link" />
                </>,
              )
            : null}
        </>,
      );
    }

    case "cancelledReturn":
      return frame(
        <>
          <StatusHeader icon="undo" tone="neutral" title={t("public.payPage.cancelledTitle")} body={t("public.payPage.cancelledBody")} />
          <p className="m-0 text-[22px] font-semibold tabular-nums" style={{ color: INK }}>
            {charged}
          </p>
          {stack(
            <>
              <Action kind="primary" href={`${props.pathPrefix ?? "/pay"}/${props.code}`}>
                {t("public.payPage.tryAgain")}
              </Action>
              <WayBack {...props} kind="link" />
            </>,
          )}
        </>,
      );

    case "expired":
      return frame(
        <>
          <StatusHeader
            icon="clock"
            tone="neutral"
            title={t("public.payPage.expiredTitle")}
            body={business ? interpolate(t("public.payPage.expiredBody"), { business }) : t("public.payPage.expiredBodyGeneric")}
          />
          {stack(
            props.threadHref ? (
              <Action kind="primary" href={props.threadHref}>
                {t("public.payPage.askNewLink")}
              </Action>
            ) : (
              <SiteAction {...props} kind="primary" />
            ),
          )}
        </>,
      );

    case "replaced":
      return frame(
        <>
          <StatusHeader
            icon="link"
            tone="neutral"
            title={t("public.payPage.replacedTitle")}
            body={business ? interpolate(t("public.payPage.replacedBody"), { business }) : t("public.payPage.replacedBodyUnknown")}
          />
          {stack(
            props.newLinkHref ? (
              <>
                <Action kind="primary" href={props.newLinkHref}>
                  {t("public.payPage.viewNewLink")}
                </Action>
                <WayBack {...props} kind="link" />
              </>
            ) : (
              <WayBack {...props} kind="primary" />
            ),
          )}
        </>,
      );

    case "refunded": {
      const partial = props.refundedCents != null && props.refundedCents > 0 && props.refundedCents < chargedOf(props);
      const back = props.refundedCents != null && props.refundedCents > 0 ? props.refundedCents : chargedOf(props);
      return frame(
        <>
          <StatusHeader
            icon="undo"
            tone="neutral"
            title={t(partial ? "public.payPage.refundedPartialTitle" : "public.payPage.refundedTitle")}
            body={interpolate(t("public.payPage.refundedBody"), { amount: money(back) })}
          />
          {stack(
            <>
              <WayBack {...props} kind="primary" />
              {props.receiptHref ? (
                <Action kind="secondary" href={props.receiptHref}>
                  {t("public.payPage.viewReceipt")}
                </Action>
              ) : null}
            </>,
          )}
        </>,
      );
    }

    case "startFailed":
      return frame(
        <>
          <StatusHeader icon="alert" tone="neutral" title={t("public.payPage.errorTitle")} body={t("public.payPage.errorBody")} />
          {stack(
            <>
              <Action kind="primary" href={`${props.pathPrefix ?? "/pay"}/${props.code}`}>
                {t("public.payPage.tryAgain")}
              </Action>
              {props.threadHref ? (
                <Action kind="secondary" href={props.threadHref}>
                  {business ? interpolate(t("public.payPage.contactBusiness"), { business }) : t("public.thread.backToThread")}
                </Action>
              ) : (
                <SiteAction {...props} kind="secondary" />
              )}
            </>,
          )}
        </>,
      );

    case "declined":
      return frame(
        <>
          <StatusHeader icon="alert" tone="neutral" title={t("public.payPage.declinedTitle")} body={t("public.payPage.declinedBody")} />
          {stack(
            <>
              <Action kind="primary" href={`${props.pathPrefix ?? "/pay"}/${props.code}`}>
                {t("public.payPage.tryAgain")}
              </Action>
              <WayBack {...props} kind="link" />
            </>,
          )}
        </>,
      );

    case "cancelled":
      return frame(
        <>
          <StatusHeader
            icon="alert"
            tone="neutral"
            title={t("public.payPage.closedTitle")}
            body={t(props.moneyMayHaveMoved ? "public.payPage.closedMaybePaid" : "public.payPage.closedBody")}
          />
          {stack(<WayBack {...props} kind="primary" />)}
        </>,
      );

    case "unknown": {
      if (props.currencyMismatch) {
        return frame(
          <>
            <StatusHeader
              icon="alert"
              tone="neutral"
              title={t("public.payPage.errorTitle")}
              body={interpolate(t("public.thread.currencyMismatch"), props.currencyMismatch)}
            />
            {stack(<WayBack {...props} kind="primary" />)}
          </>,
        );
      }
      return frame(
        <>
          <StatusHeader icon="alert" tone="neutral" title={t("public.payPage.unknownTitle")} body={t("public.payPage.unknownBody")} />
          {stack(<WayBack {...props} kind="primary" />)}
        </>,
      );
    }

    default:
      return frame(<ReadyToPay {...props} money={money} charged={charged} />);
  }
}

/** State A: who, what, when, where, how much, how long, the policy, one button. */
function ReadyToPay(props: CheckoutViewProps & { t: T; money: (cents: number) => string; charged: string; onPayNavigate?: () => void }) {
  const { t } = props;
  const business = props.sellerName ?? null;
  const expiryText = props.expiry
    ? props.expiry.day
      ? interpolate(t("public.payPage.validUntilDay"), { day: props.expiry.day, time: props.expiry.time })
      : interpolate(t("public.payPage.validUntil"), { time: props.expiry.time })
    : null;
  const deposit =
    props.depositBalanceCents && props.depositBalanceCents > 0
      ? interpolate(t("public.payPage.depositNote"), { balance: props.money(props.depositBalanceCents) })
      : null;
  const holdsTime = props.slotKind === "appointment" || props.slotKind === "pickup";
  const payHref = props.stripeUrl ?? `${props.pathPrefix ?? "/pay"}/${props.code}?confirm=mock`;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[15px] font-medium" style={{ color: MUTED }}>
          {business ? interpolate(t("public.payPage.payTo"), { business }) : t("public.thread.pay")}
        </h1>
        <AmountBlock
          amount={props.charged}
          usdLine={props.usdLine}
          approxHint={interpolate(t("public.payPage.approxHint"), { currency: (props.currency || "").toUpperCase() })}
          note={deposit}
        />
      </div>
      <SummaryCard
        items={props.lines.map((l) => ({ label: `${l.units > 1 ? `${l.units} × ` : ""}${l.label}`, price: props.money(l.unitCents * l.units) }))}
        fees={feeRows(props, props.money)}
        rows={summaryRows(props)}
      />
      {expiryText ? <ExpiryRow text={expiryText} hint={holdsTime ? t("public.payPage.keepSlotNote") : null} /> : null}
      <PolicyLine
        line={props.policyText ? props.policyText.split(/(?<=[.!?])\s/)[0] : t("public.payPage.policyDefault")}
        link={t("public.payPage.policyLink")}
        title={t("public.payPage.policyTitle")}
        body={props.policyText ?? t("public.payPage.policyDefault")}
        refunds={`${t("public.payPage.policyRefunds")} ${t("public.thread.fees.nonRefundable")}`}
      />
      <div className="flex flex-col gap-2">
        <Action kind="primary" href={payHref} onNavigate={props.stripeUrl ? undefined : props.onPayNavigate}>
          {interpolate(t("public.payPage.payCta"), { amount: props.charged })}
        </Action>
        <TrustRow label={t("public.payPage.trust")} />
        <WayBack {...props} kind="link" />
      </div>
    </>
  );
}
