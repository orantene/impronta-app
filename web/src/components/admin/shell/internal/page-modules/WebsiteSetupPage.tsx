"use client";

/**
 * WebsiteSetupPage.tsx — Website → Setup.
 *
 * WHERE THIS CAME FROM
 * ────────────────────
 * Overview used to end with a three-column "Configuration" card (Domain / SEO
 * defaults / Tracking chips) squeezed under the pages list. It was the least
 * visited thing on the busiest page, three unrelated jobs in one row, and it
 * had no room to explain any of them. It now lives here with room to breathe,
 * and Overview ends on the content it is actually about.
 *
 * HONESTY RULES THIS FILE FOLLOWS
 * ───────────────────────────────
 * Only fields that `mergeWebsiteStateFromBridge` (state/fixtures.ts) actually
 * projects from live data are rendered as settings:
 *
 *   REAL  — `seo.siteTitle`, `seo.description`, `seo.canonicalDomain`, and the
 *           whole `domain` patch (primary host, DNS status, SSL, DNS records).
 *   NOT   — `seo.robotsMode`, `seo.sitemapEnabled` and `seo.titleTemplate` are
 *           spread straight off the `WEBSITE_STATE` prototype fixture (the
 *           template is derived from the tenant name, not a stored setting).
 *           Showing them as live settings would be the panel inventing a fact,
 *           so they are omitted entirely rather than shown greyed out.
 *
 * Custom code and Tracking USED to be "not set up yet" cards here. As of P3-C
 * and P3-D they are real surfaces — `cms_code_snippets` (`WebsiteCustomCode
 * .tsx`) and `agencies.settings.tracking` (`WebsiteTracking.tsx`) — so both
 * placeholders and every catalog key they owned are gone rather than left to
 * rot. The `WEBSITE_STATE.tracking.*` prototype fixture is NOT what the Tracking
 * section reads: that module loads the stored config through its own server
 * action, so nothing on this page invents a fact about tracking any more.
 *
 * STYLING — token classes only (`ratchet/no-new-inline-style`). Nothing was
 * carried over from Overview's inline-styled markup: a moved style counts as a
 * new one to that rule.
 */

import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { InfoTip } from "@/components/ui/info-tip";

import { Icon } from "../primitives";
import { meetsRole, useAdminShell } from "../state";
import { PageHeader } from "./pages-shared";
import { WebsiteCustomCode } from "./WebsiteCustomCode";
import { WebsiteTracking } from "./WebsiteTracking";

/** Section shell — heading, one plain sentence, optional trailing action. */
function SetupSection({
  heading,
  helper,
  action,
  children,
}: {
  heading: string;
  helper: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
      <div className="mb-[12px] flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
        <h2 className="m-0 text-admin-15 font-semibold text-admin-ink">{heading}</h2>
        <span className="min-w-0 flex-1 text-admin-11h text-admin-ink-muted">{helper}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Dot + label + value. The Overview equivalent, rebuilt on token classes. */
function SetupStatusRow({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center gap-[8px] text-admin-12h">
      <span
        aria-hidden
        className={`size-[6px] shrink-0 rounded-full ${ok ? "bg-admin-success-deep" : "bg-admin-amber-deep"}`}
      />
      <span className="min-w-[64px] text-admin-10h font-semibold uppercase tracking-[0.3px] text-admin-ink-muted">
        {label}
      </span>
      <span className="ml-auto truncate text-right font-medium text-admin-ink">{value}</span>
    </div>
  );
}

/** Label above, value below. Used for the three real search fields. */
function SetupField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-admin-10h font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
        {label}
      </span>
      <span
        className={`break-words text-admin-12h text-admin-ink ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export function WebsiteSetupPage() {
  const t = useT();
  const router = useRouter();
  const {
    state,
    openDrawer,
    effectiveWebsiteState,
    adminBasePath,
    bridgeSessionIdentity,
  } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  const w = effectiveWebsiteState;
  const records = w.domain.dnsRecords ?? [];
  const matchedRecords = records.filter((r) => r.matched).length;

  return (
    <>
      <PageHeader
        title={t("dashboard.adminWebsite.setup.title")}
        subtitle={t("dashboard.adminWebsite.setup.subtitle")}
      />
      <div className="flex flex-col gap-[14px]">
        {/* Web address — the domain summary plus the drawer that changes it. */}
        <SetupSection
          heading={t("dashboard.adminWebsite.setup.addressHeading")}
          helper={t("dashboard.adminWebsite.setup.addressHelper")}
          action={
            canEdit ? (
              <button
                type="button"
                onClick={() => openDrawer("domain")}
                className="shrink-0 cursor-pointer rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[5px] text-admin-11h font-semibold text-admin-accent-deep"
              >
                {t("dashboard.adminWebsite.manageArrow")}
              </button>
            ) : undefined
          }
        >
          <div className="mb-[12px] break-all font-mono text-admin-15 font-semibold text-admin-ink">
            {w.domain.primaryDomain}
          </div>
          <div className="flex flex-col gap-[7px]">
            <SetupStatusRow
              label={t("dashboard.adminWebsite.dnsLabel")}
              ok={w.domain.status === "verified"}
              value={
                w.domain.status === "verified"
                  ? t("dashboard.adminWebsite.dnsVerified")
                  : t("dashboard.adminWebsite.dnsPending")
              }
            />
            <SetupStatusRow
              label={t("dashboard.adminWebsite.sslLabel")}
              ok={w.domain.sslStatus === "active"}
              value={
                w.domain.sslStatus === "active"
                  ? interpolate(t("dashboard.adminWebsite.sslActiveRenews"), {
                      date: w.domain.sslExpiresOn ?? "—",
                    })
                  : w.domain.sslStatus
              }
            />
            <SetupStatusRow
              label={t("dashboard.adminWebsite.recordsLabel")}
              ok={records.length > 0 && matchedRecords === records.length}
              value={interpolate(t("dashboard.adminWebsite.recordsMatched"), {
                matched: matchedRecords,
                total: records.length,
              })}
            />
          </div>
        </SetupSection>

        {/* Search settings — ONLY the three fields the bridge really writes. */}
        <SetupSection
          heading={t("dashboard.adminWebsite.setup.searchHeading")}
          helper={t("dashboard.adminWebsite.setup.searchHelper")}
          action={
            <InfoTip
              label={t("dashboard.adminWebsite.setup.searchInfo")}
              triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
              placement="bottom-end"
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          }
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[14px]">
            <SetupField
              label={t("dashboard.adminWebsite.setup.searchTitleLabel")}
              value={w.seo.siteTitle || t("dashboard.adminWebsite.notSet")}
            />
            <SetupField
              label={t("dashboard.adminWebsite.setup.searchDescriptionLabel")}
              value={w.seo.description || t("dashboard.adminWebsite.notSet")}
            />
            <SetupField
              label={t("dashboard.adminWebsite.seoCanonical")}
              value={w.seo.canonicalDomain || t("dashboard.adminWebsite.notSet")}
              mono
            />
          </div>
          <p className="m-0 mt-[10px] text-admin-11h leading-relaxed text-admin-ink-muted">
            {t("dashboard.adminWebsite.setup.searchFootnote")}
          </p>
        </SetupSection>

        {/* Redirects — gated on the SAME capability the route enforces, so this
            is never a link to a page that refuses the caller. */}
        {bridgeSessionIdentity?.canEditSitePages ? (
          <SetupSection
            heading={t("dashboard.adminWebsite.setup.redirectsHeading")}
            helper={t("dashboard.adminWebsite.setup.redirectsHelper")}
          >
            <button
              type="button"
              onClick={() => router.push(`${adminBasePath}/website/redirects`)}
              className="inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink"
            >
              <Icon name="arrow-right" size={12} stroke={1.7} />
              {t("dashboard.adminWebsite.setup.redirectsAction")}
            </button>
          </SetupSection>
        ) : null}

        {/* Custom code — a real surface as of P3-C. The snippet library owns its
            own loading / permission / error states, so this section is just the
            heading and the InfoTip that explains the two placements. */}
        <SetupSection
          heading={t("dashboard.adminWebsite.setup.customCodeHeading")}
          helper={t("dashboard.adminWebsite.setup.customCodeHelper")}
          action={
            <InfoTip
              label={t("dashboard.adminWebsite.setup.customCode.placementInfo")}
              triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
              placement="bottom-end"
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          }
        >
          <WebsiteCustomCode />
        </SetupSection>

        {/* Tracking — a real surface as of P3-D. Like Custom code above, the
            module owns its own loading / permission / error states, so this
            section is just the heading and the InfoTip. */}
        <SetupSection
          heading={t("dashboard.adminWebsite.setup.trackingHeading")}
          helper={t("dashboard.adminWebsite.setup.trackingHelper")}
          action={
            <InfoTip
              label={t("dashboard.adminWebsite.setup.tracking.sectionInfo")}
              triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
              placement="bottom-end"
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          }
        >
          <WebsiteTracking />
        </SetupSection>
      </div>
    </>
  );
}
