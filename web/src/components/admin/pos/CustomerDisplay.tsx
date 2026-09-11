"use client";

/**
 * CustomerDisplay — the customer-facing second screen (design boards D01 to
 * D08), as pure presentation. Every figure is a prop the route's reader
 * resolved; every tap is a callback. It draws the eight screens and nothing
 * else: which one shows is decided by `lib/pos/display-model.ts` from the
 * order's real status, and the local steps (confirm, receipt contact, sent)
 * by `display-client.tsx`.
 *
 * WRITTEN FOR THE OTHER SIDE OF THE COUNTER. The person reading this is a
 * customer standing at a till, not staff: no rail, no workspace chrome, one
 * sentence per screen, one action, type large enough to read from a step
 * away. Money renders through `formatOrderMoney`, the one money formatter,
 * never a hand-built string. Token classes only; every primary action is at
 * least 56px tall (`h-14`).
 *
 * WHAT IS NOT OFFERED SAYS SO. Tips (D02, D03) need a line kind the engine
 * does not have, and text receipts need a sender that does not exist; both
 * render as a sentence rather than as a control that would do nothing.
 * D-POS-11 and D-POS-12 in `docs/plans/program/pos/decisions.md`.
 */

import type { ReactNode } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { DisplayState } from "@/lib/pos/display-model";
import { cn } from "@/lib/utils";

import type { CustomerDisplayCopy } from "./customer-display-copy";
import { POS_INPUT, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";

/**
 * INK, NOT `foreground`. On a workspace route the tenant override maps
 * `--foreground` to the NEUTRAL token (#737373, see the note above
 * `.site-hero__headline` in `globals.css`), which turns `text-foreground`
 * muddy grey on every tenant host. The counter's own components carry that
 * defect today; a screen a customer reads from a step away cannot. The
 * admin ink tokens are pinned (`styles/admin-color-bridge.css`), so this
 * display reads black on off-white wherever it is opened.
 */
const PRIMARY = cn(POS_PRIMARY_ACTION, "w-full bg-admin-ink text-admin-surface");
const SECONDARY = cn(POS_SECONDARY_ACTION, "w-full border-admin-border bg-admin-surface text-admin-ink");

export type CustomerDisplayLine = {
  readonly label: string;
  readonly units: number;
  readonly totalCents: number;
};

export type CustomerDisplaySale = {
  readonly currency: string;
  readonly lines: readonly CustomerDisplayLine[];
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly depositPaidCents: number;
  readonly outstandingCents: number;
  readonly customerName: string | null;
  /** How the paid sale was paid, when the money row says. */
  readonly paidVia: "cash" | "card" | null;
};

/**
 * The screen to draw. The engine states come from `displayStateFor`; the
 * three local ones are steps the customer takes on this screen alone.
 */
export type CustomerDisplayScreen = DisplayState | "confirm" | "contact" | "sent";

export type CustomerDisplayReceiptOutcome =
  | { kind: "sent"; email: string }
  | { kind: "skipped"; email: string }
  | { kind: "refused"; sentence: string };

export type CustomerDisplayProps = {
  readonly screen: CustomerDisplayScreen;
  readonly workspaceName: string;
  readonly sale: CustomerDisplaySale | null;
  readonly copy: CustomerDisplayCopy;
  /** Set while the poll cannot reach the server; rendered as one line. */
  readonly connectionLost: boolean;
  /** D02 → D04. */
  readonly onLooksRight: () => void;
  /** D04 → D02. */
  readonly onBack: () => void;
  /** D07 → D08. */
  readonly onEmailMe: () => void;
  /** D07 or D08 → clear. */
  readonly onNoReceipt: () => void;
  readonly email: string;
  readonly onEmailChange: (value: string) => void;
  readonly onSend: () => void;
  readonly sending: boolean;
  readonly receiptOutcome: CustomerDisplayReceiptOutcome | null;
  readonly className?: string;
};

function Shell({
  workspaceName,
  children,
  className,
  screen,
}: {
  workspaceName: string;
  children: ReactNode;
  className?: string;
  screen: CustomerDisplayScreen;
}) {
  return (
    <section
      data-pos-display-screen={screen}
      className={cn(
        "flex min-h-screen w-full flex-col bg-admin-surface text-admin-ink",
        className,
      )}
    >
      <header className="px-8 pt-8">
        <p className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-ink-muted">
          {workspaceName}
        </p>
      </header>
      <div className="flex flex-1 flex-col justify-center px-8 py-10">{children}</div>
    </section>
  );
}

export function CustomerDisplay(props: CustomerDisplayProps) {
  const { copy, sale, screen, workspaceName } = props;
  const currency = sale?.currency ?? "USD";
  const money = (cents: number) => formatOrderMoney(cents, currency);
  const name = sale?.customerName ?? null;

  const lostLine = props.connectionLost ? (
    <p role="status" data-pos-display-lost className="m-0 mt-8 text-base text-admin-ink-muted">
      {copy.readUnavailable}
    </p>
  ) : null;

  if (screen === "idle" || !sale) {
    return (
      <Shell workspaceName={workspaceName} screen="idle" className={props.className}>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
          <h1 className="m-0 text-4xl font-semibold tracking-tight">
            {interpolate(copy.idleWelcome, { workspace: workspaceName })}
          </h1>
          <p className="m-0 text-xl text-admin-ink-muted">{copy.idleBody}</p>
          {lostLine}
        </div>
      </Shell>
    );
  }

  if (screen === "review") {
    return (
      <Shell workspaceName={workspaceName} screen="review" className={props.className}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <h1 className="m-0 text-3xl font-semibold tracking-tight">
            {name ? interpolate(copy.reviewHeadingNamed, { name }) : copy.reviewHeadingAnon}
          </h1>
          <ul className="m-0 flex list-none flex-col gap-3 p-0" data-pos-display-lines>
            {sale.lines.map((line, index) => (
              <li key={`${line.label}-${index}`} className="flex items-baseline justify-between gap-6 text-xl">
                <span className="min-w-0">
                  <span className="mr-3 tabular-nums text-admin-ink-muted">{line.units}</span>
                  {line.label}
                </span>
                <span className="shrink-0 tabular-nums">{money(line.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="m-0 flex flex-col gap-2 border-t border-admin-border pt-4 text-lg">
            {sale.discountCents > 0 && (
              <div className="flex justify-between text-admin-ink-muted">
                <dt>{copy.discount}</dt>
                <dd className="m-0 tabular-nums">{money(-sale.discountCents)}</dd>
              </div>
            )}
            {sale.depositPaidCents > 0 && (
              <div className="flex justify-between text-admin-ink-muted">
                <dt>{copy.depositPaid}</dt>
                <dd className="m-0 tabular-nums">{money(-sale.depositPaidCents)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between text-3xl font-semibold">
              <dt>{copy.toPay}</dt>
              <dd className="m-0 tabular-nums" data-pos-display-to-pay>
                {money(sale.outstandingCents)}
              </dd>
            </div>
          </dl>
          <p className="m-0 text-base text-admin-ink-muted" data-pos-display-tip>
            {copy.tipNotOffered}
          </p>
          <button type="button" className={PRIMARY} onClick={props.onLooksRight}>
            {copy.looksRight}
          </button>
          <p className="m-0 text-center text-base text-admin-ink-muted">{copy.reviewNote}</p>
          {lostLine}
        </div>
      </Shell>
    );
  }

  if (screen === "confirm") {
    return (
      <Shell workspaceName={workspaceName} screen="confirm" className={props.className}>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
          <h1 className="m-0 text-3xl font-semibold tracking-tight">{copy.confirmHeading}</h1>
          <p className="m-0 text-6xl font-semibold tabular-nums tracking-tight">{money(sale.outstandingCents)}</p>
          <p className="m-0 text-xl text-admin-ink-muted">
            {interpolate(copy.confirmBody, { amount: money(sale.outstandingCents) })}
          </p>
          <p className="m-0 text-base text-admin-ink-muted">{copy.confirmNote}</p>
          <button type="button" className={cn(SECONDARY, "max-w-xs")} onClick={props.onBack}>
            {copy.back}
          </button>
          {lostLine}
        </div>
      </Shell>
    );
  }

  if (screen === "waiting") {
    return (
      <Shell workspaceName={workspaceName} screen="waiting" className={props.className}>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
          <h1 className="m-0 text-3xl font-semibold tracking-tight">{copy.waitingHeading}</h1>
          <p className="m-0 text-xl text-admin-ink-muted">
            {interpolate(copy.waitingBody, { amount: money(sale.outstandingCents) })}
          </p>
          {lostLine}
        </div>
      </Shell>
    );
  }

  if (screen === "declined") {
    return (
      <Shell workspaceName={workspaceName} screen="declined" className={props.className}>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
          <h1 className="m-0 text-3xl font-semibold tracking-tight">{copy.declinedHeading}</h1>
          <p className="m-0 text-xl text-admin-ink-muted">{copy.declinedBody}</p>
          {lostLine}
        </div>
      </Shell>
    );
  }

  const paidAmount = money(sale.totalCents);
  const paidLine =
    sale.paidVia === null
      ? interpolate(copy.paidBody, { amount: paidAmount })
      : interpolate(copy.paidVia, {
          amount: paidAmount,
          method: sale.paidVia === "cash" ? copy.methodCash : copy.methodCard,
        });

  if (screen === "paid") {
    return (
      <Shell workspaceName={workspaceName} screen="paid" className={props.className}>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
          <h1 className="m-0 text-4xl font-semibold tracking-tight">
            {name ? interpolate(copy.paidHeadingNamed, { name }) : copy.paidHeadingAnon}
          </h1>
          <p className="m-0 text-2xl text-admin-ink-muted" data-pos-display-paid>
            {paidLine}
          </p>
          <h2 className="m-0 mt-4 text-2xl font-semibold">{copy.receiptQuestion}</h2>
          <div className="flex w-full max-w-md flex-col gap-3">
            <button type="button" className={PRIMARY} onClick={props.onEmailMe}>
              {copy.emailMe}
            </button>
            <button
              type="button"
              disabled
              aria-describedby="pos-display-text-note"
              className={SECONDARY}
            >
              {copy.textMe}
            </button>
            <p id="pos-display-text-note" className="m-0 text-sm text-admin-ink-muted" data-pos-display-text-not-offered>
              {copy.textNotOffered}
            </p>
            <button type="button" className={SECONDARY} onClick={props.onNoReceipt}>
              {copy.noReceipt}
            </button>
          </div>
          <p className="m-0 text-base text-admin-ink-muted">{copy.clearsSoon}</p>
          {lostLine}
        </div>
      </Shell>
    );
  }

  if (screen === "contact") {
    const refusal = props.receiptOutcome?.kind === "refused" ? props.receiptOutcome.sentence : null;
    return (
      <Shell workspaceName={workspaceName} screen="contact" className={props.className}>
        <form
          className="mx-auto flex w-full max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSend();
          }}
        >
          <h1 className="m-0 text-3xl font-semibold tracking-tight">{copy.contactHeading}</h1>
          <label htmlFor="pos-display-email" className="text-base font-medium">
            {copy.contactEmailLabel}
          </label>
          <input
            id="pos-display-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className={cn(POS_INPUT, "h-14 border-admin-border bg-admin-surface text-lg text-admin-ink")}
            placeholder={copy.contactEmailPlaceholder}
            value={props.email}
            onChange={(event) => props.onEmailChange(event.target.value)}
          />
          {refusal && (
            <p role="alert" data-pos-display-refusal className="m-0 text-base text-destructive">
              {refusal}
            </p>
          )}
          <button type="submit" disabled={props.sending} className={PRIMARY}>
            {copy.contactSend}
          </button>
          <button type="button" className={SECONDARY} onClick={props.onNoReceipt}>
            {copy.noReceipt}
          </button>
          <p className="m-0 text-sm text-admin-ink-muted">{copy.contactNote}</p>
          {lostLine}
        </form>
      </Shell>
    );
  }

  // screen === "sent"
  const outcome = props.receiptOutcome;
  const sentLine =
    outcome?.kind === "sent"
      ? interpolate(copy.sentBody, { email: outcome.email })
      : outcome?.kind === "skipped"
        ? interpolate(copy.sentSkipped, { email: outcome.email })
        : null;
  return (
    <Shell workspaceName={workspaceName} screen="sent" className={props.className}>
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
        <h1 className="m-0 text-3xl font-semibold tracking-tight">{copy.sentHeading}</h1>
        {sentLine && (
          <p className="m-0 text-xl text-admin-ink-muted" data-pos-display-sent>
            {sentLine}
          </p>
        )}
        <p className="m-0 text-base text-admin-ink-muted">{copy.clearsSoon}</p>
        {lostLine}
      </div>
    </Shell>
  );
}
