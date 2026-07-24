"use client";

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import { DrawerShell, AsyncButton } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";
import type { IntegrationView } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";
import { saveCustomCode } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions-specialised";

import { resolveIntegrationStatus } from "./integration-status";
import { IntegrationStatusPill } from "./IntegrationStatusPill";

type Feedback = { tone: "success" | "error"; message: string } | null;

/**
 * Custom-code drawer — two HTML textareas (head + body) injected into the
 * tenant's OWN public storefront. Entitlement-gated (custom_css_allowed): when
 * locked, the inputs are read-only and a clear upgrade prompt replaces the save
 * action. A prominent warning explains the code runs on the public storefront
 * only.
 */
export function CustomCodeDrawer({
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
  const t = useT();
  const locked = integration.locked;
  const visual = resolveIntegrationStatus(integration, { locked });

  const config = integration.config;
  const [head, setHead] = useState<string>(
    typeof config.head_html === "string" ? config.head_html : "",
  );
  const [body, setBody] = useState<string>(
    typeof config.body_html === "string" ? config.body_html : "",
  );
  const [feedback, setFeedback] = useState<Feedback>(null);

  const editable = canManage && !locked;

  const handleSave = async () => {
    setFeedback(null);
    const res = await saveCustomCode(tenantSlug, {
      head_html: head,
      body_html: body,
    });
    if (!res.ok) {
      setFeedback({ tone: "error", message: res.error });
      throw new Error(res.error);
    }
    setFeedback({ tone: "success", message: t("dashboard.adminWorkspace.integrations.codeSaved") });
    onChanged();
  };

  const textareaStyle = {
    width: "100%",
    minHeight: 120,
    padding: "9px 11px",
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.border}`,
    background: editable ? "#fff" : COLORS.surfaceAlt,
    fontSize: 12.5,
    fontFamily: FONTS.mono,
    color: COLORS.ink,
    outline: "none",
    resize: "vertical" as const,
  };

  return (
    <DrawerShell
      open
      onClose={onClose}
      title={t(integration.labelKey)}
      description={t(integration.descriptionKey)}
      toolbar={<IntegrationStatusPill visual={visual} />}
      footer={
        !canManage ? (
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            {t("dashboard.adminWorkspace.integrations.noPermission")}
          </span>
        ) : locked ? (
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            {t("dashboard.adminWorkspace.integrations.codeUpgradeFooter")}
          </span>
        ) : (
          <AsyncButton onClick={handleSave} pendingLabel={t("dashboard.adminWorkspace.integrations.savingPending")}>
            {t("dashboard.adminWorkspace.integrations.save")}
          </AsyncButton>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
        {/* Storefront warning */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: RADIUS.md,
            background: COLORS.coralSoft,
            border: `1px solid ${COLORS.coralSoft}`,
            fontSize: 12.5,
            color: COLORS.coralDeep,
            lineHeight: 1.5,
          }}
        >
          {t("dashboard.adminWorkspace.integrations.codeWarningPre")}
          <strong>{t("dashboard.adminWorkspace.integrations.codeWarningStrong")}</strong>
          {t("dashboard.adminWorkspace.integrations.codeWarningPost")}
        </div>

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
            {t("dashboard.adminWorkspace.integrations.codeLockedBanner")}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="cc-head" style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
            {t("dashboard.adminWorkspace.integrations.codeHeadLabel")}
          </label>
          <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
            {t("dashboard.adminWorkspace.integrations.codeHeadHint")}
          </div>
          <textarea
            id="cc-head"
            value={head}
            disabled={!editable}
            onChange={(e) => {
              setHead(e.target.value);
              setFeedback(null);
            }}
            spellCheck={false}
            placeholder="<link rel=&quot;stylesheet&quot; href=&quot;…&quot;>"
            style={textareaStyle}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="cc-body" style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
            {t("dashboard.adminWorkspace.integrations.codeBodyLabel")}
          </label>
          <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
            {t("dashboard.adminWorkspace.integrations.codeBodyHint")}
          </div>
          <textarea
            id="cc-body"
            value={body}
            disabled={!editable}
            onChange={(e) => {
              setBody(e.target.value);
              setFeedback(null);
            }}
            spellCheck={false}
            placeholder="<script src=&quot;…&quot; async></script>"
            style={textareaStyle}
          />
        </div>

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
