"use client";

/**
 * MergeChecksSheet — T16 `POSMergeChecks`: `Merge another check into T05` /
 * `One bill for two tables`, one radio row per other seated table with an
 * open check (`T06 · Pérez's friends · $380`), the facts card (responsible,
 * this check, the other check, one check, deposits / payments), `Back` and
 * `Merge · one check for {party} · {amount}`.
 *
 * WIRED to the engine's `visit_merge_checks`: the other table's lines move
 * onto this table's check and its own order is cancelled; a check with a
 * payment on it is refused (`lines_paid`), one mid-collection as `conflict`.
 * The other party stays seated on its table with no check.
 */

import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { seatedEntryFor, tableCode } from "./floor-model";
import { FACT_ROW } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";
import { moneyFor } from "./FloorViews";

export type MergeChecksSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly table: FloorTable;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onBack: () => void;
  readonly onMerge: (from: FloorTable) => void;
};

function partyOf(table: FloorTable, data: FloorBoardData, copy: FloorBoardCopy): string {
  const entry = seatedEntryFor(table, data.book);
  const size = table.partySize ?? entry?.partySize ?? null;
  return [entry?.holderName ?? copy.panel.walkIn, size == null ? null : String(size)].filter(Boolean).join(" · ");
}

export function MergeChecksSheet(props: MergeChecksSheetProps) {
  const { data, copy, table, busy } = props;
  const m = copy.engine.merge;
  const [choice, setChoice] = useState<string | null>(null);
  const code = tableCode(table);
  const party = partyOf(table, data, copy);
  const candidates = data.tables.filter((t) => t.spaceId !== table.spaceId && t.state === "occupied" && t.orderId && !t.joinedFromSpaceId && t.visitId !== table.visitId);
  const chosen = candidates.find((t) => t.spaceId === choice) ?? null;
  const currency = table.orderId ? (data.currencies[table.orderId] ?? "USD") : "USD";
  const sum = (a: FloorTable, b: FloorTable | null) => a.orderTotalCents + (b?.orderTotalCents ?? 0);
  const money = (cents: number) => formatOrderMoney(cents, currency);

  return (
    <PosSheet
      open={props.open}
      name="merge-checks"
      crumb={interpolate(m.crumb, { code })}
      title={interpolate(m.title, { code })}
      subtitle={m.subtitle}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onBack}>
          {m.back}
        </button>
      }
      footerEnd={
        <button type="button" data-floor-merge-confirm className={POS_PRIMARY_ACTION} disabled={busy || !chosen} onClick={() => chosen && props.onMerge(chosen)}>
          {interpolate(m.confirm, { party: party || code, amount: money(sum(table, chosen)) })}
        </button>
      }
    >
      {candidates.length === 0 ? (
        <p role="status" data-floor-merge-none className="m-0 text-[15px] text-admin-ink-muted">
          {m.none}
        </p>
      ) : (
        <ul role="radiogroup" className="m-0 flex list-none flex-col gap-3 p-0">
          {candidates.map((other) => {
            const active = chosen?.spaceId === other.spaceId;
            return (
              <li key={other.spaceId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-floor-merge-from={tableCode(other)}
                  disabled={busy}
                  onClick={() => setChoice(other.spaceId)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[16px] border-[1.5px] px-4 py-3.5 text-left transition-colors",
                    active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                  )}
                >
                  <span aria-hidden className={cn("mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-admin-brand bg-admin-brand" : "border-admin-border-strong bg-admin-card")}>
                    {active && <span className="h-2 w-2 rounded-full bg-admin-card" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold text-admin-ink">
                      {interpolate(m.row, { code: tableCode(other), party: partyOf(other, data, copy) || copy.panel.walkIn, amount: moneyFor(other, data) })}
                    </span>
                    <span className="block text-[14px] text-admin-ink-muted">{m.rowHint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-1">
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{m.responsible}</span>
          <strong className="text-right text-admin-ink">{interpolate(m.responsibleValue, { party: party || copy.panel.walkIn, code })}</strong>
        </div>
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{interpolate(m.thisCheck, { code })}</span>
          <strong className="text-right tabular-nums text-admin-ink">{moneyFor(table, data)}</strong>
        </div>
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{interpolate(m.otherCheck, { code: chosen ? tableCode(chosen) : "…" })}</span>
          <strong className="text-right tabular-nums text-admin-ink">{chosen ? moneyFor(chosen, data) : "—"}</strong>
        </div>
        <div className={FACT_ROW}>
          <span className="font-bold text-admin-ink">{m.oneCheck}</span>
          <strong className="text-right tabular-nums text-admin-ink" data-floor-merge-total>
            {money(sum(table, chosen))}
          </strong>
        </div>
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{m.payments}</span>
          <strong className="text-right text-admin-ink">{m.paymentsValue}</strong>
        </div>
      </div>
    </PosSheet>
  );
}
