"use client";

/**
 * Field, FieldLabel, Helper, HelperCounter — composable form-row primitives.
 *
 * The pattern: a `<Field>` wraps a label + input + helper line. The label
 * carries optional `required` and `meta` slots. The helper line uses a
 * flex layout so the left side is freeform copy and the right is a
 * tabular-numerals counter.
 *
 * Visual rules (from mockup `.field`, `.field-label`, `.helper`):
 *   - Label: 10.5px caps, 0.06em tracking, weight 700, --text-2 colour.
 *   - Required: red dot to the left.
 *   - Meta: small caption-tone text on the right of the label row.
 *   - Helper: 11px, --muted, flex justify-between.
 *   - Helper warn variant: --amber colour.
 *   - HelperCounter: 10.5px, tabular-nums, --muted-2.
 *
 * The actual `<input>` / `<textarea>` styling comes from the inputs
 * primitive (KIT.input / KIT.inputLg / KIT.textarea in
 * `inspectors/kit/tokens.ts`) — these wrappers don't render inputs
 * themselves, just the surrounding form-row scaffolding.
 */

import type { ReactNode } from "react";

import { CHROME } from "./tokens";

interface FieldProps {
  className?: string;
  /** Disable the bottom margin (used at the end of a card body). */
  flush?: boolean;
  children: ReactNode;
}

export function Field({ className, flush = false, children }: FieldProps) {
  return (
    <div
      className={`flex flex-col ${className ?? ""}`}
      style={{ marginBottom: flush ? 0 : 12 }}
    >
      {children}
    </div>
  );
}

interface FieldLabelProps {
  /** Marks the field with a small red required indicator. */
  required?: boolean;
  /** Right-aligned caption-tone meta text. */
  meta?: ReactNode;
  /**
   * Active-breakpoint indicator (used by the Responsive tab) — renders
   * a small blue pill on the right with the breakpoint name.
   */
  breakpoint?: "Desktop" | "Tablet" | "Mobile";
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function FieldLabel({
  required = false,
  meta,
  breakpoint,
  className,
  htmlFor,
  children,
}: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`flex items-center gap-1.5 uppercase ${className ?? ""}`}
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: CHROME.text2,
        marginBottom: 6,
      }}
    >
      {children}
      {required ? (
        <span
          aria-hidden
          style={{ color: CHROME.rose, fontWeight: 700 }}
          title="Required"
        >
          ·
        </span>
      ) : null}
      {meta ? (
        <span
          className="ml-auto normal-case"
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: CHROME.muted2,
            letterSpacing: 0,
          }}
        >
          {meta}
        </span>
      ) : null}
      {breakpoint ? (
        <span
          className="ml-auto inline-flex items-center gap-1 uppercase"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: CHROME.blue,
            background: CHROME.blueBg,
            border: `1px solid ${CHROME.blueLine}`,
            borderRadius: 999,
            padding: "2px 6px",
          }}
        >
          {breakpoint}
        </span>
      ) : null}
    </label>
  );
}

interface HelperProps {
  /** Switches color to amber for soft-warn copy. */
  warn?: boolean;
  /** Switches color to a status accent for live-edit / focused states. */
  tone?: "default" | "blue" | "green" | "amber" | "rose";
  className?: string;
  children: ReactNode;
}

export function Helper({
  warn = false,
  tone = "default",
  className,
  children,
}: HelperProps) {
  const color = warn
    ? CHROME.amber
    : tone === "blue"
      ? CHROME.blue
      : tone === "green"
        ? CHROME.green
        : tone === "amber"
          ? CHROME.amber
          : tone === "rose"
            ? CHROME.rose
            : CHROME.muted;
  return (
    <div
      className={`flex items-center justify-between ${className ?? ""}`}
      style={{
        marginTop: 5,
        fontSize: 11,
        lineHeight: 1.4,
        color,
      }}
    >
      {children}
    </div>
  );
}

interface HelperCounterProps {
  current: number;
  max: number;
  /** When true and current > max, switches to amber. Otherwise stays neutral. */
  warnAtMax?: boolean;
}

/**
 * Standalone character / item counter. Use as the right child of a Helper:
 *
 *   <Helper>
 *     <span>Quiet, considered. 4–8 words read best.</span>
 *     <HelperCounter current={26} max={140} />
 *   </Helper>
 */
export function HelperCounter({
  current,
  max,
  warnAtMax = true,
}: HelperCounterProps) {
  const over = warnAtMax && current > max;
  return (
    <span
      style={{
        fontSize: 10.5,
        fontVariantNumeric: "tabular-nums",
        color: over ? CHROME.amber : CHROME.muted2,
        fontWeight: over ? 600 : 500,
      }}
    >
      {current}/{max}
    </span>
  );
}
