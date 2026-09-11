"use client";

/**
 * CashDrawerScreen — M21–M23, the `Cash` rail target in its three states:
 *
 *   open       (`POSCashOpen`)       no shift: Drawer · Responsible, the
 *                                    `Starting cash · counted` box and keypad,
 *                                    `Open drawer · start with $500`; on the
 *                                    right `ONCE IT'S OPEN`.
 *   movements  (`POSCashMovements`)  shift open: the four movement tiles and
 *                                    the day's list, `HAND THE DRAWER TO
 *                                    SOMEONE`, and `Close drawer & count`.
 *   close      (`POSCashClose`)      the denomination count, `Counted`, the
 *                                    expected-cash card, `What happened`,
 *                                    `I confirm this count`, `Back · Close
 *                                    drawer`.
 *   closed                           the result the engine returned: expected,
 *                                    counted, and the difference.
 *
 * WHAT IS WIRED. Open (`openShift` with the counted float), the four
 * movements (`posRecordShiftMovement`: paid in, paid out, drop to safe, float
 * added; the list is the shift's own `pos_shift_movements` rows), the
 * hand-over (who takes the drawer, carried into the close as
 * `handedOverTo`), the `What happened` note (`closeNote`) and close
 * (`closeShift` with the counted total; the engine computes expected cash
 * from the float, the cash sales and the movements and returns the
 * variance). The count is blind on purpose: expected cash is shown only
 * after the close; the movements themselves are facts already on screen.
 *
 * NOT WIRED, drawn disabled with a sentence: a choice of drawer or
 * responsible at opening (one drawer per workspace, the signed-in person),
 * and `Open drawer · no sale` (no cash-drawer device, D-POS-28).
 */

import { ArrowLeft, Lock, Minus, Plus, RotateCcw } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosKeypad } from "./PosKeypad";
import { POS_EYEBROW, POS_INPUT, POS_LABEL, POS_NUM, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_TOTAL_ROW } from "./pos-classes";
import type { PosPerson, PosShiftMovement, PosShiftSummary } from "./pos-types";

export type CashDrawerView = "open" | "movements" | "close" | "closed";

export type CashMovementKind = PosShiftMovement["kind"];

/** The signed sum of one kind of movement, for the close card. */
export function movementSum(movements: readonly PosShiftMovement[] | undefined, kind: CashMovementKind): number {
  return (movements ?? []).filter((m) => m.kind === kind).reduce((sum, m) => sum + m.amountCents, 0);
}

export type CashDrawerCopy = {
  readonly openEyebrow: string;
  readonly drawer: string;
  readonly drawerDefault: string;
  readonly drawerUnavailable: string;
  readonly responsible: string;
  /** `{name} (you)` */
  readonly responsibleYou: string;
  readonly startingCash: string;
  /** `Open drawer · start with {amount}` */
  readonly openDrawer: string;
  readonly onceOpen: string;
  readonly addCash: string;
  readonly addCashHint: string;
  readonly takeOut: string;
  readonly takeOutHint: string;
  readonly dropSafe: string;
  readonly dropSafeHint: string;
  readonly openNoSale: string;
  readonly openNoSaleHint: string;
  readonly onceOpenNote: string;
  readonly openNoSaleUnavailable: string;
  readonly movements: string;
  readonly movementsEmpty: string;
  /** The list's label per kind: `Added cash`, `Taken out`, `Drop to safe`, `Float added`. */
  readonly movementKind: Readonly<Record<CashMovementKind, string>>;
  readonly handOver: string;
  readonly newResponsible: string;
  readonly newResponsibleNone: string;
  readonly countedTogether: string;
  readonly handOverNote: string;
  /** `Hand over to {name}` */
  readonly handOverAction: string;
  /** `Handed over to {name} · closes with the count` */
  readonly handOverChosen: string;
  readonly closeAndCount: string;
  readonly countEyebrow: string;
  readonly coins: string;
  readonly counted: string;
  readonly startedWith: string;
  readonly shouldBe: string;
  readonly blindNote: string;
  readonly whatHappened: string;
  readonly whatHappenedHint: string;
  readonly confirmCount: string;
  readonly back: string;
  readonly closeDrawer: string;
  readonly closedTitle: string;
  readonly expected: string;
  readonly shortBy: string;
  readonly overBy: string;
  readonly balanced: string;
  readonly openAnother: string;
  readonly keypadBack: string;
};

export type CashDrawerScreenProps = {
  readonly view: CashDrawerView;
  readonly onViewChange: (view: CashDrawerView) => void;
  readonly shift: PosShiftSummary | null;
  readonly currency: string;
  readonly cashierName: string;
  readonly busy?: boolean;
  /** Major-unit string, as typed or as the keypad built it. */
  readonly openingCash: string;
  readonly onOpeningCashChange: (value: string) => void;
  readonly onOpeningKey: (key: string) => void;
  readonly openingCents: number | null;
  readonly onOpenShift: () => void;
  readonly denominations: readonly number[];
  readonly counts: Readonly<Record<number, number>>;
  readonly onCountChange: (denomination: number, count: number) => void;
  readonly countedCash: string;
  readonly onCountedCashChange: (value: string) => void;
  readonly countedCents: number | null;
  readonly confirmed: boolean;
  readonly onConfirmedChange: (value: boolean) => void;
  readonly onCloseShift: () => void;
  readonly result: { expectedCents: number; countedCents: number } | null;
  /** Opens the movement dialog for one kind (`POSCashMovements`). */
  readonly onMovement?: (kind: CashMovementKind) => void;
  /** Clock-formatted time of a movement row. */
  readonly formatTime?: (iso: string) => string;
  /** The people the drawer can be handed to. */
  readonly people?: readonly PosPerson[];
  readonly handOverTo?: string | null;
  readonly onHandOverToChange?: (userId: string | null) => void;
  readonly countedTogether?: boolean;
  readonly onCountedTogetherChange?: (value: boolean) => void;
  readonly closeNote?: string;
  readonly onCloseNoteChange?: (value: string) => void;
  readonly copy: CashDrawerCopy;
};

const TILE =
  "flex min-h-[74px] items-center gap-3.5 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60";

function MovementTiles({ copy, disabled, onMovement }: { copy: CashDrawerCopy; disabled: boolean; onMovement?: (kind: CashMovementKind) => void }) {
  const rows: Array<{ kind: CashMovementKind | null; icon: typeof Plus; title: string; hint: string; reason?: string }> = [
    { kind: "float_add", icon: Plus, title: copy.addCash, hint: copy.addCashHint },
    { kind: "paid_out", icon: ArrowLeft, title: copy.takeOut, hint: copy.takeOutHint },
    { kind: "drop", icon: Lock, title: copy.dropSafe, hint: copy.dropSafeHint },
    { kind: null, icon: RotateCcw, title: copy.openNoSale, hint: copy.openNoSaleHint, reason: copy.openNoSaleUnavailable },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {rows.map((row) => {
        const kind = row.kind;
        const off = disabled || kind === null || !onMovement;
        return (
          <button
            key={row.title}
            type="button"
            data-pos-movement={row.kind ?? "open"}
            disabled={off}
            title={row.reason}
            onClick={kind !== null && onMovement ? () => onMovement(kind) : undefined}
            className={TILE}
          >
            <row.icon aria-hidden size={20} strokeWidth={1.75} className="text-admin-ink-muted" />
            <span>
              <span className="block text-[16px] font-semibold text-admin-ink">{row.title}</span>
              <span className="block text-[13px] text-admin-ink-muted">{row.reason ?? row.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MovementList({ movements, currency, copy, formatTime }: { movements: readonly PosShiftMovement[]; currency: string; copy: CashDrawerCopy; formatTime?: (iso: string) => string }) {
  if (movements.length === 0) {
    return (
      <p role="status" data-pos-movements-empty className="m-0 mt-4 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-4 text-[14px] text-admin-ink-muted">
        {copy.movementsEmpty}
      </p>
    );
  }
  return (
    <ul className="m-0 mt-4 list-none overflow-hidden rounded-[14px] border-[1.5px] border-admin-border bg-admin-card p-0" data-pos-movements>
      {movements.map((m) => {
        const inbound = m.kind === "paid_in" || m.kind === "float_add";
        return (
          <li key={m.id} className="flex items-center gap-3 border-b border-admin-border-soft px-4 py-3 last:border-b-0" data-pos-movement-row={m.kind}>
            <span className={cn("w-14 shrink-0 text-[14px] text-admin-ink-muted", POS_NUM)}>{formatTime ? formatTime(m.createdAt) : ""}</span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-admin-ink">
              {copy.movementKind[m.kind]}
              {m.reason ? ` · ${m.reason}` : ""}
            </span>
            <span className={cn("shrink-0 font-mono text-[15px] font-semibold", POS_NUM, inbound ? "text-admin-success" : "text-admin-ink")}>
              {inbound ? "+" : "−"}
              {formatOrderMoney(m.amountCents, currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function CashDrawerScreen(props: CashDrawerScreenProps) {
  const { copy, currency } = props;
  const opening = props.openingCents ?? 0;

  if (props.view === "open" || !props.shift) {
    return (
      <div data-pos-cash-open className="grid min-h-0 flex-1 grid-cols-[1fr_1fr] overflow-hidden">
        <div className="min-h-0 overflow-y-auto border-r border-admin-border px-6 py-6">
          <p className={cn(POS_EYEBROW, "m-0 mb-3")}>{copy.openEyebrow}</p>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <span className={POS_LABEL}>{copy.drawer}</span>
              <input className={POS_INPUT} disabled readOnly value={copy.drawerDefault} title={copy.drawerUnavailable} />
            </div>
            <div>
              <span className={POS_LABEL}>{copy.responsible}</span>
              <input className={POS_INPUT} disabled readOnly value={interpolate(copy.responsibleYou, { name: props.cashierName })} />
            </div>
          </div>
          <label className="mt-4 flex h-[74px] items-center justify-between rounded-[14px] border-[1.5px] border-admin-brand bg-admin-card px-5">
            <span className="text-[15px] text-admin-ink-muted">{copy.startingCash}</span>
            <input
              id="pos-shift-opening"
              inputMode="decimal"
              value={props.openingCash}
              onChange={(e) => props.onOpeningCashChange(e.target.value)}
              className={cn("w-40 bg-transparent text-right text-[36px] font-bold tracking-[-0.025em] text-admin-ink outline-none", POS_NUM)}
            />
          </label>
          <PosKeypad className="mt-3.5" onKey={props.onOpeningKey} backLabel={copy.keypadBack} />
          <button
            type="button"
            data-pos-open-shift
            disabled={props.busy || props.openingCents === null}
            onClick={props.onOpenShift}
            className={cn(POS_PRIMARY_ACTION, "mt-4 w-full")}
          >
            {interpolate(copy.openDrawer, { amount: formatOrderMoney(opening, currency) })}
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 py-6">
          <p className={cn(POS_EYEBROW, "m-0 mb-3")}>{copy.onceOpen}</p>
          <MovementTiles copy={copy} disabled />
          <p className="m-0 mt-3 text-[14px] leading-relaxed text-admin-ink-muted">{copy.onceOpenNote}</p>
        </div>
      </div>
    );
  }

  if (props.view === "closed" && props.result) {
    const diff = props.result.countedCents - props.result.expectedCents;
    return (
      <div data-pos-cash-closed className="flex min-h-0 flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-[520px] rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-5 pb-3 pt-2">
          <p className={cn(POS_EYEBROW, "m-0 mb-1 mt-2")}>{copy.closedTitle}</p>
          <div className={POS_TOTAL_ROW}>
            <span className="text-admin-ink-muted">{copy.expected}</span>
            <span className={cn("font-semibold text-admin-ink", POS_NUM)}>{formatOrderMoney(props.result.expectedCents, currency)}</span>
          </div>
          <div className={POS_TOTAL_ROW}>
            <span className="text-admin-ink-muted">{copy.counted}</span>
            <span className={cn("font-semibold text-admin-ink", POS_NUM)}>{formatOrderMoney(props.result.countedCents, currency)}</span>
          </div>
          <div className={cn(POS_TOTAL_ROW, "border-b-0")}>
            <span className="font-bold text-admin-ink">{diff === 0 ? copy.balanced : diff < 0 ? copy.shortBy : copy.overBy}</span>
            <span className={cn("font-bold", POS_NUM, diff === 0 ? "text-admin-success" : "text-admin-coral-deep")}>
              {formatOrderMoney(Math.abs(diff), currency)}
            </span>
          </div>
        </div>
        <button type="button" onClick={() => props.onViewChange("open")} className={cn(POS_SECONDARY_ACTION, "mt-5")}>
          {copy.openAnother}
        </button>
      </div>
    );
  }

  if (props.view === "close") {
    const counted = props.countedCents ?? 0;
    return (
      <div data-pos-cash-close className="grid min-h-0 flex-1 grid-cols-[1fr_1fr] overflow-hidden">
        <div className="min-h-0 overflow-y-auto border-r border-admin-border px-6 py-6">
          <p className={cn(POS_EYEBROW, "m-0 mb-3")}>{copy.countEyebrow}</p>
          <div className="overflow-hidden rounded-[16px] border-[1.5px] border-admin-border bg-admin-card">
            {props.denominations.map((denomination) => {
              const count = props.counts[denomination] ?? 0;
              return (
                <div key={denomination} className="flex items-center gap-4 border-b border-admin-border-soft px-4 py-3">
                  <span className={cn("w-20 text-[16px] font-semibold text-admin-ink", POS_NUM)}>
                    {formatOrderMoney(denomination * 100, currency)} ×
                  </span>
                  <div className="flex h-[52px] items-center overflow-hidden rounded-[12px] border-[1.5px] border-admin-border">
                    <button
                      type="button"
                      aria-label={`${copy.counted} − ${denomination}`}
                      onClick={() => props.onCountChange(denomination, Math.max(0, count - 1))}
                      className="inline-flex h-full w-14 items-center justify-center border-r border-admin-border text-admin-ink hover:bg-admin-surface-alt"
                    >
                      <Minus aria-hidden size={18} strokeWidth={2} />
                    </button>
                    <span className={cn("w-16 text-center text-[18px] font-semibold text-admin-ink", POS_NUM)}>{count}</span>
                    <button
                      type="button"
                      aria-label={`${copy.counted} + ${denomination}`}
                      onClick={() => props.onCountChange(denomination, count + 1)}
                      className="inline-flex h-full w-14 items-center justify-center border-l border-admin-border text-admin-ink hover:bg-admin-surface-alt"
                    >
                      <Plus aria-hidden size={18} strokeWidth={2} />
                    </button>
                  </div>
                  <span className="flex-1" />
                  <span className={cn("font-mono text-[16px] font-semibold text-admin-ink", POS_NUM)}>
                    {formatOrderMoney(denomination * 100 * count, currency)}
                  </span>
                </div>
              );
            })}
          </div>
          <label className="mt-3.5 flex h-[66px] items-center justify-between rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-5">
            <span className="text-[15px] text-admin-ink-muted">{copy.counted}</span>
            <input
              id="pos-shift-counted"
              inputMode="decimal"
              value={props.countedCash}
              onChange={(e) => props.onCountedCashChange(e.target.value)}
              className={cn("w-44 bg-transparent text-right text-[34px] font-bold tracking-[-0.025em] text-admin-ink outline-none", POS_NUM)}
            />
          </label>
          <p className="m-0 mt-2 text-[13px] text-admin-ink-dim">{copy.coins}</p>
        </div>
        <div className="flex min-h-0 flex-col overflow-y-auto px-6 py-6">
          <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 pb-1 pt-1">
            <div className={POS_TOTAL_ROW}>
              <span className="text-admin-ink-muted">{copy.startedWith}</span>
              <span className={cn("font-semibold text-admin-ink", POS_NUM)}>{formatOrderMoney(props.shift.openingCashCents, currency)}</span>
            </div>
            {(["float_add", "paid_in", "paid_out", "drop"] as const).map((kind) => {
              const sum = movementSum(props.shift?.movements, kind);
              if (sum === 0) return null;
              const inbound = kind === "float_add" || kind === "paid_in";
              return (
                <div key={kind} className={POS_TOTAL_ROW} data-pos-close-movement={kind}>
                  <span className="text-admin-ink-muted">{copy.movementKind[kind]}</span>
                  <span className={cn("font-semibold", POS_NUM, inbound ? "text-admin-success" : "text-admin-ink")}>
                    {inbound ? "+" : "−"}
                    {formatOrderMoney(sum, currency)}
                  </span>
                </div>
              );
            })}
            <div className={cn(POS_TOTAL_ROW, "border-b-0")}>
              <span className="font-bold text-admin-ink">{copy.shouldBe}</span>
              <span className="text-[14px] text-admin-ink-dim">{copy.blindNote}</span>
            </div>
          </div>
          {props.handOverTo && props.people && (
            <p role="status" data-pos-handover-chosen className="m-0 mt-3 rounded-[12px] bg-admin-brand-soft px-4 py-3 text-[14px] font-semibold text-admin-brand">
              {interpolate(copy.handOverChosen, { name: props.people.find((p) => p.userId === props.handOverTo)?.name ?? "" })}
            </p>
          )}
          <div className="mt-4">
            <label className={POS_LABEL} htmlFor="pos-shift-note">
              {copy.whatHappened}
            </label>
            <input
              id="pos-shift-note"
              className={POS_INPUT}
              value={props.closeNote ?? ""}
              onChange={(e) => props.onCloseNoteChange?.(e.target.value)}
              disabled={!props.onCloseNoteChange}
              placeholder={copy.whatHappenedHint}
              maxLength={500}
            />
          </div>
          <label className="mt-4 flex items-center gap-2.5 text-[15px] text-admin-ink">
            <input
              type="checkbox"
              data-pos-confirm-count
              checked={props.confirmed}
              onChange={(e) => props.onConfirmedChange(e.target.checked)}
              className="h-6 w-6 rounded-md accent-admin-brand"
            />
            {copy.confirmCount}
          </label>
          <div className="flex-1" />
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <button type="button" onClick={() => props.onViewChange("movements")} className={cn(POS_SECONDARY_ACTION, "h-14")}>
              {copy.back}
            </button>
            <button
              type="button"
              data-pos-close-shift
              disabled={props.busy || !props.confirmed || props.countedCents === null}
              onClick={props.onCloseShift}
              className={POS_PRIMARY_ACTION}
            >
              {copy.closeDrawer}
            </button>
          </div>
          <p className="m-0 mt-2.5 text-center text-[13px] text-admin-ink-dim">
            {copy.counted}: {formatOrderMoney(counted, currency)} · {copy.blindNote}
          </p>
        </div>
      </div>
    );
  }

  const people = props.people ?? [];
  const handOverName = people.find((p) => p.userId === props.handOverTo)?.name ?? null;
  return (
    <div data-pos-cash-movements className="grid min-h-0 flex-1 grid-cols-[1fr_1fr] overflow-hidden">
      <div className="min-h-0 overflow-y-auto border-r border-admin-border px-6 py-6">
        <p className={cn(POS_EYEBROW, "m-0 mb-3")}>{copy.movements}</p>
        <MovementTiles copy={copy} disabled={Boolean(props.busy)} onMovement={props.onMovement} />
        <MovementList movements={props.shift.movements ?? []} currency={currency} copy={copy} formatTime={props.formatTime} />
      </div>
      <div className="flex min-h-0 flex-col overflow-y-auto px-6 py-6">
        <p className={cn(POS_EYEBROW, "m-0 mb-3")}>{copy.handOver}</p>
        <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-4">
          <label className={POS_LABEL} htmlFor="pos-handover-to">
            {copy.newResponsible}
          </label>
          <select
            id="pos-handover-to"
            className={POS_INPUT}
            value={props.handOverTo ?? ""}
            disabled={!props.onHandOverToChange || people.length === 0}
            onChange={(e) => props.onHandOverToChange?.(e.target.value || null)}
          >
            <option value="">{copy.newResponsibleNone}</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="mt-3 flex items-center gap-2.5 text-[15px] text-admin-ink">
            <input
              type="checkbox"
              data-pos-counted-together
              checked={Boolean(props.countedTogether)}
              disabled={!props.onCountedTogetherChange}
              onChange={(e) => props.onCountedTogetherChange?.(e.target.checked)}
              className="h-5 w-5 rounded-md accent-admin-brand"
            />
            {copy.countedTogether}
          </label>
          <p className="m-0 mt-2 text-[14px] text-admin-ink-muted">{copy.handOverNote}</p>
          <button
            type="button"
            data-pos-handover
            disabled={!handOverName || props.busy}
            onClick={() => props.onViewChange("close")}
            className={cn(POS_OUTLINE_ACTION, "mt-3 w-full")}
          >
            {interpolate(copy.handOverAction, { name: handOverName ?? "…" })}
          </button>
        </div>
        <div className="flex-1" />
        <button type="button" data-pos-close-and-count onClick={() => props.onViewChange("close")} className={cn(POS_PRIMARY_ACTION, "w-full")}>
          {copy.closeAndCount}
        </button>
      </div>
    </div>
  );
}
