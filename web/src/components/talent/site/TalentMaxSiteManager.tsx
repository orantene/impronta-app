"use client";

/**
 * TalentMaxSiteManager — the My website tab body on `/talent/site` (the
 * multi-page website served at `/t/site/<slug>`, SEPARATE from the
 * `/t/<code>` discovery profile).
 *
 * P1 mockup:
 *   - LIVE (any published design slug): MyWebsiteCard + Custom domain row.
 *   - Before live: the unlock state (WebsiteEligibilityPanel). "Activate your
 *     free website" opens the design gallery (MaisonSetupHost, or the theme
 *     gallery when the Maison flag is off).
 *   - Site address, logo, pages and shell live in Website settings
 *     (TalentMaxSiteSettingsPanels). Custom domain stays on this tab.
 *
 * A non-editing tier sees an upsell card (not a 404). All writes are
 * owner-gated server actions; RLS independently backs them.
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useTransition } from "react";

import { ManagerThemeGallery } from "@/components/talent/site/theme-gallery/ManagerThemeGallery";
import {
  PresenceLiveFallback,
  type PresenceLiveFallbackScreen,
} from "@/components/talent/site/PresenceLiveFallback";
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
import { SitePublishEntry } from "@/components/talent/site/maison-setup/SitePublishEntry";
import { sitePublishEntryState } from "@/components/talent/site/maison-setup/site-publish-entry";
import { PresenceSiteTiles } from "@/components/talent/site/maison-setup/MyWebsiteCard";
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import { takeOr } from "./public-page-bootstrap";
import { CreateMySiteCard } from "./CreateMySiteCard";
import {
  loadMaxSiteManagerAction,
  publishMaxSiteAction,
} from "@/lib/talent-site/server/site-management-actions";
import type { MaxSiteManagerState } from "@/lib/talent-site/server/site-management-types";
import { isThemeApplyBusy, useThemeApplyBusy } from "@/lib/talent-site/history/apply-busy";
import { CustomDomainRow } from "@/components/talent/site/CustomDomainRow";
import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";
import {
  PERSONAL_SITE_BUILDER_HREF,
  resolveTalentDashboardMyWebsite,
} from "@/lib/talent-site/dashboard-my-website";

type Props = { locale?: "en" | "es" };

type ManagerProps = Props & {
  onOpenDomain?: () => void;
  onOpenQuestions?: () => void;
  onOpenSettings?: () => void;
  onOpenApps?: () => void;
  /** When true, CustomDomainRow is omitted (Wave 3 Domain tile owns it). */
  hideDomainRow?: boolean;
};

export function TalentMaxSiteManager({
  locale = "en",
  onOpenDomain,
  onOpenQuestions,
  onOpenSettings,
  onOpenApps,
  hideDomainRow = false,
}: ManagerProps) {
  const copy = useDashboardText();
  const dashLoad = useTalentSiteDashboardInitialLoad();
  const myWebsite =
    dashLoad && dashLoad.ok ? resolveTalentDashboardMyWebsite(dashLoad.state) : null;
  const [state, setState] = useState<MaxSiteManagerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Never hang on "Loading your website…": a thrown action lands in `error`.
  const reload = useCallback(async () => {
    try {
      const res = await takeOr("manager", "manager", loadMaxSiteManagerAction);
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

  // TUL-180 Option A: dual / business owners treat the workspace site as
  // "My website". Keep a visible secondary personal card for dual owners so
  // the personal site stays reachable from Presence (not only Website settings).
  if (myWebsite?.kind === "workspace") {
    const isDual = Boolean(dashLoad?.ok && dashLoad.state.isDualSiteOwner);
    const personalUrl =
      dashLoad?.ok ? dashLoad.state.personalPublicSiteUrl ?? null : null;
    return (
      <div
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        data-talent-max-site-manager
        data-testid="workspace-primary-website"
      >
        <WorkspacePrimaryWebsiteCard
          publicUrl={myWebsite.publicUrl}
          editHref={myWebsite.editHref}
        />
        {isDual ? (
          <SecondaryPersonalWebsiteCard personalPublicUrl={personalUrl} />
        ) : null}
      </div>
    );
  }

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

  if (!state.siteExists) {
    return <CreateMySiteCard onCreated={reload} />;
  }

  return (
    <ManagerBody
      state={state}
      onReload={reload}
      locale={locale}
      onOpenDomain={onOpenDomain}
      onOpenQuestions={onOpenQuestions}
      onOpenSettings={onOpenSettings}
      onOpenApps={onOpenApps}
      hideDomainRow={hideDomainRow}
    />
  );
}

/** Compact Presence card when "My website" is the business workspace (TUL-180). */
function WorkspacePrimaryWebsiteCard({
  publicUrl,
  editHref,
}: {
  publicUrl: string | null;
  editHref: string;
}) {
  const copy = useDashboardText();
  const host = publicUrl ? publicUrl.replace(/^https?:\/\//, "") : null;
  return (
    <Card>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkMuted }}>
        {copy.t("My website")}
      </p>
      <h3
        style={{
          margin: "8px 0 6px",
          fontFamily: FONTS.display,
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.ink,
        }}
      >
        {host ?? copy.t("Your business website")}
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
        {copy.t("This is your business site. Edit pages, design and domain here.")}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link
          href={editHref}
          data-testid="workspace-primary-edit-site"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--tulala-primary-fill,#3B8277)] bg-[var(--tulala-primary-fill,#3B8277)] px-5 text-[14px] font-semibold text-white no-underline hover:border-[var(--tulala-primary-fill-deep,#326F66)] hover:bg-[var(--tulala-primary-fill-deep,#326F66)]"
        >
          {copy.t("Edit site")}
        </Link>
        {publicUrl ? (
          <Link
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="workspace-primary-view-site"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-admin-border-soft bg-white px-5 text-[14px] font-semibold text-admin-ink no-underline"
          >
            {copy.t("Open site")}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

/** Dual-owner escape hatch: personal site stays visible on Presence (TUL-180). */
function SecondaryPersonalWebsiteCard({
  personalPublicUrl,
}: {
  personalPublicUrl: string | null;
}) {
  const copy = useDashboardText();
  const host = personalPublicUrl
    ? personalPublicUrl.replace(/^https?:\/\//, "")
    : null;
  return (
    <Card data-testid="secondary-personal-website">
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkMuted }}>
        {copy.t("Other websites")}
      </p>
      <h3
        style={{
          margin: "8px 0 6px",
          fontFamily: FONTS.display,
          fontSize: 16,
          fontWeight: 700,
          color: COLORS.ink,
        }}
      >
        {copy.t("Personal site")}
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
        {host
          ? host
          : copy.t("Edit your personal site separately from your business site.")}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link
          href={PERSONAL_SITE_BUILDER_HREF}
          data-testid="secondary-personal-edit-site"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-admin-border-soft bg-white px-5 text-[14px] font-semibold text-admin-ink no-underline"
        >
          {copy.t("Edit site")}
        </Link>
        {personalPublicUrl ? (
          <Link
            href={personalPublicUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="secondary-personal-view-site"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-admin-border-soft bg-white px-5 text-[14px] font-semibold text-admin-ink no-underline"
          >
            {copy.t("Open site")}
          </Link>
        ) : null}
      </div>
    </Card>
  );
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
  onOpenDomain,
  onOpenQuestions,
  onOpenSettings,
  onOpenApps,
  hideDomainRow = false,
}: {
  state: MaxSiteManagerState;
  onReload: () => Promise<void>;
  locale: "en" | "es";
  onOpenDomain?: () => void;
  onOpenQuestions?: () => void;
  onOpenSettings?: () => void;
  onOpenApps?: () => void;
  hideDomainRow?: boolean;
}) {
  const copy = useDashboardText();
  const { openDrawer, bridgeTalentPlanTrial } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [maisonForceScreen, setMaisonForceScreen] = useState<MaisonSetupScreen | null>(null);
  const [maisonForceReason, setMaisonForceReason] = useState<"restored" | "resume">("restored");
  const [maisonSetupEnabled, setMaisonSetupEnabled] = useState(false);
  /** Bootstrap settled — distinguishes "still loading" from "cohort off". */
  const [maisonBootstrapSettled, setMaisonBootstrapSettled] = useState(false);
  /** Live card fallback when MaisonSetupHost stays off for this talent. */
  const [liveFallback, setLiveFallback] = useState<PresenceLiveFallbackScreen | null>(null);
  /** Before live: the gallery opens only from "Activate your free website". */
  const [setupOpen, setSetupOpen] = useState(false);
  /** Same entitlement gate as CustomDomainRow (capability + trial → plans). */
  const handleOpenDomain = useCallback(() => {
    const trialOn = bridgeTalentPlanTrial?.active === true;
    if (!state.capabilities.personalSiteCustomDomain || trialOn) {
      openDrawer("talent-tier-compare");
      return;
    }
    if (onOpenDomain) {
      onOpenDomain();
      return;
    }
    openDrawer("talent-custom-domain");
  }, [
    bridgeTalentPlanTrial?.active,
    onOpenDomain,
    openDrawer,
    state.capabilities.personalSiteCustomDomain,
  ]);
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

  // Return from domain Checkout → open Domain setup in provisioning state.
  // Param strip happens in TalentCustomDomainDrawer once it opens.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("domainCheckout") !== "done") return;
    if (!state.capabilities.personalSiteCustomDomain) return;
    openDrawer("talent-custom-domain");
  }, [openDrawer, state.capabilities.personalSiteCustomDomain]);

  // Live card for ANY published design slug (maison, maison-v2, solace, …).
  const maisonLive = Boolean(state.sitePublishedAt);
  const hostHidden = maisonLive || !setupOpen;

  // Cohort-off live talents: Change design / Apps must not no-op.
  useEffect(() => {
    if (!maisonBootstrapSettled || !maisonForceScreen) return;
    if (maisonSetupEnabled) return;
    if (maisonForceScreen === "apps") setLiveFallback("apps");
    else if (maisonForceScreen === "gallery" || maisonForceScreen === "review") {
      setLiveFallback("gallery");
    }
    setMaisonForceScreen(null);
  }, [maisonBootstrapSettled, maisonForceScreen, maisonSetupEnabled]);

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
          onOpenReview={() => openSetup("review")}
          hasReviewHost={maisonSetupEnabled}
          onRestoredToReview={() => {
            setMaisonForceReason("restored");
            setMaisonForceScreen("review");
          }}
          liveToast={liveToast}
          onLiveToastDone={() => setLiveToast(null)}
          onOpenDomain={handleOpenDomain}
          onOpenQuestions={onOpenQuestions}
          onOpenSettings={onOpenSettings}
          onOpenApps={
            onOpenApps ??
            (() => {
              setMaisonForceReason("restored");
              setMaisonForceScreen("apps");
            })
          }
          showTiles
        />
      ) : setupOpen ? null : (
        <>
          <WebsiteEligibilityPanel onActivate={openSetup} />
          <SitePublishEntry
            locale={locale === "es" ? "es" : "en"}
            state={sitePublishEntryState({
              published: false,
              publishable: Boolean(state.themeDesignSlug?.trim() && state.siteSlug),
              hasPending: null,
            })}
            publicSiteUrl={null}
            onOpenReview={() => openSetup("review")}
            hasReviewHost={maisonSetupEnabled}
          />
          {/* Pre-publish: Domain / Questions / Settings / Apps stay reachable
              when MyWebsiteCard (live-only) is not mounted. */}
          {hideDomainRow || onOpenQuestions || onOpenSettings || onOpenApps ? (
            <div
              data-testid="presence-prepublish-tools"
              className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white font-admin-body"
            >
              <PresenceSiteTiles
                locale={locale}
                onOpenDomain={handleOpenDomain}
                onOpenQuestions={onOpenQuestions}
                onOpenSettings={onOpenSettings}
                onOpenApps={
                  onOpenApps ??
                  (() => {
                    setMaisonForceReason("restored");
                    setMaisonForceScreen("apps");
                  })
                }
              />
            </div>
          ) : null}
        </>
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
        onEnabledChange={(enabled) => {
          setMaisonSetupEnabled(enabled);
          setMaisonBootstrapSettled(true);
        }}
      />

      {liveFallback ? (
        <PresenceLiveFallback
          screen={liveFallback}
          locale={locale === "es" ? "es" : "en"}
          onClose={() => setLiveFallback(null)}
          onApplied={async () => {
            setLiveFallback(null);
            await onReload();
          }}
        />
      ) : null}

      {/* Maison flag off: the theme gallery is the design gallery (AUD-034). */}
      {hostHidden || maisonSetupEnabled ? null : (
        <>
          <ManagerThemeGallery
            locale={locale}
            onApplied={onReload}
            onPublish={handlePublish}
            publishPending={pending}
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

      {hideDomainRow ? null : (
        <CustomDomainRow canManage={state.capabilities.personalSiteCustomDomain} />
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
