"use client";

/**
 * ScanScreen — C23, `POSScan`: the big scan glyph, `Scan a code` /
 * `Product, ticket, pass or order number`, the `Anything · Products only ·
 * Tickets only · Passes only` filter, and on the right `TYPE IT INSTEAD`
 * with a code box, a keypad (`ABC` swaps to the keyboard) and `Look up`.
 *
 * `Look up` hands the typed code to the caller, who resolves it exactly as a
 * wedge scan is resolved (`posResolveScanCode`). The filter has no effect on
 * that resolver (a code is an offering id or a link code, D-POS-13), so the
 * three narrow options are disabled with a sentence (D-POS-30).
 */

import { Scan } from "lucide-react";
import { useId } from "react";

import { cn } from "@/lib/utils";
import { PosKeypad } from "./PosKeypad";
import { POS_EYEBROW, POS_INPUT, POS_OUTLINE_ACTION, POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK } from "./pos-classes";

export type ScanScreenCopy = {
  readonly title: string;
  /** `Ready · scanner listening` */
  readonly ready: string;
  readonly heading: string;
  readonly hint: string;
  readonly anything: string;
  readonly productsOnly: string;
  readonly ticketsOnly: string;
  readonly passesOnly: string;
  readonly filterUnavailable: string;
  readonly typeInstead: string;
  readonly placeholder: string;
  readonly lookUp: string;
  readonly keypadBack: string;
};

export type ScanScreenProps = {
  readonly code: string;
  readonly onCodeChange: (value: string) => void;
  readonly onLookUp: () => void;
  readonly busy?: boolean;
  readonly copy: ScanScreenCopy;
};

export function ScanScreen({ code, onCodeChange, onLookUp, busy, copy }: ScanScreenProps) {
  const inputId = useId();
  const onKey = (key: string) => {
    if (key === "back") onCodeChange(code.slice(0, -1));
    else if (key === "abc") document.getElementById(inputId)?.focus();
    else onCodeChange(code + key);
  };
  return (
    <div data-pos-scan className="grid min-h-0 flex-1 grid-cols-[1fr_420px] overflow-hidden">
      <div className="flex min-h-0 flex-col items-center justify-center gap-4 border-r border-admin-border px-6 py-6 text-center">
        <span className="inline-flex h-[120px] w-[120px] items-center justify-center rounded-full bg-admin-surface-alt text-admin-brand">
          <Scan aria-hidden size={44} strokeWidth={1.75} />
        </span>
        <p className="m-0 text-[24px] font-bold tracking-[-0.02em] text-admin-ink">{copy.heading}</p>
        <p className="m-0 text-[16px] text-admin-ink-muted">{copy.hint}</p>
        <div className={POS_SEGMENT_TRACK} role="group" aria-label={copy.anything}>
          <span className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", POS_SEGMENT_ACTIVE)}>{copy.anything}</span>
          {[copy.productsOnly, copy.ticketsOnly, copy.passesOnly].map((label) => (
            <button key={label} type="button" disabled title={copy.filterUnavailable} className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", POS_SEGMENT_IDLE)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <form
        className="flex min-h-0 flex-col bg-admin-card px-5 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim()) onLookUp();
        }}
      >
        <p className={cn(POS_EYEBROW, "m-0 mb-3")}>{copy.typeInstead}</p>
        <label className="sr-only" htmlFor={inputId}>
          {copy.typeInstead}
        </label>
        <input
          id={inputId}
          data-pos-scan-input
          className={cn(POS_INPUT, "font-mono")}
          placeholder={copy.placeholder}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <PosKeypad className="mt-3.5" onKey={onKey} corner="abc" backLabel={copy.keypadBack} />
        <div className="flex-1" />
        <button type="submit" data-pos-scan-lookup disabled={busy || code.trim().length === 0} className={cn(POS_OUTLINE_ACTION, "h-14 w-full")}>
          {copy.lookUp}
        </button>
      </form>
    </div>
  );
}
