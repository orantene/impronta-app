"use client";

/**
 * CollectSheet — money.md's M01–M12 family, the counter's own collect
 * screen: methods as tabs with cash first (M01), a keypad for the amount
 * tendered and the change due (M03), and Card/Link/Pass tabs that render
 * their own state, including the disabled state with an honest sentence
 * when a method is not available (spec §"refusals the screen must show").
 *
 * `methods` is sorted defensively so cash renders first even if the caller
 * passes it out of order — "cash first" is a rule of this screen, not of
 * whoever calls it.
 *
 * Change-due comes from `changeDueCents` (pos-math.ts), the same function
 * `basket-totals`/`collect-math` tests exercise directly — one calculation,
 * read here and proved there.
 *
 * The status box above the method panel is never blank. `PosCollectionMethodState`
 * makes `unavailableReason` required wherever `available` is `false`, so a
 * disabled method without a sentence is a type error, not a live empty box.
 * That still leaves one caller mistake the type system cannot see: passing an
 * `activeMethod` whose id is not in `methods` at all. `copy.methodUnavailableFallback`
 * covers that case too, so the box shows an honest sentence regardless of
 * which of the two ways got it there.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { changeDueCents, tenderIsShort } from "./pos-math";
import { POS_PRIMARY_ACTION, POS_SURFACE, POS_TAB, POS_TAB_ACTIVE, POS_TAB_IDLE } from "./pos-classes";
import type { PosCollectionMethodId, PosCollectionMethodState } from "./pos-types";

const METHOD_ORDER: readonly PosCollectionMethodId[] = ["cash", "card", "link", "pass"];
const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export type CollectSheetCopy = {
  readonly title: string;
  readonly methodCash: string;
  readonly methodCard: string;
  readonly methodLink: string;
  readonly methodPass: string;
  readonly amountDue: string;
  readonly tendered: string;
  readonly change: string;
  readonly confirmCash: string;
  readonly keypadClear: string;
  readonly cardWaiting: string;
  readonly linkReady: string;
  readonly passReady: string;
  /** Shown when `activeMethod`'s id has no entry in `methods` at all. */
  readonly methodUnavailableFallback: string;
};

const METHOD_LABEL_KEY: Record<PosCollectionMethodId, keyof CollectSheetCopy> = {
  cash: "methodCash",
  card: "methodCard",
  link: "methodLink",
  pass: "methodPass",
};

export type CollectSheetProps = {
  readonly amountDueCents: number;
  readonly currency: string;
  readonly methods: readonly PosCollectionMethodState[];
  readonly activeMethod: PosCollectionMethodId;
  readonly onSelectMethod: (method: PosCollectionMethodId) => void;
  /** Cents already keyed in on the cash keypad. */
  readonly tenderedCents: number;
  readonly onKeypadPress: (key: string) => void;
  readonly onConfirmCash: () => void;
  readonly confirmLoading?: boolean;
  readonly copy: CollectSheetCopy;
  readonly className?: string;
};

export function CollectSheet({
  amountDueCents,
  currency,
  methods,
  activeMethod,
  onSelectMethod,
  tenderedCents,
  onKeypadPress,
  onConfirmCash,
  confirmLoading,
  copy,
  className,
}: CollectSheetProps) {
  const byId = new Map(methods.map((m) => [m.id, m]));
  const ordered = METHOD_ORDER.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const active = byId.get(activeMethod);
  const change = changeDueCents(tenderedCents, amountDueCents);
  const short = tenderIsShort(tenderedCents, amountDueCents);

  // Never a blank box. The type system forbids `available: false` with no
  // reason at all (see `PosCollectionMethodState`), but it cannot forbid the
  // two shapes that still reach here at runtime: an `activeMethod` that
  // `methods` never listed, and a reason that is present but empty or blank.
  // A caller composing its reason as `lookup[id] ?? ""` produces the second
  // one without ever failing a type check, and an empty status box sits in
  // exactly the place the cashier needs the sentence.
  const statedReason = active && !active.available ? active.unavailableReason.trim() : "";
  const unavailableSentence = !active
    ? copy.methodUnavailableFallback
    : !active.available
      ? statedReason || copy.methodUnavailableFallback
      : null;

  return (
    <div className={cn(POS_SURFACE, "flex flex-col gap-4 p-4", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {copy.title}
      </h2>

      <div className="flex gap-2" role="tablist" aria-label={copy.title}>
        {ordered.map((method) => (
          <button
            key={method.id}
            type="button"
            role="tab"
            aria-selected={method.id === activeMethod}
            onClick={() => onSelectMethod(method.id)}
            className={cn(
              POS_TAB,
              "flex-1",
              method.id === activeMethod ? POS_TAB_ACTIVE : POS_TAB_IDLE,
            )}
          >
            {copy[METHOD_LABEL_KEY[method.id]]}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{copy.amountDue}</span>
        <span className="text-base font-semibold text-foreground">
          {formatOrderMoney(amountDueCents, currency)}
        </span>
      </div>

      {unavailableSentence !== null ? (
        <p role="status" className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {unavailableSentence}
        </p>
      ) : activeMethod === "cash" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{copy.tendered}</p>
              <p className="text-lg font-semibold text-foreground">
                {formatOrderMoney(tenderedCents, currency)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{copy.change}</p>
              <p className="text-lg font-semibold text-foreground">
                {formatOrderMoney(change, currency)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {KEYPAD_DIGITS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onKeypadPress(key)}
                aria-label={key === "clear" ? copy.keypadClear : undefined}
                className="flex h-14 items-center justify-center rounded-xl border border-border bg-card text-lg font-medium text-foreground hover:bg-accent"
              >
                {key === "clear" ? copy.keypadClear : key === "back" ? "⌫" : key}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={short || confirmLoading}
            onClick={onConfirmCash}
            className={cn(POS_PRIMARY_ACTION, "w-full")}
          >
            {copy.confirmCash}
          </button>
        </div>
      ) : activeMethod === "card" ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {copy.cardWaiting}
        </p>
      ) : activeMethod === "link" ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {copy.linkReady}
        </p>
      ) : activeMethod === "pass" ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {copy.passReady}
        </p>
      ) : null}
    </div>
  );
}
