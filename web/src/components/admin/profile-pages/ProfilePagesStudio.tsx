"use client";

/**
 * Profile Pages studio — the admin surface for choosing which template renders
 * an agency's public talent profile pages. The exact sibling of Card Design:
 *
 *   - Card Design picks the directory-card family (`template.directory-card-family`).
 *   - Profile Pages picks the profile-page family (`template.profile-layout-family`).
 *
 * Both tokens live in agency_branding.theme_json. Picking a template here saves
 * instantly to this workspace; the public profile route (`/t/[profileCode]`)
 * reads the token and dispatches to the matching layout component. The choice
 * applies to EVERY talent profile on the agency's site.
 *
 * Catalog + metadata live in `@/lib/talent-profile/profile-page-templates`;
 * persistence in `@/lib/server-actions/admin-profile-template`.
 */

import { useCallback, useEffect, useState } from "react";

import {
  PROFILE_PAGE_TEMPLATE_ORDER,
  PROFILE_PAGE_TEMPLATES,
  resolveProfilePageTemplateKey,
  type ProfilePageTemplateKey,
} from "@/lib/talent-profile/profile-page-templates";
import {
  loadProfileTemplateFamily,
  setProfileTemplateFamily,
} from "@/lib/server-actions/admin-profile-template";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { getMessageStringArray } from "@/i18n/messages";
import { Icon, PrimaryButton } from "../shell/internal/primitives";
import { COLORS, FONTS, RADIUS, SPACE, meetsRole, useAdminShell } from "../shell/internal/state";

/**
 * Template display strings (label/tagline/description/sections) are data
 * constants in `profile-page-templates.ts` — that file is shared, non-React,
 * and pure data, so we don't translate it destructively. Instead each field
 * gets a label-key map (enum -> catalog key), the same pattern as
 * `PAGE_STATUS_LABEL_KEY` in `page-modules/SitePage.tsx`.
 */
const TEMPLATE_LABEL_KEY: Record<ProfilePageTemplateKey, string> = {
  classic: "dashboard.adminProfilePages.templates.classic.label",
  noir: "dashboard.adminProfilePages.templates.noir.label",
  lumen: "dashboard.adminProfilePages.templates.lumen.label",
  atelier: "dashboard.adminProfilePages.templates.atelier.label",
};
const TEMPLATE_TAGLINE_KEY: Record<ProfilePageTemplateKey, string> = {
  classic: "dashboard.adminProfilePages.templates.classic.tagline",
  noir: "dashboard.adminProfilePages.templates.noir.tagline",
  lumen: "dashboard.adminProfilePages.templates.lumen.tagline",
  atelier: "dashboard.adminProfilePages.templates.atelier.tagline",
};
const TEMPLATE_DESCRIPTION_KEY: Record<ProfilePageTemplateKey, string> = {
  classic: "dashboard.adminProfilePages.templates.classic.description",
  noir: "dashboard.adminProfilePages.templates.noir.description",
  lumen: "dashboard.adminProfilePages.templates.lumen.description",
  atelier: "dashboard.adminProfilePages.templates.atelier.description",
};
const TEMPLATE_TYPE_LABEL_KEY: Record<ProfilePageTemplateKey, string> = {
  classic: "dashboard.adminProfilePages.templates.classic.typeLabel",
  noir: "dashboard.adminProfilePages.templates.noir.typeLabel",
  lumen: "dashboard.adminProfilePages.templates.lumen.typeLabel",
  atelier: "dashboard.adminProfilePages.templates.atelier.typeLabel",
};
const TEMPLATE_SECTIONS_KEY: Record<ProfilePageTemplateKey, string> = {
  classic: "dashboard.adminProfilePages.templates.classic.sections",
  noir: "dashboard.adminProfilePages.templates.noir.sections",
  lumen: "dashboard.adminProfilePages.templates.lumen.sections",
  atelier: "dashboard.adminProfilePages.templates.atelier.sections",
};

export function ProfilePagesStudio() {
  const { state, toast } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  const t = useT();
  const locale = useDashboardLocale();

  const [active, setActive] = useState<ProfilePageTemplateKey>("classic");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ProfilePageTemplateKey | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await loadProfileTemplateFamily();
      if (!alive) return;
      if (res.ok) setActive(resolveProfilePageTemplateKey(res.family));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const apply = useCallback(
    (key: ProfilePageTemplateKey) => {
      if (!canEdit) {
        toast(t("dashboard.adminProfilePages.toastNeedsAdmin"));
        return;
      }
      if (key === active || savingKey) return;
      const prev = active;
      setActive(key); // optimistic
      setSavingKey(key);
      void (async () => {
        const res = await setProfileTemplateFamily(
          PROFILE_PAGE_TEMPLATES[key].tokenValue,
        );
        setSavingKey(null);
        if (!res.ok) {
          setActive(prev); // revert
          toast(res.error || t("dashboard.adminProfilePages.toastSaveError"));
          return;
        }
        toast(
          interpolate(t("dashboard.adminProfilePages.toastTemplateSet"), {
            label: t(TEMPLATE_LABEL_KEY[key]),
          }),
        );
      })();
    },
    [active, canEdit, savingKey, t, toast],
  );

  return (
    <div data-tulala-profile-pages-studio style={{ fontFamily: FONTS.body, color: COLORS.ink }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: SPACE.group }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
              {t("dashboard.adminProfilePages.title")}
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: COLORS.accentDeep,
                background: COLORS.accentSoft,
                borderRadius: 999,
                padding: "3px 8px",
              }}
            >
              <Icon name="bolt" size={11} color={COLORS.accent} />
              {t("dashboard.adminProfilePages.liveBadge")}
            </span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.inkMuted, maxWidth: 580, lineHeight: 1.5 }}>
            {t("dashboard.adminProfilePages.subtitle")}
          </p>
        </div>
        {!canEdit ? (
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.inkMuted }}>
            {t("dashboard.adminProfilePages.readOnly")}
          </span>
        ) : null}
      </div>

      {/* Template grid */}
      <div
        data-tulala-profile-pages-grid
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: SPACE.group }}
      >
        {PROFILE_PAGE_TEMPLATE_ORDER.map((key) => {
          const tpl = PROFILE_PAGE_TEMPLATES[key];
          const label = t(TEMPLATE_LABEL_KEY[key]);
          const tagline = t(TEMPLATE_TAGLINE_KEY[key]);
          const description = t(TEMPLATE_DESCRIPTION_KEY[key]);
          const typeLabel = t(TEMPLATE_TYPE_LABEL_KEY[key]);
          const sections = getMessageStringArray(locale, TEMPLATE_SECTIONS_KEY[key]);
          // Don't assert an active template until the live value has loaded,
          // so a cold first render never flashes the wrong tile as active.
          const isActive = !loading && active === key;
          const isSaving = savingKey === key;
          return (
            <div
              key={key}
              data-active={isActive ? "true" : undefined}
              style={{
                background: COLORS.card,
                border: `1px solid ${isActive ? COLORS.ink : COLORS.border}`,
                borderRadius: RADIUS.lg,
                overflow: "hidden",
                boxShadow: isActive ? COLORS.shadow : "none",
                display: "flex",
                flexDirection: "column",
                transition: "border-color 160ms ease, box-shadow 160ms ease",
              }}
            >
              {/* Swatch preview — an honest mini-mock, not a screenshot */}
              <div
                aria-hidden="true"
                style={{
                  position: "relative",
                  height: 150,
                  background: tpl.swatch.bg,
                  color: tpl.swatch.ink,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  borderBottom: `1px solid ${COLORS.borderSoft}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.28em",
                      textTransform: "uppercase",
                      color: tpl.swatch.accent,
                      fontWeight: 600,
                    }}
                  >
                    ▬ {typeLabel}
                  </span>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: key === "noir" || key === "atelier" ? "Georgia, serif" : FONTS.display,
                      fontSize: 30,
                      lineHeight: 1,
                      fontWeight: 600,
                      color: tpl.swatch.ink,
                    }}
                  >
                    Aa
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          height: 6,
                          width: i === 0 ? 44 : 22,
                          borderRadius: 2,
                          background: i === 0 ? tpl.swatch.accent : `${tpl.swatch.ink}55`,
                        }}
                      />
                    ))}
                  </div>
                </div>
                {isActive ? (
                  <span
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: "#fff",
                      background: COLORS.successDeep,
                      borderRadius: 999,
                      padding: "3px 9px",
                    }}
                  >
                    <Icon name="check" size={11} color="#fff" /> {t("dashboard.adminProfilePages.activeBadge")}
                  </span>
                ) : null}
              </div>

              {/* Body */}
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <div>
                  <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 11.5, color: COLORS.accentDeep, fontWeight: 600, marginTop: 2 }}>
                    {tagline}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                  {description}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
                  {sections.map((s, i) => (
                    <span
                      key={`${key}-${i}`}
                      style={{
                        fontSize: 10.5,
                        color: COLORS.inkDim,
                        background: COLORS.surfaceAlt,
                        border: `1px solid ${COLORS.borderSoft}`,
                        borderRadius: 999,
                        padding: "3px 8px",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {/* Footer action */}
                <div style={{ marginTop: "auto", paddingTop: 12 }}>
                  {isActive ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: COLORS.successDeep }}>
                      <Icon name="check" size={13} color={COLORS.success} />
                      {loading
                        ? t("dashboard.adminProfilePages.currentTemplate")
                        : t("dashboard.adminProfilePages.liveTemplateNote")}
                    </span>
                  ) : (
                    <PrimaryButton
                      size="sm"
                      disabled={!canEdit || isSaving || loading}
                      onClick={() => apply(key)}
                    >
                      {isSaving
                        ? t("dashboard.adminProfilePages.applying")
                        : t("dashboard.adminProfilePages.useTemplate")}
                    </PrimaryButton>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footnote */}
      <p style={{ margin: "16px 2px 0", fontSize: 11.5, color: COLORS.inkDim, lineHeight: 1.5, maxWidth: 620 }}>
        {t("dashboard.adminProfilePages.footnoteTipPrefix")}{" "}
        <code style={{ fontFamily: "ui-monospace, monospace" }}>?template=classic</code>{" "}
        {t("dashboard.adminProfilePages.footnoteTipOr")}{" "}
        <code style={{ fontFamily: "ui-monospace, monospace" }}>?template=noir</code>{" "}
        {t("dashboard.adminProfilePages.footnoteTipSuffix")}
      </p>

      <style>{`
        @media (max-width: 720px) {
          [data-tulala-profile-pages-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
