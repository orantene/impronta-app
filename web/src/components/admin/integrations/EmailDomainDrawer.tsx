"use client";

import { useState } from "react";

import { DrawerShell, AsyncButton } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";
import type { IntegrationView } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";
import {
  saveEmailDomain,
  verifyEmailDomain,
} from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions-specialised";

import { resolveIntegrationStatus } from "./integration-status";
import { IntegrationStatusPill } from "./IntegrationStatusPill";

type Feedback = { tone: "success" | "error"; message: string } | null;

type DnsRecord = {
  record?: string;
  name?: string;
  type?: string;
  value?: string;
  ttl?: string;
  priority?: number;
  status?: string;
};

function readDnsRecords(config: Record<string, unknown>): DnsRecord[] {
  const raw = config.dns_records;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is DnsRecord => !!r && typeof r === "object");
}

/**
 * Email-domain drawer — add a white-label sending domain, then show the DNS
 * records to add and a Verify button that polls Resend for verification.
 * Entitlement-gated (white_label_email): locked → read-only + upgrade prompt.
 */
export function EmailDomainDrawer({
  tenantSlug,
  integration,
  canManage,
  onClose,
  onChanged,
}: {
  tenantSlug: string;
  integration: IntegrationView;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const locked = integration.locked;
  const visual = resolveIntegrationStatus(integration, { locked });
  const config = integration.config;

  const savedDomain = typeof config.domain === "string" ? config.domain : "";
  const verificationStatus =
    typeof config.verification_status === "string" ? config.verification_status : null;
  const dnsRecords = readDnsRecords(config);
  const hasDomain = savedDomain.length > 0;

  const [domain, setDomain] = useState<string>(savedDomain);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const editable = canManage && !locked;

  const handleSave = async () => {
    setFeedback(null);
    const res = await saveEmailDomain(tenantSlug, domain.trim());
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error });
      throw new Error(res.error);
    }
    setFeedback({
      tone: "success",
      message: "Domain registered. Add the DNS records below, then Verify.",
    });
    onChanged();
  };

  const handleVerify = async () => {
    setFeedback(null);
    const res = await verifyEmailDomain(tenantSlug);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error });
      throw new Error(res.error);
    }
    setFeedback({
      tone: res.status === "verified" ? "success" : "error",
      message:
        res.status === "verified"
          ? "Verified — email now sends from your domain."
          : `Not verified yet (status: ${res.status}). DNS can take a while to propagate.`,
    });
    onChanged();
  };

  const inputStyle = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.border}`,
    background: editable ? "#fff" : COLORS.surfaceAlt,
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.ink,
    outline: "none",
  };

  return (
    <DrawerShell
      open
      onClose={onClose}
      title={integration.label}
      description={integration.description}
      toolbar={<IntegrationStatusPill visual={visual} />}
      footer={
        !canManage ? (
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            You don&apos;t have permission to change integrations.
          </span>
        ) : locked ? (
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            Upgrade your plan to send from your own domain.
          </span>
        ) : (
          <>
            {hasDomain && (
              <AsyncButton variant="secondary" onClick={handleVerify} pendingLabel="Checking…">
                Verify
              </AsyncButton>
            )}
            <AsyncButton onClick={handleSave} pendingLabel="Saving…">
              {hasDomain ? "Update domain" : "Add domain"}
            </AsyncButton>
          </>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
        {locked && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: RADIUS.md,
              background: "rgba(24,24,27,0.05)",
              fontSize: 12.5,
              color: COLORS.inkDim,
              lineHeight: 1.5,
            }}
          >
            White-label email is a plan feature. Upgrade to send client email from
            your own domain.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="ed-domain" style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
            Sending domain
          </label>
          <input
            id="ed-domain"
            type="text"
            value={domain}
            disabled={!editable}
            onChange={(e) => {
              setDomain(e.target.value);
              setFeedback(null);
            }}
            placeholder="mail.yourbrand.com"
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
          {verificationStatus && (
            <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
              Provider status: <strong>{verificationStatus}</strong>
            </div>
          )}
        </div>

        {dnsRecords.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: COLORS.inkDim,
              }}
            >
              DNS records to add
            </div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              Add these at your DNS host, then click Verify.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dnsRecords.map((r, i) => (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: RADIUS.sm,
                    padding: "10px 12px",
                    background: COLORS.surfaceAlt,
                    fontFamily: FONTS.mono,
                    fontSize: 11.5,
                    color: COLORS.ink,
                    overflowWrap: "anywhere",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <div>
                    <strong>{r.type ?? r.record ?? "RECORD"}</strong>
                    {typeof r.priority === "number" ? `  (priority ${r.priority})` : ""}
                  </div>
                  {r.name && <div>name: {r.name}</div>}
                  {r.value && <div>value: {r.value}</div>}
                  {r.ttl && <div>ttl: {r.ttl}</div>}
                  {r.status && (
                    <div style={{ color: COLORS.inkMuted }}>status: {r.status}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            style={{
              padding: "10px 13px",
              borderRadius: RADIUS.md,
              fontSize: 12.5,
              lineHeight: 1.5,
              background: feedback.tone === "success" ? COLORS.successSoft : COLORS.criticalSoft,
              color: feedback.tone === "success" ? COLORS.successDeep : COLORS.criticalDeep,
              border: `1px solid ${feedback.tone === "success" ? COLORS.successSoft : COLORS.criticalSoft}`,
            }}
          >
            {feedback.message}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
