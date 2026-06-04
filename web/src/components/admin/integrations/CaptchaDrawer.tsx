"use client";

import { useState } from "react";

import { DrawerShell, AsyncButton } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";
import type { IntegrationView } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";
import { saveCaptcha } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions-specialised";

import { resolveIntegrationStatus } from "./integration-status";
import { IntegrationStatusPill } from "./IntegrationStatusPill";

type Feedback = { tone: "success" | "error"; message: string } | null;
type Provider = "hcaptcha" | "turnstile";

/**
 * Captcha drawer — provider select + PUBLIC site key + masked SECRET secret key.
 * Site key + provider are stored in config_json; the secret key is encrypted in
 * the vault and only its masked status (last4) ever returns. A blank secret on
 * save leaves the stored one untouched.
 */
export function CaptchaDrawer({
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
  const visual = resolveIntegrationStatus(integration);
  const config = integration.config;

  const secretField = integration.fields.find((f) => f.name === "secret_key");

  const [provider, setProvider] = useState<Provider>(
    config.provider === "turnstile" ? "turnstile" : "hcaptcha",
  );
  const [siteKey, setSiteKey] = useState<string>(
    typeof config.site_key === "string" ? config.site_key : "",
  );
  const [secretKey, setSecretKey] = useState<string>("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const handleSave = async () => {
    setFeedback(null);
    const res = await saveCaptcha(tenantSlug, {
      provider,
      site_key: siteKey.trim(),
      secret_key: secretKey.trim(),
    });
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error });
      throw new Error(res.error);
    }
    setFeedback({ tone: "success", message: "Captcha saved." });
    setSecretKey("");
    onChanged();
  };

  const inputStyle = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.border}`,
    background: canManage ? "#fff" : COLORS.surfaceAlt,
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
        canManage ? (
          <AsyncButton onClick={handleSave} pendingLabel="Saving…">
            Save
          </AsyncButton>
        ) : (
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            You don&apos;t have permission to change integrations.
          </span>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>Provider</label>
          <select
            value={provider}
            disabled={!canManage}
            onChange={(e) => {
              setProvider(e.target.value as Provider);
              setFeedback(null);
            }}
            style={inputStyle}
          >
            <option value="hcaptcha">hCaptcha</option>
            <option value="turnstile">Cloudflare Turnstile</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="cap-site" style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
            Site key
          </label>
          <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
            Public — renders the widget on your forms.
          </div>
          <input
            id="cap-site"
            type="text"
            value={siteKey}
            disabled={!canManage}
            onChange={(e) => {
              setSiteKey(e.target.value);
              setFeedback(null);
            }}
            placeholder="Paste your site key"
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="cap-secret" style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
            Secret key
          </label>
          {secretField?.secretPresent && (
            <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
              Stored: ····{secretField.secretLast4 ?? "????"}
            </div>
          )}
          <input
            id="cap-secret"
            type="password"
            value={secretKey}
            disabled={!canManage}
            onChange={(e) => {
              setSecretKey(e.target.value);
              setFeedback(null);
            }}
            placeholder={
              secretField?.secretPresent
                ? "Paste a new secret to replace the stored one"
                : "Paste your secret key"
            }
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
        </div>

        {integration.instructions.length > 0 && (
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12.5,
              color: COLORS.inkMuted,
              lineHeight: 1.5,
            }}
          >
            {integration.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
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
