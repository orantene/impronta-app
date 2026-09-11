"use client";

/**
 * CounterSheets — the sale's overlays, wired: the line editor, the discount
 * sheet, hold and hold-expired. One of them is open at a time (`open`); the
 * page owns which, and every write goes back up through the callbacks. The
 * custom amount, its manager approval, the booking link and the tip live in
 * `counter-engine.tsx`, beside the engine calls they make.
 *
 * Local state here is only what a sheet needs to draw itself between taps
 * (the discount tab and code). Nothing is fetched and nothing is written
 * from this file.
 */

import { useState } from "react";

import {
  DiscountSheet,
  HoldExpiredDialog,
  HoldSaleDialog,
  LineEditSheet,
  type DiscountSheetCopy,
  type DiscountTab,
  type HoldExpiredChoice,
  type HoldExpiredCopy,
  type HoldSaleCopy,
  type LineEditCopy,
  type PosBasketLine,
} from "@/components/admin/pos";

export type CounterSheet =
  | { kind: "line"; lineId: string }
  | { kind: "discount" }
  | { kind: "hold" }
  | { kind: "expired"; lineId: string };

export type CounterSheetsProps = {
  readonly open: CounterSheet | null;
  readonly onChange: (next: CounterSheet | null) => void;
  readonly lines: readonly PosBasketLine[];
  readonly currency: string;
  readonly saleReference: string;
  readonly totalCents: number;
  readonly discountCents: number;
  readonly busy: boolean;
  /** The last discount apply's refusal, or null. Cleared by the page on the next apply. */
  readonly discountRefused: null | "notCombinable" | "refused";
  readonly onSaveLine: (lineId: string, units: number) => void;
  readonly onDuplicateLine: (lineId: string) => void;
  readonly onRemoveLine: (lineId: string) => void;
  readonly onApplyCode: (code: string) => void;
  readonly onRemoveCode: () => void;
  readonly onDiscard: () => void;
  readonly onHold: () => void;
  readonly onPickAnotherSession: (lineId: string) => void;
  readonly copy: {
    readonly line: LineEditCopy;
    readonly discount: DiscountSheetCopy;
    readonly hold: HoldSaleCopy;
    readonly expired: HoldExpiredCopy;
  };
};

export function CounterSheets(props: CounterSheetsProps) {
  const { open, onChange, copy } = props;
  const close = () => onChange(null);

  const [discountTab, setDiscountTab] = useState<DiscountTab>("code");
  const [code, setCode] = useState("");
  const [expiredChoice, setExpiredChoice] = useState<HoldExpiredChoice>("remove");

  const lineFor = (lineId: string) => props.lines.find((line) => line.id === lineId) ?? null;

  return (
    <>
      {open?.kind === "line" && (
        <LineEditSheet
          key={open.lineId}
          line={lineFor(open.lineId)}
          currency={props.currency}
          onClose={close}
          onSave={(lineId, units) => {
            props.onSaveLine(lineId, units);
            close();
          }}
          onDuplicate={(lineId) => {
            props.onDuplicateLine(lineId);
            close();
          }}
          onRemove={(lineId) => {
            props.onRemoveLine(lineId);
            close();
          }}
          busy={props.busy}
          copy={copy.line}
        />
      )}
      <DiscountSheet
        open={open?.kind === "discount"}
        onClose={close}
        tab={discountTab}
        onTabChange={setDiscountTab}
        lines={props.lines}
        currency={props.currency}
        discountCents={props.discountCents}
        code={code}
        onCodeChange={setCode}
        onApply={() => props.onApplyCode(code.trim())}
        onRemoveCode={() => {
          setCode("");
          props.onRemoveCode();
        }}
        applying={props.busy}
        refused={props.discountRefused}
        copy={copy.discount}
      />
      <HoldSaleDialog
        open={open?.kind === "hold"}
        onClose={close}
        saleNumber={props.saleReference}
        totalCents={props.totalCents}
        currency={props.currency}
        lines={props.lines}
        onDiscard={() => {
          props.onDiscard();
          close();
        }}
        onHold={() => {
          props.onHold();
          close();
        }}
        busy={props.busy}
        copy={copy.hold}
      />
      {open?.kind === "expired" && (
        <HoldExpiredDialog
          open
          onClose={close}
          line={lineFor(open.lineId)}
          currency={props.currency}
          totalCents={props.totalCents}
          choice={expiredChoice}
          onChoiceChange={setExpiredChoice}
          onRemove={(lineId) => {
            props.onRemoveLine(lineId);
            close();
          }}
          onPickAnother={(lineId) => {
            props.onPickAnotherSession(lineId);
            close();
          }}
          busy={props.busy}
          copy={copy.expired}
        />
      )}
    </>
  );
}
