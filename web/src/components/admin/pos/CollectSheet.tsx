"use client";

/**
 * CollectSheet — money.md's M01–M04 as the boards draw them (`POSCashTender`,
 * `POSCashShort`, `POSCashTenderES`): two columns. Left, the summary card
 * ending in `To collect`, then `HOW` and the six method tiles (Cash · Card ·
 * Payment link · Bank transfer · Pass or credit · Two methods). Right, the
 * cash panel: quick tenders (`Exact $1,390 · $1,400 · $1,500 · $2,000`),
 * `Customer gives`, the keypad, the `Change to give` / `Still short` bar,
 * and the one big action (`Cash received · give $110`, or `Confirm cash`
 * disabled while short).
 *
 * `methods` is sorted defensively so cash renders first even if the caller
 * passes it out of order. A method the caller did not list at all (bank
 * transfer, two methods) is drawn disabled with its sentence: neither has a
 * writer on the sale (D-POS-24).
 *
 * The status box is never blank: `PosCollectionMethodState` makes
 * `unavailableReason` required wherever `available` is `false`, and
 * `copy.methodUnavailableFallback` covers an `activeMethod` that `methods`
 * never listed or a reason that is present but blank.
 *
 * Change-due comes from `changeDueCents` (pos-math.ts) — one calculation,
 * read here and proved there.
 */

import { ChevronLeft, CreditCard, FileText, Gift, Layers, Link2, Wallet, type LucideProps } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { confirmCashOrEnqueue } from "@/lib/pos/cash-outbox";
import { cn } from "@/lib/utils";
import { changeDueCents, tenderIsShort } from "./pos-math";
import { PosKeypad } from "./PosKeypad";
import { POS_EYEBROW, POS_NUM, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_TOTAL_ROW } from "./pos-classes";
import type { PosCollectionMethodId, PosCollectionMethodState } from "./pos-types";

const METHOD_ORDER: readonly PosCollectionMethodId[] = ["cash", "card", "link", "pass"];

export type CollectSheetCopy = {
  readonly title: string;
  readonly methodCash: string;
  readonly methodCard: string;
  readonly methodLink: string;
  readonly methodPass: string;
  readonly methodTransfer: string;
  readonly methodTransferUnavailable: string;
  readonly methodSplit: string;
  readonly methodSplitUnavailable: string;
  readonly cashHint: string;
  readonly cardHint: string;
  readonly linkHint: string;
  readonly passHint: string;
  readonly how: string;
  readonly amountDue: string;
  /** `Exact {amount}` */
  readonly exact: string;
  readonly tendered: string;
  readonly change: string;
  readonly short: string;
  readonly confirmCash: string;
  /** `Cash received · give {amount}` */
  readonly confirmCashChange: string;
  readonly confirmCashExact: string;
  /** `Take {amount} · rest by card` */
  readonly takePartial: string;
  readonly takePartialUnavailable: string;
  readonly keypadClear: string;
  readonly back: string;
  readonly cardWaiting: string;
  readonly linkReady: string;
  readonly passReady: string;
  /** Shown when `activeMethod`'s id has no entry in `methods` at all. */
  readonly methodUnavailableFallback: string;
};

export type CollectSummaryRow = { readonly label: string; readonly amountCents: number; readonly negative?: boolean };

export type CollectSheetProps = {
  readonly amountDueCents: number;
  readonly currency: string;
  readonly methods: readonly PosCollectionMethodState[];
  readonly activeMethod: PosCollectionMethodId;
  readonly onSelectMethod: (method: PosCollectionMethodId) => void;
  /** Cents already keyed in on the cash keypad. */
  readonly tenderedCents: number;
  readonly onKeypadPress: (key: string) => void;
  /** Quick tender: replaces the tendered figure outright. */
  readonly onTender?: (cents: number) => void;
  readonly onConfirmCash: () => void;
  /** When the till is offline, cash confirm queues Package 3 `cash_collect` (D-122). */
  readonly offlineCash?: { orderId: string; operationKey: string };
  /**
   * Start the payment-link collection. Optional: a caller with no provider
   * behind the link tab passes nothing and the panel stays a statement of
   * what the tab is, with no button that could look like it works.
   */
  readonly onConfirmLink?: () => void;
  /** The payment-link tab's own panel (`PaymentLinkPanel`), when the sale can mint one. */
  readonly linkPanel?: ReactNode;
  readonly confirmLoading?: boolean;
  /** The rows above `To collect` (`Subtotal`, `Discount`). Optional. */
  readonly summary?: readonly CollectSummaryRow[];
  /** `Back to the sale`, drawn as a quiet link over the summary when given. */
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly copy: CollectSheetCopy;
  readonly className?: string;
};

const METHOD_ICON: Record<PosCollectionMethodId, ComponentType<LucideProps>> = {
  cash: Wallet,
  card: CreditCard,
  link: Link2,
  pass: Gift,
};

/** `Exact`, then the next three round figures above the total. */
export function quickTenders(amountCents: number): number[] {
  const out = [amountCents];
  const steps = [5_000, 10_000, 20_000, 50_000, 100_000];
  for (const step of steps) {
    const next = Math.ceil((amountCents + 1) / step) * step;
    if (!out.includes(next)) out.push(next);
    if (out.length === 4) break;
  }
  return out;
}

export function CollectSheet({
  amountDueCents,
  currency,
  methods,
  activeMethod,
  onSelectMethod,
  tenderedCents,
  onKeypadPress,
  onTender,
  onConfirmCash,
  offlineCash,
  onConfirmLink,
  linkPanel,
  confirmLoading,
  summary,
  onBack,
  backLabel,
  copy,
  className,
}: CollectSheetProps) {
  const byId = new Map(methods.map((m) => [m.id, m]));
  const ordered = METHOD_ORDER.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const active = byId.get(activeMethod);
  const change = changeDueCents(tenderedCents, amountDueCents);
  const short = tenderIsShort(tenderedCents, amountDueCents);
  const shortBy = Math.max(0, amountDueCents - tenderedCents);

  const statedReason = active && !active.available ? active.unavailableReason.trim() : "";
  const unavailableSentence = !active
    ? copy.methodUnavailableFallback
    : !active.available
      ? statedReason || copy.methodUnavailableFallback
      : null;

  const labelFor = (id: PosCollectionMethodId) =>
    id === "cash" ? copy.methodCash : id === "card" ? copy.methodCard : id === "link" ? copy.methodLink : copy.methodPass;
  const hintFor = (id: PosCollectionMethodId) =>
    id === "cash" ? copy.cashHint : id === "card" ? copy.cardHint : id === "link" ? copy.linkHint : copy.passHint;

  const tile =
    "flex min-h-[78px] items-center gap-3.5 rounded-[14px] border-[1.5px] px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand disabled:cursor-not-allowed";

  return (
    <div data-pos-collect className={cn("grid min-h-0 flex-1 grid-cols-[1fr_1fr] overflow-hidden", className)}>
      <div className="min-h-0 overflow-y-auto border-r border-admin-border bg-admin-surface px-6 py-5">
        {onBack && backLabel && (
          <button
            type="button"
            data-pos-collect-back
            onClick={onBack}
            className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-[10px] px-2 text-[14px] font-semibold text-admin-ink-muted hover:bg-admin-surface-alt hover:text-admin-ink"
          >
            <ChevronLeft aria-hidden size={16} strokeWidth={1.75} />
            {backLabel}
          </button>
        )}
        <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-5 pb-4 pt-2">
          {summary?.map((row) => (
            <div key={row.label} className={POS_TOTAL_ROW}>
              <span className="text-admin-ink-muted">{row.label}</span>
              <span className={cn("font-semibold text-admin-ink", POS_NUM)}>
                {row.negative ? "−" : ""}
                {formatOrderMoney(row.amountCents, currency)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3">
            <span className="text-[17px] font-bold text-admin-ink">{copy.amountDue}</span>
            <span data-pos-amount-due className={cn("text-[34px] font-bold tracking-[-0.025em] text-admin-ink", POS_NUM)}>
              {formatOrderMoney(amountDueCents, currency)}
            </span>
          </div>
        </div>

        <p className={cn(POS_EYEBROW, "m-0 mb-2.5 mt-5")}>{copy.how}</p>
        <div className="grid grid-cols-2 gap-3" role="tablist" aria-label={copy.title}>
          {ordered.map((method) => {
            const Icon = METHOD_ICON[method.id];
            const selected = method.id === activeMethod;
            return (
              <button
                key={method.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={labelFor(method.id)}
                data-pos-method={method.id}
                onClick={() => onSelectMethod(method.id)}
                className={cn(
                  tile,
                  selected ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                  !method.available && "opacity-70",
                )}
              >
                <Icon aria-hidden size={22} strokeWidth={1.75} className={selected ? "text-admin-brand" : "text-admin-ink-muted"} />
                <span className="min-w-0">
                  <span className="block text-[16px] font-semibold text-admin-ink">{labelFor(method.id)}</span>
                  <span className="block truncate text-[13px] text-admin-ink-muted">{hintFor(method.id)}</span>
                </span>
              </button>
            );
          })}
          <button type="button" role="tab" aria-selected={false} aria-label={copy.methodTransfer} disabled title={copy.methodTransferUnavailable} className={cn(tile, "border-admin-border bg-admin-card opacity-70")}>
            <FileText aria-hidden size={22} strokeWidth={1.75} className="text-admin-ink-muted" />
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold text-admin-ink">{copy.methodTransfer}</span>
              <span className="block text-[13px] text-admin-ink-muted">{copy.methodTransferUnavailable}</span>
            </span>
          </button>
          <button type="button" role="tab" aria-selected={false} aria-label={copy.methodSplit} disabled title={copy.methodSplitUnavailable} className={cn(tile, "border-admin-border bg-admin-card opacity-70")}>
            <Layers aria-hidden size={22} strokeWidth={1.75} className="text-admin-ink-muted" />
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold text-admin-ink">{copy.methodSplit}</span>
              <span className="block text-[13px] text-admin-ink-muted">{copy.methodSplitUnavailable}</span>
            </span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-col overflow-y-auto bg-admin-surface px-6 py-5">
        <p className={cn(POS_EYEBROW, "m-0 mb-3")}>{activeMethod === "cash" ? copy.methodCash : labelFor(activeMethod)}</p>

        {unavailableSentence !== null ? (
          // `data-pos-method-status` so a browser test can name THIS sentence.
          <p role="status" data-pos-method-status className="m-0 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card p-4 text-[15px] text-admin-ink-muted">
            {unavailableSentence}
          </p>
        ) : activeMethod === "cash" ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className="grid grid-cols-4 gap-2.5">
              {quickTenders(amountDueCents).map((cents, index) => (
                <button
                  key={cents}
                  type="button"
                  aria-pressed={tenderedCents === cents}
                  onClick={() => onTender?.(cents)}
                  className={cn(
                    "h-12 truncate rounded-[12px] border-[1.5px] px-2 font-mono text-[14px] font-semibold text-admin-ink transition-colors",
                    POS_NUM,
                    tenderedCents === cents ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                  )}
                >
                  {index === 0 ? interpolate(copy.exact, { amount: formatOrderMoney(cents, currency) }) : formatOrderMoney(cents, currency)}
                </button>
              ))}
            </div>
            <div
              className={cn(
                "flex h-[70px] items-center justify-between rounded-[14px] border-[1.5px] bg-admin-card px-5",
                short && tenderedCents > 0 ? "border-admin-coral" : "border-admin-border",
              )}
            >
              <span className="text-[15px] text-admin-ink-muted">{copy.tendered}</span>
              <span data-pos-tendered className={cn("text-[36px] font-bold tracking-[-0.025em] text-admin-ink", POS_NUM)}>
                {formatOrderMoney(tenderedCents, currency)}
              </span>
            </div>
            <PosKeypad onKey={onKeypadPress} backLabel={copy.back} />
            {short ? (
              <div className="flex h-[52px] items-center justify-between rounded-[12px] bg-admin-coral-soft px-4">
                <span className="text-[15px] font-semibold text-admin-coral-deep">{copy.short}</span>
                <span data-pos-short className={cn("text-[22px] font-bold text-admin-coral-deep", POS_NUM)}>
                  {formatOrderMoney(shortBy, currency)}
                </span>
              </div>
            ) : (
              <div className="flex h-[52px] items-center justify-between rounded-[12px] bg-admin-success-soft px-4">
                <span className="text-[15px] font-semibold text-admin-success">{copy.change}</span>
                <span data-pos-change className={cn("text-[22px] font-bold text-admin-success", POS_NUM)}>
                  {formatOrderMoney(change, currency)}
                </span>
              </div>
            )}
            <div className="flex-1" />
            {short ? (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled title={copy.takePartialUnavailable} className={cn(POS_OUTLINE_ACTION, "h-14")}>
                  {interpolate(copy.takePartial, { amount: formatOrderMoney(tenderedCents, currency) })}
                </button>
                <button type="button" disabled className={POS_PRIMARY_ACTION}>
                  {copy.confirmCash}
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-pos-confirm-cash
                disabled={confirmLoading}
                onClick={() => {
                  if (offlineCash) {
                    const queued = confirmCashOrEnqueue({
                      online: typeof navigator === "undefined" ? true : navigator.onLine,
                      orderId: offlineCash.orderId,
                      amountCents: amountDueCents,
                      operationKey: offlineCash.operationKey,
                    });
                    if (queued === "queued") return;
                  }
                  onConfirmCash();
                }}
                className={cn(POS_PRIMARY_ACTION, "w-full")}
              >
                {change > 0 ? interpolate(copy.confirmCashChange, { amount: formatOrderMoney(change, currency) }) : copy.confirmCashExact}
              </button>
            )}
          </div>
        ) : activeMethod === "card" ? (
          <p className="m-0 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card p-4 text-[15px] text-admin-ink-muted">{copy.cardWaiting}</p>
        ) : activeMethod === "link" && linkPanel ? (
          linkPanel
        ) : activeMethod === "link" ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card p-4 text-[15px] text-admin-ink-muted">{copy.linkReady}</p>
            {onConfirmLink && (
              <button type="button" disabled={confirmLoading} onClick={onConfirmLink} className={cn(POS_PRIMARY_ACTION, "w-full")}>
                {copy.methodLink}
              </button>
            )}
          </div>
        ) : activeMethod === "pass" ? (
          <p className="m-0 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card p-4 text-[15px] text-admin-ink-muted">{copy.passReady}</p>
        ) : null}
      </div>
    </div>
  );
}
