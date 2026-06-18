"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { SecondaryButton } from "@/components/admin/shell/internal/primitives";
import { applyTalentSiteTemplateAction } from "@/lib/talent-site/server/actions";
import { getTemplatePreviewUrl } from "@/lib/site-admin/builder-core/templates/template-def";
import type { TalentSiteTemplateKey } from "@/lib/talent-site/templates/types";
import { talentSiteCopy, type TalentSiteLocale } from "@/lib/talent-site/talent-site-i18n";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";

type Props = {
  state: TalentSiteDashboardState;
  locale?: TalentSiteLocale;
  onChanged: () => void | Promise<void>;
};

export function TalentSiteTemplatePanel({ state, locale = "en", onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = state.availableTemplates.find((t) => t.key === state.templateKey);
  const lockedFree = state.tier === "free";

  function applyTemplate(templateKey: TalentSiteTemplateKey) {
    if (!state.site) return;
    startTransition(async () => {
      setError(null);
      const result = await applyTalentSiteTemplateAction({
        templateKey,
        expectedVersion: state.site!.version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      await onChanged();
    });
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
          <SecondaryButton onClick={() => setOpen(true)} disabled={pending}>
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

      {error ? (
        <p style={{ marginTop: 10, fontSize: 12, color: COLORS.criticalDeep }}>{error}</p>
      ) : null}

      {open ? (
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          {state.availableTemplates.map((t) => (
            <div
              key={t.key}
              style={{
                position: "relative",
                textAlign: "left",
                padding: 8,
                borderRadius: 10,
                border: `1px solid ${t.key === state.templateKey ? COLORS.accent : COLORS.borderSoft}`,
                background: "#fff",
                fontFamily: FONTS.body,
              }}
            >
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`,
                  background: COLORS.surfaceAlt,
                  aspectRatio: "8 / 5",
                  marginBottom: 9,
                }}
              >
                <Image
                  src={t.thumbnailUrl}
                  alt=""
                  width={1200}
                  height={750}
                  sizes="(max-width: 720px) 80vw, 220px"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                {/* Eye-icon — opens the SHARED owner-gated hydrated preview
                    (`?talent` shows THIS talent's real name/photo/bio). */}
                <a
                  href={getTemplatePreviewUrl(t.key, {
                    talentProfileId: state.talentProfileId,
                    family: "talent-site",
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Preview with your details"
                  aria-label={`Preview ${t.label} with your details`}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: "rgba(17,17,17,0.62)",
                    color: "#fff",
                    fontSize: 13,
                    lineHeight: 1,
                    textDecoration: "none",
                  }}
                >
                  {/* eye glyph */}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </a>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => applyTemplate(t.key as TalentSiteTemplateKey)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t.label}</div>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.35 }}>
                  {t.blurb}
                </div>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
