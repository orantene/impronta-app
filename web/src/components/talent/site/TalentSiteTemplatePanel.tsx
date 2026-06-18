"use client";

import { useMemo, useState } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { SecondaryButton } from "@/components/admin/shell/internal/primitives";
import {
  TemplatePickerPanel,
  type TemplatePickerApplyResult,
} from "@/components/edit-chrome/template-picker-panel";
import { applyTalentSiteTemplateAction } from "@/lib/talent-site/server/actions";
import { toUnifiedTemplateDef } from "@/lib/site-admin/builder-core/templates/template-def";
import type { TalentSiteTemplateKey } from "@/lib/talent-site/templates/types";
import { talentSiteCopy, type TalentSiteLocale } from "@/lib/talent-site/talent-site-i18n";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";

type Props = {
  state: TalentSiteDashboardState;
  locale?: TalentSiteLocale;
  onChanged: () => void | Promise<void>;
};

/**
 * Discovery-profile slot-template picker (mode='profile').
 *
 * Renders the SHARED `TemplatePickerPanel` (ONB-3) — the same picker chrome,
 * card anatomy, and owner-gated preview contract used by the Max multi-page-site
 * gallery. The only per-surface code left here is the plan-gating wrapper (the
 * free-tier locked state + upsell copy) and the slot-template apply backend
 * (`applyTalentSiteTemplateAction`, which needs the optimistic `expectedVersion`).
 */
export function TalentSiteTemplatePanel({ state, locale = "en", onChanged }: Props) {
  const [open, setOpen] = useState(false);

  const current = state.availableTemplates.find((t) => t.key === state.templateKey);
  const lockedFree = state.tier === "free";

  const unifiedTemplates = useMemo(
    () =>
      state.availableTemplates.map((t) =>
        toUnifiedTemplateDef(
          { key: t.key, label: t.label, blurb: t.blurb, thumbnailUrl: t.thumbnailUrl },
          "talent-site",
        ),
      ),
    [state.availableTemplates],
  );

  async function applyTemplate(templateKey: string): Promise<TemplatePickerApplyResult> {
    if (!state.site) return { ok: false, error: "No site to update." };
    const result = await applyTalentSiteTemplateAction({
      templateKey: templateKey as TalentSiteTemplateKey,
      expectedVersion: state.site.version,
    });
    if (!result.ok) return { ok: false, error: result.error };
    setOpen(false);
    await onChanged();
    return { ok: true };
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase" }}>
            Template
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, marginTop: 4 }}>
            {current?.label ?? "Tulala Digital"}
            {lockedFree ? ` — ${talentSiteCopy(locale, "templateIncluded")}` : ""}
          </div>
          {current?.blurb ? (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: COLORS.inkMuted, maxWidth: 520 }}>
              {current.blurb}
            </p>
          ) : null}
        </div>
        {state.canUseTemplateGallery && !lockedFree ? (
          <SecondaryButton onClick={() => setOpen(true)} disabled={open}>
            {talentSiteCopy(locale, "templateChange")}
          </SecondaryButton>
        ) : null}
      </div>

      {lockedFree ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          {talentSiteCopy(locale, "upgradeProTemplates")}
          <br />
          {talentSiteCopy(locale, "upgradeMaxBuilder")}
        </p>
      ) : null}

      {!state.canUseCustomBuilder && state.tier === "pro" ? (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: COLORS.inkMuted }}>
          {talentSiteCopy(locale, "upgradeMaxService")}
        </p>
      ) : null}

      {open ? (
        <div style={{ marginTop: 14 }}>
          <TemplatePickerPanel
            mode="profile"
            templates={unifiedTemplates}
            currentKey={state.templateKey}
            talentProfileId={state.talentProfileId}
            onApply={applyTemplate}
          />
        </div>
      ) : null}
    </div>
  );
}
