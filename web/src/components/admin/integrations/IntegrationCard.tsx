"use client";

import { Card } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { IntegrationView } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";

import { resolveIntegrationStatus } from "./integration-status";
import { IntegrationStatusPill } from "./IntegrationStatusPill";
import { IntegrationLogo } from "./integration-logos";

/**
 * One integration tile in the hub gallery. Leads with the brand logo so the
 * catalog scans like an integration directory. Clicking opens the config
 * drawer. Shows the name, a one-line summary (the configured value — masked
 * last4 for secrets — or the purpose blurb), and the resolved status pill.
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
  // only). Falls back to the purpose description when nothing is set yet.
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
        alignItems: "flex-start",
        gap: 12,
        padding: 14,
        height: "100%",
        fontFamily: FONTS.body,
      }}
    >
      <IntegrationLogo integrationKey={integration.key} size={38} style={{ marginTop: 1 }} />

      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {integration.label}
          </span>
          <span aria-hidden style={{ color: COLORS.inkDim, display: "inline-flex", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        <div
          style={{
            fontSize: 12,
            color: COLORS.inkMuted,
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </div>

        <div style={{ marginTop: 2 }}>
          <IntegrationStatusPill visual={visual} />
        </div>
      </div>
    </Card>
  );
}
