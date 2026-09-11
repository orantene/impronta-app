"use client";

/**
 * SplitCheckSheet — T18 `POSSplitCheck`, the `By items` half: the table's
 * checks side by side (`Check A · seats 1–2 · Unpaid`, its lines with a
 * checkbox each, `Items` and `Remaining`), `N items selected · $x` and
 * `Move selected to a new check`, and `Collect check A · $x` on the first.
 *
 * WIRED to the engine's `visit_split_check`: the ticked lines of a check
 * move onto a NEW draft order on the same visit (D-POS-67), so the table
 * then owns two checks and each can be collected on the counter on its
 * own. A check with a payment on it refuses (`lines_paid`). `By seat`,
 * `Evenly` and `Amounts` are not modelled and are not drawn as live tabs.
 *
 * The lines are read when the sheet opens (`loadCheckLines`, the counter's
 * own `posLoadSale`), one check at a time, so the figures are the order's.
 */

import { useEffect, useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_PILL, POS_PILL_CORAL, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { seatedEntryFor, tableCode } from "./floor-model";
import type { FloorBoardData, FloorCheckLine, FloorCheckLinesResult } from "./floor-types";

export type SplitCheckSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly table: FloorTable;
  readonly busy: boolean;
  readonly loadLines: (orderId: string) => Promise<FloorCheckLinesResult>;
  readonly checkHref: (orderId: string) => string;
  readonly onClose: () => void;
  readonly onSplit: (lineIds: string[]) => void;
};

type Loaded = { status: "loading" } | { status: "unreadable" } | { status: "ready"; currency: string; lines: FloorCheckLine[] };

const LETTERS = "ABCDEFGH";

export function SplitCheckSheet(props: SplitCheckSheetProps) {
  const { data, copy, table, busy, loadLines } = props;
  const s = copy.engine.split;
  const [checks, setChecks] = useState<Record<string, Loaded>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const code = tableCode(table);
  const entry = seatedEntryFor(table, data.book);
  const party = entry?.holderName ?? copy.panel.walkIn;
  // `table` is the overlay's own snapshot, so its `orderIds` array is one
  // reference for the life of the sheet and the read runs once per open.
  const orderIds = table.orderIds;

  useEffect(() => {
    let cancelled = false;
    setChecks(Object.fromEntries(orderIds.map((id) => [id, { status: "loading" as const }])));
    setPicked(new Set());
    for (const orderId of orderIds) {
      void loadLines(orderId).then((r) => {
        if (cancelled) return;
        setChecks((current) => ({ ...current, [orderId]: r.ok ? { status: "ready", currency: r.currency, lines: r.lines } : { status: "unreadable" } }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [orderIds, loadLines]);

  const first = orderIds[0] ?? null;
  const firstLoaded = first ? checks[first] : undefined;
  const currency = firstLoaded?.status === "ready" ? firstLoaded.currency : (first ? (data.currencies[first] ?? "USD") : "USD");
  const money = (cents: number) => formatOrderMoney(cents, currency);
  const totalOf = (loaded: Loaded | undefined) => (loaded?.status === "ready" ? loaded.lines.reduce((n, l) => n + l.totalCents, 0) : 0);
  const pickedCents = first && firstLoaded?.status === "ready" ? firstLoaded.lines.filter((l) => picked.has(l.id)).reduce((n, l) => n + l.totalCents, 0) : 0;
  const firstLineCount = firstLoaded?.status === "ready" ? firstLoaded.lines.length : 0;
  const canSplit = picked.size > 0 && picked.size < firstLineCount && !busy;

  return (
    <PosSheet
      open={props.open}
      name="split-check"
      title={interpolate(s.title, { code, party })}
      subtitle={interpolate(s.subtitle, { amount: money(orderIds.reduce((n, id) => n + totalOf(checks[id]), 0)) })}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
          {s.back}
        </button>
      }
      footerEnd={
        <>
          <button type="button" data-floor-split-confirm className={POS_SECONDARY_ACTION} disabled={!canSplit} onClick={() => props.onSplit([...picked])}>
            {busy ? s.moving : s.moveToNew}
          </button>
          {first && (
            <a href={props.checkHref(first)} data-floor-split-collect className={POS_PRIMARY_ACTION}>
              {interpolate(s.collect, { letter: LETTERS[0], amount: money(totalOf(firstLoaded)) })}
            </a>
          )}
        </>
      }
    >
      <p className="m-0 mb-3 text-[14px] font-semibold text-admin-ink" data-floor-split-selected>
        {interpolate(s.selected, { n: picked.size, amount: money(pickedCents) })}
      </p>
      <div className={cn("grid gap-3", orderIds.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {orderIds.map((orderId, index) => {
          const loaded = checks[orderId];
          const editable = index === 0;
          return (
            <section key={orderId} data-floor-check={orderId} className="flex min-h-[260px] flex-col overflow-hidden rounded-[14px] border-[1.5px] border-admin-border bg-admin-card">
              <header className="flex items-center justify-between gap-2 border-b border-admin-border-soft px-4 py-3">
                <strong className="text-[16px] text-admin-ink">{interpolate(s.check, { letter: LETTERS[index] ?? String(index + 1) })}</strong>
                <span className={cn(POS_PILL, POS_PILL_CORAL)}>{s.unpaid}</span>
              </header>
              {!loaded || loaded.status === "loading" ? (
                <p className="m-0 px-4 py-4 text-[14px] text-admin-ink-muted">{s.loading}</p>
              ) : loaded.status === "unreadable" ? (
                <p role="alert" className="m-0 px-4 py-4 text-[14px] text-admin-red">
                  {s.unreadable}
                </p>
              ) : loaded.lines.length === 0 ? (
                <p className="m-0 px-4 py-4 text-[14px] text-admin-ink-muted">{s.empty}</p>
              ) : (
                <ul className="m-0 flex-1 list-none p-0">
                  {loaded.lines.map((line) => {
                    const on = picked.has(line.id);
                    return (
                      <li key={line.id} className="border-b border-admin-border-soft last:border-b-0">
                        <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-3", on && "bg-admin-brand-soft", !editable && "cursor-default")}>
                          <input
                            type="checkbox"
                            data-floor-split-line={line.id}
                            className="h-5 w-5 rounded-md accent-admin-brand"
                            checked={on}
                            disabled={!editable || busy}
                            onChange={(e) =>
                              setPicked((current) => {
                                const next = new Set(current);
                                if (e.target.checked) next.add(line.id);
                                else next.delete(line.id);
                                return next;
                              })
                            }
                          />
                          <span className="w-6 text-[15px] tabular-nums text-admin-ink-muted">{line.units}</span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-admin-ink">{line.label}</span>
                          <span className="tabular-nums text-[15px] font-semibold text-admin-ink">{formatOrderMoney(line.totalCents, loaded.currency)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <footer className="mt-auto border-t border-admin-border-soft px-4 py-2">
                <div className="flex justify-between py-1 text-[14px]">
                  <span className="text-admin-ink-muted">{s.items}</span>
                  <span className="tabular-nums font-semibold text-admin-ink">{money(totalOf(loaded))}</span>
                </div>
                <div className="flex justify-between py-1 text-[15px]">
                  <strong className="text-admin-ink">{s.remaining}</strong>
                  <strong className="tabular-nums text-admin-ink">{money(totalOf(loaded))}</strong>
                </div>
              </footer>
            </section>
          );
        })}
      </div>
      <p className="m-0 mt-3 text-[13px] text-admin-ink-muted">{s.note}</p>
    </PosSheet>
  );
}
