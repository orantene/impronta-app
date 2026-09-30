"use client";

/**
 * TalentMaxSiteManager — the My website tab body on `/talent/site` (the
 * multi-page website served at `/t/site/<slug>`, SEPARATE from the
 * `/t/<code>` discovery profile).
 *
 * P1 mockup:
 *   - LIVE (any published design slug): exactly one card, MyWebsiteCard.
 *   - Before live: the unlock state (WebsiteEligibilityPanel). "Activate your
 *     free website" opens the design gallery (MaisonSetupHost, or the theme
 *     gallery when the Maison flag is off).
 *   - Site address, logo, pages, shell and custom domain live in Website
 *     settings (TalentMaxSiteSettingsPanels), not on this tab.
 *
 * A non-editing tier sees an upsell card (not a 404). All writes are
 * owner-gated server actions; RLS independently backs them.
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useTransition } from "react";

import { ManagerThemeGallery } from "@/components/talent/site/theme-gallery/ManagerThemeGallery";
import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import type { MaisonSetupScreen } from "@/components/talent/site/maison-setup/maison-choices";
import { invalidateWebsiteEligibility } from "@/components/talent/studio/useWebsiteEligibility";
import { WebsiteEligibilityPanel } from "@/components/talent/studio/WebsiteEligibilityPanel";
import {
  consumeWebsiteSetupRequest,
  WEBSITE_SETUP_REQUEST_EVENT,
} from "@/components/talent/website-reward/useWebsiteFlow";
import type { WebsiteSetupStep } from "@/lib/talent/website-flow";

/** Maison Choose-a-design chrome — lazy so flag-off / non-site routes skip the chunk. */
const MaisonSetupHost = dynamic(
  () =>
    import("@/components/talent/site/maison-setup/MaisonSetupHost").then((m) => m.MaisonSetupHost),
  { ssr: false },
);
const MyWebsiteCard = dynamic(
  () =>
    import("@/components/talent/site/maison-setup/MyWebsiteCard").then((m) => m.MyWebsiteCard),
  { ssr: false },
);
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import {
  loadMaxSiteManagerAction,
  publishMaxSiteAction,
} from "@/lib/talent-site/server/site-management-actions";
import type { MaxSiteManagerState } from "@/lib/talent-site/server/site-management-types";
import { isThemeApplyBusy, useThemeApplyBusy } from "@/lib/talent-site/history/apply-busy";

type Props = { locale?: "en" | "es" };

export function TalentMaxSiteManager({ locale = "en" }: Props) {
  const copy = useDashboardText();
  const [state, setState] = useState<MaxSiteManagerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Never hang on "Loading your website…": a thrown action lands in `error`.
  const reload = useCallback(async () => {
    try {
      const res = await loadMaxSiteManagerAction();
      if (!res.ok) {
        setError(res.error);
        setState(null);
      } else {
        setError(null);
        setState(res.data ?? null);
      }
      // Design applied / published / unpublished: pill + cards re-read.
      invalidateWebsiteEligibility();
    } catch (cause) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console -- dev-only signal for a thrown load
        console.warn("[talent-site] loadMaxSiteManagerAction threw", cause);
      }
      setError(copy.t("Could not load your website."));
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const retry = () => {
    setLoading(true);
    setError(null);
    void reload();
  };

  if (loading) {
    return <Card><span style={mutedText}>{copy.t("Loading your website…")}</span></Card>;
  }
  if (error || !state) {
    return (
      <Card data-testid="talent-site-load-error">
        <span style={{ ...mutedText, color: COLORS.criticalDeep }}>
          {error ?? copy.t("Could not load your website.")}
        </span>{" "}
        <button type="button" onClick={retry} style={linkButton}>
          {copy.t("Try again")}
        </button>
      </Card>
    );
  }

  if (!state.canManage) {
    return <UpsellCard />;
  }

  return <ManagerBody state={state} onReload={reload} locale={locale} />;
}

// ── Upsell (non-Max) ─────────────────────────────────────────────────────────

function UpsellCard() {
  const { openDrawer } = useAdminShell();
  return (
    <Card>
      <Badge>PORTFOLIO FEATURE</Badge>
      <h3 style={{ margin: "10px 0 6px", fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, color: COLORS.ink }}>
        Your own website
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55, maxWidth: 560 }}>
        Upgrade to Portfolio to build a full multi-page website with your own header, logo,
        footer, and a custom address — published at its own link, separate from your
        discovery profile.
      </p>
      <PrimaryButton onClick={() => openDrawer("talent-tier-compare")}>See plans</PrimaryButton>
    </Card>
  );
}

// ── Manager body ─────────────────────────────────────────────────────────────

function ManagerBody({
  state,
  onReload,
  locale,
}: {
  state: MaxSiteManagerState;
  onReload: () => Promise<void>;
  locale: "en" | "es";
}) {
  const copy = useDashboardText();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [maisonForceScreen, setMaisonForceScreen] = useState<MaisonSetupScreen | null>(null);
  const [maisonForceReason, setMaisonForceReason] = useState<"restored" | "resume">("restored");
  const [maisonSetupEnabled, setMaisonSetupEnabled] = useState(false);
  /** Before live: the gallery opens only from "Activate your free website". */
  const [setupOpen, setSetupOpen] = useState(false);
  // Today / pill / My presence ask for a step; open the flow AT that step
  // (a chosen design resumes at review, never back at the gallery).
  const openSetup = useCallback((step: WebsiteSetupStep) => {
    setSetupOpen(true);
    if (step === "review") {
      setMaisonForceReason("resume");
      setMaisonForceScreen("review");
    }
  }, []);
  useEffect(() => {
    const take = () => {
      const step = consumeWebsiteSetupRequest();
      if (step) openSetup(step);
    };
    take();
    window.addEventListener(WEBSITE_SETUP_REQUEST_EVENT, take);
    return () => window.removeEventListener(WEBSITE_SETUP_REQUEST_EVENT, take);
  }, [openSetup]);
  /** P5: "✓ <Design> is live" after a live design switch. */
  const [liveToast, setLiveToast] = useState<string | null>(null);

  // Live card for ANY published design slug (maison, maison-v2, solace, …).
  const maisonLive = Boolean(state.sitePublishedAt);
  const hostHidden = maisonLive || !setupOpen;

  const applyBusy = useThemeApplyBusy();
  function handlePublish() {
    if (isThemeApplyBusy()) return;
    startTransition(async () => {
      setActionError(null);
      const res = await publishMaxSiteAction();
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      await onReload();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-talent-max-site-manager>
      {maisonLive ? (
        <MyWebsiteCard
          locale={locale}
          publicSiteUrl={state.publicSiteUrl}
          siteSlug={state.siteSlug}
          themeDesignSlug={state.themeDesignSlug}
          themeLookSlug={state.themeLookSlug}
          legacyProfileTemplate={state.legacyProfileTemplate}
          publishedAt={state.sitePublishedAt}
          contentModeLabel="mine"
          onChangeDesign={() => {
            setMaisonForceReason("restored");
            setMaisonForceScreen("gallery");
          }}
          onRestoredToReview={() => {
            setMaisonForceReason("restored");
            setMaisonForceScreen("review");
          }}
          liveToast={liveToast}
          onLiveToastDone={() => setLiveToast(null)}
        />
      ) : setupOpen ? null : (
        <WebsiteEligibilityPanel onActivate={openSetup} />
      )}

      {/* Maison Choose-a-design / Theme detail / Review. Flag-off → null. */}
      <MaisonSetupHost
        forceScreen={maisonForceScreen}
        forceScreenReason={maisonForceReason}
        onForceScreenConsumed={() => setMaisonForceScreen(null)}
        onPublished={(toast) => {
          setLiveToast(toast ?? null);
          setMaisonForceScreen(null);
          setSetupOpen(false);
          void onReload();
        }}
        onCloseToSite={() => {
          setMaisonForceScreen(null);
          setSetupOpen(false);
          invalidateWebsiteEligibility();
        }}
        siteLive={hostHidden}
        liveAddress={liveHost(state.publicSiteUrl)}
        onEnabledChange={setMaisonSetupEnabled}
      />

      {/* Maison flag off: the theme gallery is the design gallery (AUD-034). */}
      {hostHidden || maisonSetupEnabled ? null : (
        <>
          <ManagerThemeGallery
            locale={locale}
            onApplied={onReload}
            wrap={(gallery) => <Card>{gallery}</Card>}
            fallback={
              <Card>
                <Link href="/talent/page-builder" style={linkButton}>
                  {copy.t("Edit site")}
                </Link>
              </Card>
            }
          />
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <PrimaryButton onClick={handlePublish} disabled={pending || applyBusy}>
                {pending ? copy.t("Publishing…") : copy.t("Publish site")}
              </PrimaryButton>
              <button type="button" onClick={() => setSetupOpen(false)} style={linkButton}>
                {copy.t("Back to My website")}
              </button>
            </div>
            {actionError ? (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: COLORS.criticalDeep }}>{actionError}</p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        padding: "16px 18px",
        fontFamily: FONTS.body,
        ...(rest.style ?? {}),
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, background: COLORS.successSoft, color: COLORS.successDeep, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>
      {children}
    </span>
  );
}

const mutedText: React.CSSProperties = {
  fontFamily: FONTS.body,
  fontSize: 12.5,
  color: COLORS.inkMuted,
};

const linkButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 13px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.card,
  color: COLORS.ink,
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: FONTS.body,
};

function liveHost(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
