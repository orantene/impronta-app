"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import { mergeTalentSiteDashboardWithShellTier } from "@/lib/talent-site/merge-shell-tier";
import {
  createTalentPersonalSiteDraftAction,
  fetchTalentPersonalSiteDashboardStateAction,
} from "@/lib/talent-site/server/actions";
import { talentSiteCopy, type TalentSiteLocale } from "@/lib/talent-site/talent-site-i18n";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";
import { TalentSiteCompositionPanel } from "./TalentSiteCompositionPanel";
import { TalentSiteEditorForm } from "./TalentSiteEditorForm";
import { TalentSiteTemplatePanel } from "./TalentSiteTemplatePanel";

type Props = {
  initialState: TalentSiteDashboardState;
  locale?: TalentSiteLocale;
  onReload?: () => void | Promise<void>;
};

function tierCardCopy(state: TalentSiteDashboardState, locale: TalentSiteLocale) {
  if (state.tier === "max") {
    return {
      title: talentSiteCopy(locale, "maxCardTitle"),
      subtitle: talentSiteCopy(locale, "maxCardSubtitle"),
    };
  }
  if (state.tier === "pro") {
    return {
      title: talentSiteCopy(locale, "proCardTitle"),
      subtitle: talentSiteCopy(locale, "proCardSubtitle"),
    };
  }
  return {
    title: talentSiteCopy(locale, "freeCardTitle"),
    subtitle: talentSiteCopy(locale, "freeCardSubtitle"),
  };
}

export function TalentSiteDashboardClient({ initialState, onReload, locale = "en" }: Props) {
  const { openDrawer, state: shellState } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [baseState, setBaseState] = useState(initialState);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  useEffect(() => {
    setBaseState(initialState);
  }, [initialState]);

  const state = useMemo(
    () => mergeTalentSiteDashboardWithShellTier(baseState, shellState.talentTier),
    [baseState, shellState.talentTier],
  );

  const hasSite = state.site != null;
  const draftSnapshot = state.site?.draftSnapshot;
  const canEdit = state.canEditPersonalSite;
  const cardCopy = tierCardCopy(state, locale);

  const showWelcome =
    !welcomeDismissed &&
    hasSite &&
    state.site?.status !== "published" &&
    state.tier === "free";

  async function reloadDashboard() {
    const loaded = await fetchTalentPersonalSiteDashboardStateAction();
    if (loaded.ok) {
      setBaseState(loaded.state);
    }
    await onReload?.();
  }

  function handleCreate() {
    startTransition(async () => {
      setError(null);
      const result = await createTalentPersonalSiteDraftAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await reloadDashboard();
    });
  }

  return (
    <section data-tulala-talent-personal-site>
      {showWelcome ? (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            background: COLORS.indigoSoft,
            border: `1px solid rgba(59,91,219,0.2)`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.ink,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <span>{talentSiteCopy(locale, "welcomeReady")}</span>
          <button
            type="button"
            onClick={() => setWelcomeDismissed(true)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.inkMuted,
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {state.isPubliclyHidden ? (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            background: COLORS.amberSoft,
            border: `1px solid rgba(180,120,0,0.2)`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.amberDeep,
          }}
        >
          {talentSiteCopy(locale, "hiddenWarning")}
        </div>
      ) : null}

      <div
        style={{
          marginBottom: 8,
          fontFamily: FONTS.display,
          fontSize: 18,
          fontWeight: 600,
          color: COLORS.ink,
        }}
      >
        {cardCopy.title}
      </div>
      <p
        style={{
          margin: "0 0 14px",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.inkMuted,
          lineHeight: 1.5,
          maxWidth: 640,
        }}
      >
        {cardCopy.subtitle}
      </p>

      {state.tier === "max" ? (
        <Link
          href="/talent/page-builder"
          data-talent-page-builder-cta
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            marginBottom: 16,
            padding: "16px 18px",
            background: `linear-gradient(135deg, ${COLORS.royalSoft} 0%, ${COLORS.surfaceAlt} 75%)`,
            border: `1px solid rgba(95,75,139,0.22)`,
            borderRadius: 14,
            textDecoration: "none",
            fontFamily: FONTS.body,
          }}
        >
          <span style={{ display: "block" }}>
            <span
              style={{
                display: "block",
                fontFamily: FONTS.display,
                fontSize: 15,
                fontWeight: 600,
                color: COLORS.ink,
              }}
            >
              {talentSiteCopy(locale, "pageBuilderCtaTitle")}
            </span>
            <span
              style={{
                display: "block",
                marginTop: 4,
                fontSize: 12.25,
                color: COLORS.inkMuted,
                lineHeight: 1.5,
                maxWidth: 520,
              }}
            >
              {talentSiteCopy(locale, "pageBuilderCtaSubtitle")}
            </span>
          </span>
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.ink,
            }}
          >
            {talentSiteCopy(locale, "pageBuilderCtaAction")} →
          </span>
        </Link>
      ) : null}

      {state.publicSiteUrl ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
            padding: "6px 12px",
            background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 999,
            fontFamily: FONTS.body,
            fontSize: 12,
          }}
        >
          <span style={{ color: COLORS.inkMuted, fontWeight: 600 }}>URL</span>
          <Link
            href={state.publicSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: COLORS.ink, fontWeight: 600, textDecoration: "none" }}
          >
            {state.publicSiteUrl} ↗
          </Link>
        </div>
      ) : (
        <div style={{ marginBottom: 14, fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkDim }}>
          {talentSiteCopy(locale, "profileCodeRequired")}
        </div>
      )}

      {!hasSite && canEdit && state.profileCode ? (
        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.royalSoft} 0%, ${COLORS.surfaceAlt} 70%)`,
            border: `1px solid rgba(95,75,139,0.18)`,
            borderRadius: 14,
            padding: "20px 22px",
            fontFamily: FONTS.body,
            marginBottom: 16,
          }}
        >
          <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.ink }}>
            {talentSiteCopy(locale, "createSite")}
          </div>
          <p style={{ margin: "6px 0 14px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            {talentSiteCopy(locale, "createSiteBlurb")}
          </p>
          <PrimaryButton onClick={handleCreate} disabled={pending}>
            {pending ? "Creating…" : talentSiteCopy(locale, "createSite")}
          </PrimaryButton>
          {error ? (
            <p style={{ marginTop: 12, fontSize: 12.5, color: COLORS.criticalDeep }}>{error}</p>
          ) : null}
        </div>
      ) : null}

      {hasSite && draftSnapshot ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 14,
              padding: "16px 18px",
              fontFamily: FONTS.body,
            }}
          >
            <StatusStrip state={state} />
            <PreviewLinks state={state} />
            {canEdit ? (
              <TalentSiteEditorForm
                state={state}
                initialSnapshot={draftSnapshot}
                onSaved={reloadDashboard}
              />
            ) : (
              <p style={{ fontSize: 12.5, color: COLORS.inkMuted }}>
                <button
                  type="button"
                  onClick={() => openDrawer("talent-tier-compare")}
                  style={{
                    border: "none",
                    background: "none",
                    color: COLORS.accentDeep,
                    cursor: "pointer",
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  Upgrade your plan
                </button>{" "}
                to edit this site.
              </p>
            )}
          </div>

          <TalentSiteTemplatePanel
            state={state}
            locale={locale}
            onChanged={reloadDashboard}
          />

          <TalentSiteCompositionPanel
            state={state}
            locale={locale}
            onChanged={reloadDashboard}
          />

          <ConnectedContentPanel />

          <FuturePlaceholders />
        </div>
      ) : null}
    </section>
  );
}

function ConnectedContentPanel() {
  const { openDrawer } = useAdminShell();
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        padding: "14px 16px",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.ink }}>
            Connected content
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            Pull approved YouTube, Spotify, SoundCloud, Vimeo or social links into your page builder only when each provider switch is on.
          </p>
        </div>
        <PrimaryButton onClick={() => openDrawer("talent-connections")}>
          Manage
        </PrimaryButton>
      </div>
    </div>
  );
}

function FuturePlaceholders() {
  // HYGIENE-1 Q7 — "Custom domain" removed: TalentSiteDomainPanel is live
  // (TalentMaxSiteManager.tsx). Only honest not-yet-shipped items remain.
  const items = ["SEO controls", "Page analytics"];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
        opacity: 0.55,
      }}
    >
      {items.map((label) => (
        <div
          key={label}
          style={{
            padding: "10px 12px",
            border: `1px dashed ${COLORS.borderSoft}`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 11,
            color: COLORS.inkMuted,
            textAlign: "center",
          }}
        >
          {label}
          <div style={{ fontSize: 10, marginTop: 4 }}>Coming soon</div>
        </div>
      ))}
    </div>
  );
}

function StatusStrip({ state }: { state: TalentSiteDashboardState }) {
  const site = state.site;
  if (!site) return null;
  const statusLabel =
    site.status === "published"
      ? "Published"
      : site.status === "unpublished"
        ? "Unpublished"
        : "Draft";
  const statusTone =
    site.status === "published"
      ? { fg: COLORS.successDeep, bg: COLORS.successSoft }
      : site.status === "unpublished"
        ? { fg: COLORS.amberDeep, bg: COLORS.amberSoft }
        : { fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        padding: "12px 14px",
        background: COLORS.surfaceAlt,
        borderRadius: 10,
        fontFamily: FONTS.body,
        marginBottom: 12,
      }}
    >
      <StatusField
        label="Status"
        value={
          <span
            style={{
              padding: "2px 8px",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: statusTone.fg,
              background: statusTone.bg,
              borderRadius: 999,
            }}
          >
            {statusLabel}
          </span>
        }
      />
      <StatusField label="Draft updated" value={formatWhen(site.draftUpdatedAt)} />
      {site.publishedAt ? (
        <StatusField label="Last published" value={formatWhen(site.publishedAt)} />
      ) : null}
      <StatusField label="Version" value={`v${site.version}`} />
    </div>
  );
}

function StatusField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.ink }}>{value}</div>
    </div>
  );
}

function PreviewLinks({ state }: { state: TalentSiteDashboardState }) {
  const items: { href: string; label: string }[] = [];
  if (state.publicSiteUrl && state.site?.hasPublishedSnapshot) {
    items.push({ href: state.publicSiteUrl, label: "View published site" });
  }
  if (state.profileCode) {
    items.push({ href: `/t/${state.profileCode}?preview=draft`, label: "Preview draft (owner)" });
  }
  if (state.publicProfileUrl) {
    items.push({ href: state.publicProfileUrl, label: "Standard profile" });
  }
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {items.map((item) => (
        <Link
          key={`${item.label}:${item.href}`}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.ink,
            textDecoration: "none",
            fontFamily: FONTS.body,
          }}
        >
          {item.label} ↗
        </Link>
      ))}
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
