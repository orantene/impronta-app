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

"use client";

import type { ReactNode } from "react";

import { CHROME } from "./tokens";
import { useEditorLocale } from "../use-editor-locale";
// Direct file import, NOT the inspectors/kit barrel — a barrel import here
// would close a module cycle (kit → inspectors/kit barrel → … → kit) of the
// exact TDZ-at-chunk-eval shape that took prod admin down once already.
import { InspectorInfoTip } from "../inspectors/kit/inspector-info-tip";

/** WAVE 4.4 translation boundary: plain-string children resolve through the
 *  shared editor catalog; nodes and interpolated values pass through. */
function useNodeT(): (node: ReactNode) => ReactNode {
  const { t } = useEditorLocale();
  return (node) => (typeof node === "string" ? t(node) : node);
}

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
  /**
   * Explanation behind an ⓘ after the label text. This is where former
   * `<Helper>` paragraphs go: the copy is unchanged, it just waits to be
   * asked for (hover / focus / tap) instead of standing in the panel.
   * Keep `<Helper>` only for what must be read before acting: warnings,
   * live state, counters, and the reason a control is disabled.
   */
  info?: ReactNode;
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
  info,
  meta,
  breakpoint,
  className,
  htmlFor,
  children,
}: FieldLabelProps) {
  const tn = useNodeT();
  return (
    <label
      htmlFor={htmlFor}
      className={`flex items-center gap-1.5 ${className ?? ""}`}
      style={{
        // 2026-04-29 — Labels use warm stone tone, not ink-black.
        // Reads as "editorial field label," not "bold black heading
        // competing with the section title."
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        color: "#57534e", // stone-600 — warm, not cold zinc
        marginBottom: 6,
      }}
    >
      {tn(children)}
      {info ? (
        <InspectorInfoTip
          content={info}
          title={typeof children === "string" ? children : undefined}
        />
      ) : null}
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
          className="ml-auto"
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: CHROME.muted,
            letterSpacing: 0,
          }}
        >
          {meta}
        </span>
      ) : null}
      {breakpoint ? (
        <span
          className="ml-auto inline-flex items-center gap-1"
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0,
            color: CHROME.blue,
            background: CHROME.blueBg,
            border: `1px solid ${CHROME.blueLine}`,
            borderRadius: 999,
            padding: "2px 7px",
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
  const tn = useNodeT();
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
      {tn(children)}
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
