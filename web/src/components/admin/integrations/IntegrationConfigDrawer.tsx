"use client";

import { useMemo, useState } from "react";

import { DrawerShell, AsyncButton } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";
import {
  clearIntegrationSecret,
  removeIntegration,
  saveIntegrationConfig,
  saveIntegrationSecret,
  setIntegrationMode,
  type IntegrationView,
} from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";

import { resolveIntegrationStatus } from "./integration-status";
import { IntegrationStatusPill } from "./IntegrationStatusPill";

type Feedback = { tone: "success" | "error"; message: string } | null;

/**
 * Per-integration config drawer. Renders the catalog setup instructions as
 * numbered steps, an input per catalog field (secret fields show ····last4 once
 * stored), and a "Save" action. The save actions validate each value against
 * the catalog format test() server-side and REFUSE to persist anything that
 * fails — and a successful save stamps last_verified_at in the same write, so
 * there is no separate verify round-trip. Feedback is explicit + persistent (no
 * toast-and-vanish). Inheritable integrations get a "Use platform default"
 * toggle.
 */
export function IntegrationConfigDrawer({
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

  // Seed inputs from the loaded public values. Secret fields start blank — a
  // present secret is shown via masked last4, not its value.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of integration.fields) {
      seed[f.name] = f.secret ? "" : (f.value ?? "");
    }
    return seed;
  });
  const [feedback, setFeedback] = useState<Feedback>(null);

  const secretField = useMemo(
    () => integration.fields.find((f) => f.secret) ?? null,
    [integration.fields],
  );
  const usingInheritedDefault =
    integration.inheritable && integration.credentialMode === "inherit";
  const canOAuthConnect =
    canManage && integration.connection === "oauth" && integration.key === "youtube";

  const setValue = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    setFeedback(null);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  // The save actions validate every value against the catalog format test()
  // server-side and REFUSE to persist anything that fails — so a returned ok
  // means the value both passed the format check AND landed (with
  // last_verified_at stamped in the same write). No separate verify round-trip.
  const handleSave = async () => {
    setFeedback(null);

    // 1. Public config fields (analytics ids) → saveIntegrationConfig.
    const publicValues: Record<string, string> = {};
    for (const f of integration.fields) {
      if (!f.secret) publicValues[f.name] = (values[f.name] ?? "").trim();
    }
    if (Object.keys(publicValues).length > 0) {
      const res = await saveIntegrationConfig(tenantSlug, integration.key, publicValues);
      if (!res.ok) {
        setFeedback({ tone: "error", message: res.error });
        throw new Error(res.error); // surface AsyncButton's retry state
      }
    }

    // 2. Secret field (Maps key) → saveIntegrationSecret, only when a new value
    //    was typed (blank means "leave the stored key untouched").
    if (secretField) {
      const typed = (values[secretField.name] ?? "").trim();
      if (typed) {
        const res = await saveIntegrationSecret(
          tenantSlug,
          integration.key,
          secretField.name,
          typed,
        );
        if (!res.ok) {
          setFeedback({ tone: "error", message: res.error });
          throw new Error(res.error);
        }
      }
    }

    setFeedback({ tone: "success", message: "Connected. Format check passed." });

    // Clear the typed secret from memory after a successful round-trip.
    if (secretField) setValue(secretField.name, "");
    onChanged();
  };

  const handleUsePlatformDefault = async () => {
    setFeedback(null);
    const res = await setIntegrationMode(tenantSlug, integration.key, "inherit");
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error });
      throw new Error(res.error);
    }
    setFeedback({ tone: "success", message: "Now using the platform default." });
    onChanged();
  };

  const handleClearSecret = async () => {
    if (!secretField) return;
    setFeedback(null);
    const res = await clearIntegrationSecret(tenantSlug, integration.key, secretField.name);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error });
      throw new Error(res.error);
    }
    setFeedback({
      tone: "success",
      message: integration.inheritable
        ? "Removed. Reverted to the platform default."
        : "Removed.",
    });
    onChanged();
  };

  const handleRemove = async () => {
    setFeedback(null);
    const res = await removeIntegration(tenantSlug, integration.key);
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error });
      throw new Error(res.error);
    }
    setFeedback({ tone: "success", message: "Disconnected." });
    onChanged();
  };

  const handleOAuthConnect = async () => {
    const url = new URL("/api/connections/oauth/start", window.location.origin);
    url.searchParams.set("owner", "workspace");
    url.searchParams.set("provider", "youtube");
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("returnTo", window.location.pathname + window.location.search);
    window.location.assign(url.toString());
  };

  const hasAnyConfigured = integration.fields.some(
    (f) => (f.secret && f.secretPresent) || (!f.secret && f.value),
  );

  return (
    <DrawerShell
      open
      onClose={onClose}
      title={integration.label}
      description={integration.description}
      toolbar={<IntegrationStatusPill visual={visual} />}
      footer={
        canManage ? (
          <>
            {hasAnyConfigured && (
              <AsyncButton variant="secondary" onClick={handleRemove}>
                Disconnect
              </AsyncButton>
            )}
            <AsyncButton onClick={handleSave} pendingLabel="Saving…">
              Save
            </AsyncButton>
          </>
        ) : (
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            You don&apos;t have permission to change integrations.
          </span>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>
        {/* Inherited-default banner */}
        {usingInheritedDefault && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: RADIUS.md,
              background: COLORS.indigoSoft,
              border: `1px solid ${COLORS.indigoSoft}`,
              fontSize: 12.5,
              color: COLORS.indigoDeep,
              lineHeight: 1.5,
            }}
          >
            This integration is currently using the platform default. Add your own
            key below to use it on your custom domain.
          </div>
        )}

        {/* How to set this up */}
        {integration.instructions.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: COLORS.inkDim,
                marginBottom: 8,
              }}
            >
              How to set this up
            </div>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {integration.instructions.map((step, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: COLORS.surfaceAlt,
                      color: COLORS.ink,
                      fontSize: 11,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, paddingTop: 1 }}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {integration.connection === "oauth" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              padding: "14px",
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.ink }}>
                Verify ownership
              </div>
              <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.45, color: COLORS.inkMuted }}>
                We store the public channel label and encrypted OAuth tokens. The verified
                channel is used for workspace trust and public-site social links.
              </div>
            </div>
            <AsyncButton
              variant="secondary"
              disabled={!canOAuthConnect}
              onClick={handleOAuthConnect}
              pendingLabel="Opening…"
              style={{ flexShrink: 0 }}
            >
              Connect with Google
            </AsyncButton>
          </div>
        )}

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {integration.fields.map((f) => {
            const showMask = f.secret && f.secretPresent;
            return (
              <div key={f.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  htmlFor={`intg-${integration.key}-${f.name}`}
                  style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}
                >
                  {f.label}
                </label>
                {showMask && (
                  <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
                    Stored: ····{f.secretLast4 ?? "????"}
                    {canManage && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => void handleClearSecret()}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            color: COLORS.critical,
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: FONTS.body,
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                )}
                <input
                  id={`intg-${integration.key}-${f.name}`}
                  type={f.secret ? "password" : "text"}
                  value={values[f.name] ?? ""}
                  disabled={!canManage}
                  onChange={(e) => setValue(f.name, e.target.value)}
                  placeholder={
                    f.secret
                      ? showMask
                        ? "Paste a new key to replace the stored one"
                        : "Paste your key"
                      : "Paste your ID"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                    background: canManage ? "#fff" : COLORS.surfaceAlt,
                    fontSize: 13,
                    fontFamily: FONTS.body,
                    color: COLORS.ink,
                    outline: "none",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Use platform default — inheritable only, and only when not already inheriting */}
        {canManage && integration.inheritable && !usingInheritedDefault && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
                Use platform default
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
                Stop using your own key and fall back to Tulala&apos;s shared credential.
              </div>
            </div>
            <AsyncButton variant="secondary" onClick={handleUsePlatformDefault}>
              Switch
            </AsyncButton>
          </div>
        )}

        {/* Explicit, persistent feedback (no toast-and-vanish) */}
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

        {/* Persisted last-error from the row (e.g. a prior failed verify) */}
        {!feedback && integration.lastError && (
          <div
            style={{
              padding: "10px 13px",
              borderRadius: RADIUS.md,
              fontSize: 12.5,
              lineHeight: 1.5,
              background: COLORS.criticalSoft,
              color: COLORS.criticalDeep,
              border: `1px solid ${COLORS.criticalSoft}`,
            }}
          >
            Last check: {integration.lastError}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
