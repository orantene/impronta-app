"use client";

/**
 * StarterDefaultCell — the per-row "Set as platform default" affordance in the
 * Site Starter Kit table, plus the badges that say what the row currently is.
 *
 * Why the action lives HERE and not only on the Default surfaces panel: the
 * platform Default Storefront pointer had never been set, and one reason is
 * that claiming the slot required knowing to leave the tab you are browsing
 * starters on and open a different tier-2 view. The operator is looking at the
 * candidate right now; let them claim it right now.
 *
 * There is no second writer: this calls the same
 * `savePlatformDefaultTemplatePointerAction` the Default surfaces panel calls,
 * via `usePlatformDefaultPointer`.
 */

import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import { LAB as T, LabBadge, LinkBtn } from "./ui";

export function StarterDefaultCell({
  row,
  isDefault,
  isStale,
  saving,
  onSetDefault,
}: {
  row: BuilderTemplateRow;
  isDefault: boolean;
  /** The published row's tree no longer matches its code design. */
  isStale: boolean;
  saving: boolean;
  onSetDefault: (row: BuilderTemplateRow) => void;
}) {
  if (isDefault) {
    return (
      <span
        data-testid={`lab-starter-is-default-${row.id}`}
        style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
      >
        <LabBadge tone="accent">Platform default</LabBadge>
        {isStale ? (
          <LabBadge tone="custom" bg={T.redBg} fg={T.red}>
            Out of date
          </LabBadge>
        ) : null}
      </span>
    );
  }

  // Only a PUBLISHED row can be a default: the render path filters on
  // status=published, so pointing at a draft silently falls through to the
  // reserved slug. Say that rather than offering a button that does nothing.
  if (row.status !== "published") {
    return (
      <span style={{ fontSize: 10.5, color: T.inkDim }}>
        Publish it first to use it as the platform default
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <LinkBtn
        label={saving ? "Setting…" : "Set as platform default"}
        testId={`lab-starter-set-default-${row.id}`}
        onClick={() => onSetDefault(row)}
        disabled={saving}
        primary
      />
      {isStale ? (
        <LabBadge tone="custom" bg={T.redBg} fg={T.red}>
          Out of date
        </LabBadge>
      ) : null}
    </span>
  );
}
