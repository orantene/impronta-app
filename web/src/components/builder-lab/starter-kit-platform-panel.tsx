"use client";

/**
 * StarterKitPlatformPanel — the two platform-level truths the Site Starter Kit
 * tab was missing, rendered directly above the starter table:
 *
 *   1. BUILT-IN DRIFT. The published built-in rows are a manual import of the
 *      code designs and nothing re-runs it. `StarterKitDriftBanner` names the
 *      rows that have fallen behind.
 *   2. THE UNCLAIMED SLOT. `platform_settings.default_storefront_template_id`
 *      was NULL for months while the Default surfaces panel called that "Using
 *      the built-in default", which reads as a decision. It is not a decision:
 *      every new tenant falls back to the legacy seeded design. Said plainly,
 *      as a warning, right where the operator can claim the slot on a row.
 *
 * Presentational: all state comes from `useStarterKitPlatformState`.
 */

import type { StarterKitPlatformState } from "./use-lab-platform-defaults";
import { StarterKitDriftBanner } from "./starter-kit-drift-banner";
import { LAB as T } from "./ui";

/** The consequence sentence for an unset pointer, per surface. Concrete, because
 *  vagueness is exactly how the storefront slot stayed empty for months. */
function unsetWarning(surface: "talent" | "workspace"): string {
  return surface === "workspace"
    ? "No platform default storefront is set. Every workspace that has not published its own homepage falls back to the legacy seeded design, not to anything in this list. Pick a published starter below and press Set as platform default."
    : "No platform default talent profile is set. Talents without a published Max site fall back to the built-in code tree, not to anything in this list.";
}

export function StarterKitPlatformPanel({
  state,
  surface,
}: {
  state: StarterKitPlatformState;
  surface: "talent" | "workspace";
}) {
  const { drift, pointer } = state;
  const unset = !pointer.loading && pointer.pointerId === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <StarterKitDriftBanner report={drift.report} loading={drift.loading} />

      {unset ? (
        <div
          role="alert"
          data-testid={`lab-starter-default-unset-${surface}`}
          style={{
            fontSize: 12,
            color: T.red,
            background: T.redBg,
            border: `1px solid ${T.red}`,
            borderRadius: 8,
            padding: "10px 12px",
            lineHeight: 1.55,
          }}
        >
          <span style={{ fontWeight: 700 }}>Platform default not set. </span>
          {unsetWarning(surface)}
        </div>
      ) : null}

      {pointer.status ? (
        <div
          aria-live="polite"
          data-testid="lab-starter-default-status"
          style={{
            fontSize: 12,
            color: pointer.status.ok ? T.accent : T.red,
            background: pointer.status.ok ? T.accentSoft : T.redBg,
            border: `1px solid ${pointer.status.ok ? T.accent : T.red}`,
            borderRadius: 8,
            padding: "8px 12px",
            lineHeight: 1.5,
          }}
        >
          {pointer.status.msg}
        </div>
      ) : null}
    </div>
  );
}
