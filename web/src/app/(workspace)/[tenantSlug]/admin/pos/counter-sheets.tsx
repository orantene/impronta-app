"use client";

/**
 * CounterSheets — the sale's overlays, wired: the line editor, the discount
 * sheet, the custom amount and its manager approval, hold and hold-expired,
 * and link-a-booking. One of them is open at a time (`open`); the page owns
 * which, and every write goes back up through the callbacks.
 *
 * Local state here is only what a sheet needs to draw itself between taps
 * (the discount tab and code, the custom amount's description and figure,
 * the PIN dots). Nothing is fetched and nothing is written from this file.
 */

import { useState } from "react";

import {
  CustomAmountSheet,
  DiscountSheet,
  HoldExpiredDialog,
  HoldSaleDialog,
  LineEditSheet,
  LinkBookingSheet,
  ManagerApprovalDialog,
  type CustomAmountCopy,
  type DiscountSheetCopy,
  type DiscountTab,
  type HoldExpiredChoice,
  type HoldExpiredCopy,
  type HoldSaleCopy,
  type LineEditCopy,
  type LinkBookingCopy,
  type PosBasketLine,
} from "@/components/admin/pos";

import { keypadNext } from "./counter-model";

export type CounterSheet =
  | { kind: "line"; lineId: string }
  | { kind: "discount" }
  | { kind: "custom" }
  | { kind: "approval" }
  | { kind: "hold" }
  | { kind: "expired"; lineId: string }
  | { kind: "booking" };

export type CounterSheetsProps = {
  readonly open: CounterSheet | null;
  readonly onChange: (next: CounterSheet | null) => void;
  readonly lines: readonly PosBasketLine[];
  readonly currency: string;
  readonly saleReference: string;
  readonly totalCents: number;
  readonly discountCents: number;
  readonly customerName: string | null;
  readonly cashierName: string;
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
    readonly custom: CustomAmountCopy;
    readonly hold: HoldSaleCopy;
    readonly expired: HoldExpiredCopy;
    readonly booking: LinkBookingCopy;
  };
};

export function CounterSheets(props: CounterSheetsProps) {
  const { open, onChange, copy } = props;
  const close = () => onChange(null);

  const [discountTab, setDiscountTab] = useState<DiscountTab>("code");
  const [code, setCode] = useState("");
  const [customWhat, setCustomWhat] = useState("");
  const [customCents, setCustomCents] = useState(0);
  const [pinLength, setPinLength] = useState(0);
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
      <CustomAmountSheet
        open={open?.kind === "custom"}
        onClose={close}
        currency={props.currency}
        description={customWhat}
        onDescriptionChange={setCustomWhat}
        amountCents={customCents}
        onKey={(key) => setCustomCents((current) => (key === "00" ? keypadNext(keypadNext(current, "0"), "0") : keypadNext(current, key)))}
        onContinue={() => {
          setPinLength(0);
          onChange({ kind: "approval" });
        }}
        copy={copy.custom}
      />
      <ManagerApprovalDialog
        open={open?.kind === "approval"}
        onClose={() => onChange({ kind: "custom" })}
        currency={props.currency}
        description={customWhat}
        amountCents={customCents}
        cashier={props.cashierName}
        pinLength={pinLength}
        onKey={(key) => setPinLength((n) => (key === "back" ? Math.max(0, n - 1) : Math.min(4, n + 1)))}
        copy={copy.custom}
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
      <LinkBookingSheet
        open={open?.kind === "booking"}
        onClose={close}
        customerName={props.customerName}
        saleTotalCents={props.totalCents}
        currency={props.currency}
        copy={copy.booking}
      />
    </>
  );
}
