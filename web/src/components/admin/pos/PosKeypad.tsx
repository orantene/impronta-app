"use client";

/**
 * PosKeypad — the 3x4 pad every money and PIN board draws: `7 8 9 / 4 5 6 /
 * 1 2 3 / 00 0 ⌫`. The bottom-left key is `00` on a money pad, blank on a
 * PIN pad, and `ABC` on the scan screen's pad (the caller says which). Keys
 * are 64px tall and named by their own glyph, so a test can press "5".
 *
 * The pad emits key strings only (`"7"`, `"00"`, `"back"`, `"abc"`); what a
 * key means is the caller's arithmetic (`keypadNext` in `counter-model.ts`).
 */

import { Delete } from "lucide-react";

import { cn } from "@/lib/utils";
import { POS_KEY } from "./pos-classes";

export type PosKeypadProps = {
  readonly onKey: (key: string) => void;
  readonly corner?: "double-zero" | "blank" | "abc";
  readonly backLabel: string;
  readonly disabled?: boolean;
  readonly className?: string;
};

const ROWS: readonly (readonly string[])[] = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

export function PosKeypad({ onKey, corner = "double-zero", backLabel, disabled, className }: PosKeypadProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-2.5", className)} data-pos-keypad>
      {ROWS.flat().map((key) => (
        <button key={key} type="button" disabled={disabled} onClick={() => onKey(key)} className={POS_KEY}>
          {key}
        </button>
      ))}
      {corner === "blank" ? (
        <span aria-hidden className={cn(POS_KEY, "pointer-events-none")} />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onKey(corner === "abc" ? "abc" : "00")}
          className={cn(POS_KEY, corner === "abc" && "text-[22px]")}
        >
          {corner === "abc" ? "ABC" : "00"}
        </button>
      )}
      <button type="button" disabled={disabled} onClick={() => onKey("0")} className={POS_KEY}>
        0
      </button>
      <button type="button" disabled={disabled} aria-label={backLabel} onClick={() => onKey("back")} className={POS_KEY}>
        <Delete aria-hidden size={24} strokeWidth={1.75} />
      </button>
    </div>
  );
}
