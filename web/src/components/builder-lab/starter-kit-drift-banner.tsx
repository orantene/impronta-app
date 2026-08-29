"use client";

/**
 * StarterKitDriftBanner — the "your built-in starters are out of date" warning
 * that sits next to the "Sync built-in starters" action.
 *
 * The 11 published built-in rows are a mechanical import of the code registry
 * `PAGE_DESIGNS`. Nothing re-runs that import, and nothing said so: the rows all
 * still read `published`, so pointing the platform Default Storefront at one
 * shipped known-old content to every new tenant, and the only remedy (pressing
 * Sync) was tribal knowledge. This banner is that knowledge, on screen.
 *
 * It names the rows rather than only counting them, because "3 starters are out
 * of date" without saying WHICH is a prompt to press Sync blindly.
 */

import type {
  BuiltinStarterDriftEntry,
  BuiltinStarterDriftReport,
} from "@/lib/site-admin/builder-core/templates/builtin-starter-hash";
import { driftHeadline } from "@/lib/site-admin/builder-core/templates/builtin-starter-hash";
import { LAB as T } from "./ui";

const STATE_LABEL: Record<BuiltinStarterDriftEntry["state"], string> = {
  in_sync: "up to date",
  stale: "content is older than the code design",
  unpublished: "imported but not published",
  missing: "never imported",
};

export function StarterKitDriftBanner({
  report,
  loading,
}: {
  report: BuiltinStarterDriftReport | null;
  loading: boolean;
}) {
  if (loading || !report) return null;

  const outOfSync = report.entries.filter((e) => e.state !== "in_sync");
  if (outOfSync.length === 0) {
    return (
      <div
        data-testid="lab-starter-drift-ok"
        style={{
          fontSize: 11.5,
          color: T.inkDim,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span aria-hidden>✓</span>
        {driftHeadline(report)}
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-testid="lab-starter-drift-banner"
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
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {driftHeadline(report)}
      </div>
      <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
        {outOfSync.map((entry) => (
          <li key={entry.slug} data-testid={`lab-starter-drift-row-${entry.slug}`}>
            <strong style={{ color: T.ink }}>{entry.label}</strong>{" "}
            <code style={{ color: T.inkMuted, fontSize: 10.5 }}>{entry.slug}</code>{" "}
            <span style={{ color: T.inkMuted }}>{STATE_LABEL[entry.state]}</span>
          </li>
        ))}
      </ul>
      <div style={{ color: T.inkMuted }}>
        Press <strong style={{ color: T.ink }}>Sync built-in starters</strong> to
        refresh them from the code designs before pointing a platform default at
        any of them.
      </div>
    </div>
  );
}
