"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { POS_NOTE, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { EngineFeeLines } from "@/components/payments/FeeLines";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import type { PayLinkPathPrefix } from "@/lib/payments/pay-link-url";

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
  readonly status: "open" | "paid" | "expired" | "cancelled" | "replaced" | "unknown" | "declined" | "processing" | "refunded" | "cancelledReturn";
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
  const total = formatDashboardMoneyCents(props.amountCents, props.currency || null, props.locale ?? "es");

  if (phase === "paid") {
    return (
      <Shell>
        <PaidConfirmation
          title={t("public.thread.paidTitle")}
          sellerLine={props.sellerName ? interpolate(t("public.thread.paidTo"), { seller: props.sellerName }) : null}
          lines={props.lines.map((l) => `${l.units > 1 ? `${l.units} × ` : ""}${l.label}`)}
          total={total}
          note={t(keepSlotKey)}
          receiptHref={props.receiptHref}
          receiptLabel={t("public.thread.receipt")}
          threadHref={props.threadHref}
          backLabel={t("public.thread.backToThread")}
          autoReturn={props.autoReturn === true}
          redirectingLabel={t("public.thread.redirecting")}
        />
      </Shell>
    );
  }

  if (phase === "refunded") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.refunded")}</h1>
        <p className="mt-3 text-[16px]">{total}</p>
        {props.threadHref ? (
          <a className={POS_SECONDARY_ACTION} href={props.threadHref}>
            {t("public.thread.backToThread")}
          </a>
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
        <h1 className="text-[24px] font-semibold leading-tight">{t("public.thread.cancelledReturnTitle")}</h1>
        <p className="text-[15px] text-admin-ink-muted">{t("public.thread.cancelledReturnBody")}</p>
        <p className="text-[20px] font-semibold tabular-nums">{total}</p>
        <div className="mt-4 flex flex-col gap-3">
          <a className={POS_PRIMARY_ACTION} href={`${pathPrefix}/${props.code}`}>
            {t("public.thread.tryAgain")}
          </a>
          {props.threadHref ? (
            <a className={POS_SECONDARY_ACTION} href={props.threadHref}>
              {t("public.thread.backToThread")}
            </a>
          ) : null}
        </div>
      </Shell>
    );
  }

  if (phase === "declined") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.declined")}</h1>
        <p className="mt-3">{total}</p>
      </Shell>
    );
  }

  if (phase === "expired") {
    // The conversation is where a fresh request is asked for (D-150): the
    // page hands the thread over; this view used to drop it on the floor.
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.expired")}</h1>
        {props.threadHref ? (
          <a className={POS_SECONDARY_ACTION} href={props.threadHref}>
            {t("public.thread.backToThread")}
          </a>
        ) : null}
      </Shell>
    );
  }

  if (phase === "cancelled") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">
          {props.moneyMayHaveMoved ? t("public.thread.closedMaybePaid") : t("public.thread.cancelled")}
        </h1>
      </Shell>
    );
  }

  if (phase === "replaced") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.replaced")}</h1>
      </Shell>
    );
  }

  if (phase === "unknown" && props.currencyMismatch) {
    const text = interpolate(t("public.thread.currencyMismatch"), props.currencyMismatch);
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{text}</h1>
      </Shell>
    );
  }

  if (phase === "unknown") {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold">{t("public.thread.unknown")}</h1>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-[22px] font-semibold">{t("public.thread.pay")}</h1>
      <p className="mt-2 text-[13px] text-admin-ink-muted">{t(props.slotKind === "appointment_no_time" ? "public.thread.payByNoTime" : "public.thread.payBy")}</p>
      <ol className="mt-4 space-y-2">
        {props.lines.map((line, index) => (
          <li key={`${line.label}-${index}`} className="flex justify-between text-[15px]">
            <span>
              {line.units} · {line.label}
            </span>
            <span className="tabular-nums">{formatDashboardMoneyCents(line.unitCents * line.units, props.currency || null, props.locale ?? "es")}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[20px] font-semibold tabular-nums">{total}</p>
      {props.feeLines?.length ? (
        <EngineFeeLines
          lines={props.feeLines}
          currency={props.currency}
          label={(c) => t(`public.thread.fees.${c}`)}
          nonRefundable={t("public.thread.fees.nonRefundable")}
        />
      ) : (
        <p data-refund-fees-note="" className="mt-2 text-[13px] text-admin-ink-muted">{t("public.thread.fees.nonRefundable")}</p>
      )}
      {props.holdUntil ? <p className="mt-2 text-[13px] text-admin-ink-muted">{props.holdUntil}</p> : null}
      <p className="mt-1 text-[13px] text-admin-ink-muted">{props.expiresAt}</p>
      <p className={POS_NOTE}>{t(keepSlotKey)}</p>
      <div className="mt-6 flex flex-col gap-3">
        {props.stripeUrl ? (
          <a className={POS_PRIMARY_ACTION} href={props.stripeUrl}>
            {t("public.thread.pay")}
          </a>
        ) : (
          <a
            className={POS_PRIMARY_ACTION}
            href={`${pathPrefix}/${props.code}?confirm=mock`}
            onClick={() => setPhase("processing")}
          >
            {t("public.thread.pay")}
          </a>
        )}
      </div>
    </Shell>
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
        <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-2 border-admin-ink/20 border-t-admin-ink" />
      )}
      <h1 className="text-[24px] font-semibold leading-tight">{props.title}</h1>
      <p className="text-[15px] text-admin-ink-muted">{props.timedOut ? props.timeoutBody : props.body}</p>
      <p className="text-[20px] font-semibold tabular-nums">{props.total}</p>
      {props.timedOut ? (
        <div className="mt-4 flex flex-col gap-3">
          <button type="button" className={POS_PRIMARY_ACTION} onClick={props.onCheckAgain}>
            {props.checkAgain}
          </button>
          {props.threadHref ? (
            <a className={POS_SECONDARY_ACTION} href={props.threadHref}>
              {props.backLabel}
            </a>
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
  note: string;
  receiptHref: string | null;
  receiptLabel: string;
  threadHref: string | null;
  backLabel: string;
  autoReturn: boolean;
  redirectingLabel: string;
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
      <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h1 className="text-[26px] font-semibold leading-tight">{props.title}</h1>
      {props.sellerLine ? <p className="text-[15px] text-admin-ink-muted">{props.sellerLine}</p> : null}
      <div className="mt-2 rounded-xl border border-admin-ink/10 bg-white p-4">
        {props.lines.map((line, i) => (
          <p key={`${line}-${i}`} className="text-[15px]">{line}</p>
        ))}
        <p className="mt-2 text-[22px] font-semibold tabular-nums">{props.total}</p>
      </div>
      <p className="text-[13px] text-admin-ink-muted">{props.note}</p>
      <div className="mt-3 flex flex-col gap-3">
        {props.threadHref ? (
          <a className={POS_PRIMARY_ACTION} href={props.threadHref}>
            {props.backLabel}
          </a>
        ) : null}
        {props.receiptHref ? (
          <a className={POS_SECONDARY_ACTION} href={props.receiptHref}>
            {props.receiptLabel}
          </a>
        ) : null}
      </div>
      {props.secondsLeft !== null ? (
        <p className="text-[13px] text-admin-ink-muted">{interpolate(props.redirectingLabel, { n: String(props.secondsLeft) })}</p>
      ) : null}
    </div>
  );
}

function Shell(props: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center gap-3 bg-admin-surface px-5 py-10 text-admin-ink" data-pos-messages="checkout">
      {props.children}
    </main>
  );
}
