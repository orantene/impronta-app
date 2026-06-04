"use client";

import { Card } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { IntegrationView } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";

import { resolveIntegrationStatus } from "./integration-status";
import { IntegrationStatusPill } from "./IntegrationStatusPill";
import { IntegrationLogo } from "./integration-logos";

/**
 * One integration tile in the hub gallery. Leads with the brand logo so the
 * catalog scans like an integration directory.
 *
 * Two behaviours:
 *   - Credential-bearing integrations (manual/inherit/oauth) open the config
 *     drawer on click (`onOpen`).
 *   - Surfaced (`connection: 'link'`) integrations navigate to an existing
 *     in-app settings route (`integration.href`) — rendered as an <a>, no
 *     drawer.
 *
 * Shows the name, a one-line summary (the configured value — masked last4 for
 * secrets — or the purpose blurb), and the resolved status pill. Locked
 * (entitlement-gated) integrations show the locked pill.
 */
export function IntegrationCard({
  integration,
  onOpen,
}: {
  integration: IntegrationView;
  onOpen: () => void;
}) {
  const isLink = integration.connection === "link";
  const visual = resolveIntegrationStatus(integration, {
    locked: integration.locked,
  });

  // A compact one-line summary of what's configured (no full secrets — last4
  // only). Falls back to the purpose description when nothing is set yet.
  const configuredField = integration.fields.find(
    (f) => (f.secret && f.secretPresent) || (!f.secret && f.value),
  );
  const summary =
    isLink || !configuredField
      ? integration.description
      : configuredField.secret
        ? `${configuredField.label} ····${configuredField.secretLast4 ?? ""}`
        : `${configuredField.label}: ${configuredField.value}`;

  const cardInner = (
    <Card
      interactive
      onClick={isLink ? undefined : onOpen}
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

  // Surfaced (link) integrations navigate to an existing in-app route; wrap the
  // card body in an anchor. Credential integrations open the drawer via onClick.
  if (isLink && integration.href) {
    return (
      <a
        href={integration.href}
        style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
      >
        {cardInner}
      </a>
    );
  }
  return cardInner;
}
