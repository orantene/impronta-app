"use client";

import { Card } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { IntegrationView } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";

import { resolveIntegrationStatus } from "./integration-status";
import { IntegrationStatusPill } from "./IntegrationStatusPill";

/**
 * One integration row in the hub. Clicking opens the config drawer. Shows the
 * label, a one-line description, the resolved status pill, and a configured
 * summary (masked secret last4 or the public id value) when present.
 */
export function IntegrationCard({
  integration,
  onOpen,
}: {
  integration: IntegrationView;
  onOpen: () => void;
}) {
  const visual = resolveIntegrationStatus(integration);

  // A compact one-line summary of what's configured (no full secrets — last4
  // only). Falls back to the description when nothing is set yet.
  const configuredField = integration.fields.find(
    (f) => (f.secret && f.secretPresent) || (!f.secret && f.value),
  );
  const summary = configuredField
    ? configuredField.secret
      ? `${configuredField.label} ····${configuredField.secretLast4 ?? ""}`
      : `${configuredField.label}: ${configuredField.value}`
    : integration.description;

  return (
    <Card
      interactive
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        marginBottom: 8,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
          {integration.label}
        </div>
        <div
          style={{
            fontSize: 12,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <IntegrationStatusPill visual={visual} />
        <span aria-hidden style={{ color: COLORS.inkDim, display: "inline-flex" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Card>
  );
}
