import type { ReactElement, ReactNode } from "react";
import { cloneElement } from "react";

/**
 * Disabled-CTA inline reason wrapper (G.10).
 *
 * Wraps a button (or other interactive element) with a tooltip-style
 * reason when it's disabled, so users aren't left wondering why a CTA
 * doesn't respond. Uses the native `title` attribute (universally
 * supported, screen-reader-readable) plus visible cursor styling.
 *
 * The child must be a single element that accepts `disabled`, `title`,
 * `aria-disabled`, `aria-describedby`, and `style` props. Common cases:
 * <button>, <a>, custom buttons that forward props.
 *
 * If `reason` is null/empty, the wrapper is a no-op pass-through.
 *
 * Example:
 *   <DisabledReason reason="Save your draft first">
 *     <button disabled={!saved}>Publish</button>
 *   </DisabledReason>
 */
export function DisabledReason({
  reason,
  children,
}: {
  reason: string | null | undefined;
  children: ReactElement<{
    disabled?: boolean;
    title?: string;
    "aria-disabled"?: boolean;
    "aria-describedby"?: string;
    style?: React.CSSProperties;
  }>;
}): ReactNode {
  if (!reason) return children;

  const existingTitle = children.props.title;
  const mergedTitle = existingTitle ? `${existingTitle} · ${reason}` : reason;
  const existingStyle = children.props.style ?? {};

  return cloneElement(children, {
    title: mergedTitle,
    "aria-disabled": true,
    style: {
      ...existingStyle,
      cursor: existingStyle.cursor ?? "not-allowed",
    },
  });
}

/**
 * Compose multiple disable reasons into a single sentence. Skips empties
 * and joins with " · ". Use when several gates may apply.
 *
 *   composeDisabledReason([
 *     !connected && "Connect your account first",
 *     !saved && "Save your draft first",
 *   ])
 */
export function composeDisabledReason(reasons: Array<string | false | null | undefined>): string | null {
  const filtered = reasons.filter((r): r is string => typeof r === "string" && r.trim().length > 0);
  if (filtered.length === 0) return null;
  return filtered.join(" · ");
}
