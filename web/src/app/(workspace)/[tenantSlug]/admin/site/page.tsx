// Phase 3.5 — canonical workspace Website page.
// Server RSC. Matches prototype WebsitePage design.
//
// Sections: hero banner · pages card grid · posts + redirects 2-col ·
// configuration 3-col (domain / SEO / tracking).
//
// Performance section skipped — no analytics schema yet.
// Site banners (maintenance / announcement) skipped — no schema yet.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { resolveWorkspacePublicAddress } from "@/lib/saas/workspace-public-url";
import { resolveWorkspacePreviewUrl } from "@/lib/site-admin/server/tenant-hosts";
import { userHasCapability } from "@/lib/access";
import {
  checkCustomDomainProvisioningAction,
  connectCustomDomainAction,
  removeCustomDomainAction,
  switchPrimaryDomainAction,
  verifyCustomDomainNowAction,
} from "../settings/domain-actions";
import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  customDomainNeedsRouting,
} from "@/lib/saas/custom-domain-routing";
import {
  filterOperatorFacingCustomDomains,
  filterOperatorFacingSubdomains,
  findPrimaryCustomDomain,
  isLocalPreviewHost,
  listAlternateCustomDomains,
  resolveCustomDomainAliasRedirect,
  suggestAlternateCustomDomainHostname,
} from "@/lib/saas/domain-display";
import { loadWebsiteData, loadWorkspaceAgencySummary } from "../../_data-bridge";
import { CopyUrlButton } from "./CopyUrlButton";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{
  dmsg?: string | string[];
  derr?: string | string[];
}>;
type WebsiteDomainSummary = Awaited<ReturnType<typeof loadWebsiteData>>["domainSummary"];
type DomainLifecycleStatus = NonNullable<WebsiteDomainSummary["primaryHostStatus"]>;
type DomainHealth = "ok" | "warn";
type DomainSummaryState = { status: DomainHealth; value: string };

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  border:      "rgba(24,24,27,0.08)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  surfaceAlt:  "rgba(11,11,13,0.025)",
  accent:      "#0F4F3E",
  accentDeep:  "#0A3830",
  accentSoft:  "rgba(15,79,62,0.08)",
  fill:        "#0F4F3E",
  fillDeep:    "#0A3830",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
  indigoDeep:  "#2B3FA3",
  indigoSoft:  "rgba(43,63,163,0.07)",
} as const;

const FONT    = '"Inter", system-ui, sans-serif';
const MONO    = '"ui-monospace", "Cascadia Code", monospace';

// ─── Tiny utilities ───────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}

const TXT_READY_STATUSES = new Set(["verified", "ssl_provisioned", "active"]);
const ROUTING_READY_STATUSES = new Set(["ssl_provisioned", "active"]);
const CUSTOM_DOMAIN_ELIGIBLE_PLANS = new Set(["agency", "network", "legacy"]);
const DOMAIN_STATUS_LABEL: Record<DomainLifecycleStatus, string> = {
  pending: "Pending",
  dns_verification_sent: "Waiting on DNS",
  verified: "Verified",
  ssl_provisioned: "SSL provisioned",
  active: "Active",
  failed: "Needs attention",
  suspended: "Suspended",
};

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    if (first) return first.trim().slice(0, 200);
  }
  return null;
}

function isTxtReadyStatus(status: string | null): boolean {
  return TXT_READY_STATUSES.has(status ?? "");
}

function isRoutingReadyStatus(status: string | null): boolean {
  return ROUTING_READY_STATUSES.has(status ?? "");
}

function formatDomainDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function describeCustomDomainStatus(domain: {
  status: string;
  verifiedAt: string | null;
  failureReason: string | null;
}): string {
  if (domain.status === "ssl_provisioned") {
    return "Routing detected. HTTPS is still finishing on Vercel.";
  }
  if (domain.status === "verified") {
    return domain.verifiedAt
      ? `Ownership verified ${formatDomainDate(domain.verifiedAt)}. Add the routing record to go live.`
      : "Ownership verified. Add the routing record to go live.";
  }
  if (domain.verifiedAt) {
    return `Verified ${formatDomainDate(domain.verifiedAt)}`;
  }
  return domain.failureReason ?? "Awaiting verification";
}

function describeSuggestedAlternateDomain(
  hostname: string,
  primaryHostname: string,
): string {
  return hostname.startsWith("www.")
    ? `Add ${hostname} so visitors who type the www version still land on ${primaryHostname}.`
    : `Add ${hostname} so the bare domain also resolves and redirects to ${primaryHostname}.`;
}

function describeAliasRedirectMode(mode: "bare_to_www" | "www_to_bare"): string {
  return mode === "bare_to_www" ? "Bare to www" : "www to bare";
}

function describeAliasRedirectPolicy(mode: "bare_to_www" | "www_to_bare", primaryHostname: string): string {
  return mode === "bare_to_www"
    ? `Requests to the bare domain redirect to ${primaryHostname}.`
    : `Requests to the www host redirect to ${primaryHostname}.`;
}

function customDomainsForDisplay(domainSummary: WebsiteDomainSummary) {
  return filterOperatorFacingCustomDomains(domainSummary.customDomains);
}

function subdomainsForDisplay(domainSummary: WebsiteDomainSummary) {
  return filterOperatorFacingSubdomains(domainSummary.subdomains);
}

function formatPrimaryDomainUrl(hostname: string): string {
  if (process.env.NODE_ENV !== "production" && isLocalPreviewHost(hostname)) {
    return `http://${hostname}:3000`;
  }
  return `https://${hostname}`;
}

function resolveDnsSummary(
  kind: "path" | "subdomain" | "custom" | null,
  domainSummary: WebsiteDomainSummary,
): DomainSummaryState {
  const displayCustomDomains = customDomainsForDisplay(domainSummary);
  if (kind === "path") {
    return { status: "ok", value: "Platform-managed" };
  }
  if (kind === "subdomain" && displayCustomDomains.length === 0) {
    return { status: "ok", value: "Platform-managed" };
  }
  if (displayCustomDomains.length > 0) {
    const readyCount = displayCustomDomains.filter((domain) => isTxtReadyStatus(domain.status)).length;
    const failed = displayCustomDomains.some(
      (domain) => domain.status === "failed" || domain.status === "suspended",
    );
    if (failed) {
      return { status: "warn", value: "Needs attention" };
    }
    if (readyCount === displayCustomDomains.length) {
      return { status: "ok", value: "Verified" };
    }
    return {
      status: "warn",
      value: `Pending ${readyCount}/${displayCustomDomains.length}`,
    };
  }
  return { status: "warn", value: "Not configured" };
}

function resolveSslSummary(
  kind: "path" | "subdomain" | "custom" | null,
  domainSummary: WebsiteDomainSummary,
): DomainSummaryState {
  const displayCustomDomains = customDomainsForDisplay(domainSummary);
  if (kind === "path") {
    return { status: "ok", value: "Active · auto-renew" };
  }
  if (kind === "subdomain") {
    return { status: "ok", value: "Active · auto-renew" };
  }
  if (displayCustomDomains.length === 0) {
    return { status: "warn", value: "Unavailable" };
  }
  if (displayCustomDomains.every((domain) => domain.status === "active")) {
    return { status: "ok", value: "Active · auto-renew" };
  }
  if (displayCustomDomains.some((domain) => domain.status === "failed")) {
    return { status: "warn", value: "Blocked" };
  }
  if (displayCustomDomains.some((domain) => domain.status === "suspended")) {
    return { status: "warn", value: "Suspended" };
  }
  if (displayCustomDomains.some((domain) => domain.status === "ssl_provisioned")) {
    return { status: "ok", value: "Provisioned" };
  }
  if (displayCustomDomains.some((domain) => domain.status === "verified")) {
    return { status: "warn", value: "Queued after DNS" };
  }
  if (kind === "custom") {
    return { status: "warn", value: "Waiting on DNS" };
  }
  return { status: "ok", value: "Active · auto-renew" };
}

function resolveRecordSummary(
  kind: "path" | "subdomain" | "custom" | null,
  domainSummary: WebsiteDomainSummary,
): DomainSummaryState {
  const displayCustomDomains = customDomainsForDisplay(domainSummary);
  if (kind === "path") {
    return { status: "ok", value: "Path-based" };
  }
  if (kind === "subdomain" && displayCustomDomains.length === 0) {
    return { status: "ok", value: "Tulala-managed" };
  }
  const verificationRows = displayCustomDomains.filter((domain) => Boolean(domain.verificationToken));
  if (verificationRows.length === 0) {
    if (displayCustomDomains.length > 0) {
      const matchedCount = displayCustomDomains.filter((domain) => isRoutingReadyStatus(domain.status)).length;
      return {
        status: matchedCount === displayCustomDomains.length ? "ok" : "warn",
        value: `${matchedCount}/${displayCustomDomains.length} matched`,
      };
    }
    return kind === "custom"
      ? { status: "warn", value: "No records yet" }
      : { status: "ok", value: "Platform-managed" };
  }
  const matchedCount = verificationRows.filter((domain) => isTxtReadyStatus(domain.status)).length;
  return {
    status: matchedCount === verificationRows.length ? "ok" : "warn",
    value: `${matchedCount}/${verificationRows.length} matched`,
  };
}

function buildDnsRecordRows(domainSummary: WebsiteDomainSummary) {
  return customDomainsForDisplay(domainSummary)
    .filter((domain) => Boolean(domain.verificationToken))
    .map((domain) => ({
      hostname: domain.hostname,
      value: domain.verificationToken ?? "",
      matched: isTxtReadyStatus(domain.status),
      status: domain.status,
      isPrimary: domain.isPrimary,
    }));
}

// ─── Page status chip ─────────────────────────────────────────────────────────

function PageStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    published: { bg: C.successSoft, color: C.successDeep, label: "Live" },
    draft:     { bg: C.surfaceAlt,  color: C.inkDim,     label: "Draft" },
    scheduled: { bg: C.amberSoft,   color: C.amberDeep,  label: "Scheduled" },
    archived:  { bg: C.surfaceAlt,  color: C.inkDim,     label: "Archived" },
  };
  const s = map[status] ?? { bg: C.surfaceAlt, color: C.inkDim, label: status };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase" as const,
        flexShrink: 0,
        fontFamily: FONT,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Hero stat ────────────────────────────────────────────────────────────────

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 26,
          fontWeight: 600,
          color: "#fff",
          letterSpacing: -0.5,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.60)",
          marginTop: 4,
          fontWeight: 500,
          letterSpacing: 0.2,
          fontFamily: FONT,
        }}
      >
        {label}
        {sub && <span style={{ marginLeft: 4, opacity: 0.7 }}>· {sub}</span>}
      </div>
    </div>
  );
}

// ─── Browser-chrome page card ─────────────────────────────────────────────────

function PageCard({
  page,
  builderBase,
}: {
  page: {
    id: string;
    slug: string;
    title: string;
    status: string;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  builderBase: string;
}) {
  return (
    <Link
      href={builderBase}
      className="page-card"
      style={{
        textAlign: "left",
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        background: C.cardBg,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        transition: "transform 120ms, box-shadow 120ms, border-color 120ms",
      }}
    >
      {/* Faux browser chrome */}
      <div
        style={{
          height: 70,
          background: `linear-gradient(135deg, ${C.surfaceAlt} 0%, #fff 100%)`,
          borderBottom: `1px solid ${C.borderSoft}`,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 6,
            padding: "4px 8px",
            fontFamily: MONO,
            fontSize: 10.5,
            color: C.inkMuted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          /{page.slug}
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.1,
              lineHeight: 1.25,
              flex: 1,
              minWidth: 0,
              fontFamily: FONT,
            }}
          >
            {page.title}
          </div>
          <PageStatusChip status={page.status} />
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: C.inkMuted,
            fontFamily: FONT,
          }}
        >
          <span>{page.updatedBy ? `by ${page.updatedBy.slice(0, 12)}` : "—"}</span>
          <span>{fmtDate(page.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Config status row ─────────────────────────────────────────────────────────

function ConfigStatusRow({
  label,
  status,
  value,
}: {
  label: string;
  status: "ok" | "warn";
  value: string;
}) {
  const dot = status === "ok" ? C.successDeep : C.amberDeep;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: FONT }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span
        style={{
          color: C.inkMuted,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase" as const,
          fontSize: 10.5,
          minWidth: 60,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: C.ink,
          fontWeight: 500,
          marginLeft: "auto",
          textAlign: "right" as const,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 160,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DomainStatusPill({ status }: { status: DomainLifecycleStatus }) {
  const tone = status === "active" || status === "verified" || status === "ssl_provisioned"
    ? { bg: C.successSoft, color: C.successDeep }
    : status === "failed"
      ? { bg: "rgba(165,38,38,0.08)", color: "#8D1F1F" }
      : { bg: C.amberSoft, color: C.amberDeep };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        fontFamily: FONT,
        whiteSpace: "nowrap",
      }}
    >
      {DOMAIN_STATUS_LABEL[status]}
    </span>
  );
}

function NoticeBanner({
  kind,
  message,
}: {
  kind: "success" | "error";
  message: string;
}) {
  const styles = kind === "success"
    ? { bg: C.successSoft, border: "rgba(26,115,72,0.14)", color: C.successDeep }
    : { bg: "rgba(165,38,38,0.06)", border: "rgba(165,38,38,0.12)", color: "#8D1F1F" };

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.color,
        fontSize: 12,
        lineHeight: 1.45,
        fontFamily: FONT,
      }}
    >
      {message}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.7,
        textTransform: "uppercase" as const,
        color: C.inkDim,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function DomainActionButton({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "danger";
}) {
  const styles = tone === "danger"
    ? {
        border: "1px solid rgba(165,38,38,0.18)",
        background: "rgba(165,38,38,0.03)",
        color: "#8D1F1F",
      }
    : {
        border: `1px solid ${C.border}`,
        background: C.cardBg,
        color: C.ink,
      };

  return (
    <button
      type="submit"
      style={{
        border: styles.border,
        borderRadius: 999,
        background: styles.background,
        color: styles.color,
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        cursor: "pointer",
        fontFamily: FONT,
      }}
    >
      {label}
    </button>
  );
}

function DomainConnectSubmitButton({ hasExistingDomains }: { hasExistingDomains: boolean }) {
  return (
    <button
      type="submit"
      style={{
        flexShrink: 0,
        border: "none",
        borderRadius: 10,
        background: C.accent,
        color: C.cardBg,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "11px 14px",
        cursor: "pointer",
        fontFamily: FONT,
      }}
    >
      {hasExistingDomains ? "Add domain" : "Connect domain"}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceSitePage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const rawSearchParams = await searchParams;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const [canManage, canManageDomains, data, summary] = await Promise.all([
    userHasCapability("agency.site_admin.branding.edit", scope.tenantId),
    userHasCapability("manage_agency_domains", scope.tenantId),
    loadWebsiteData(scope.tenantId),
    loadWorkspaceAgencySummary(scope.tenantId),
  ]);
  const workspacePlan = summary?.plan ?? "free";
  const domainMessage = firstParam(rawSearchParams.dmsg);
  const domainError = firstParam(rawSearchParams.derr);

  const publicAddress = resolveWorkspacePublicAddress({
    slug: summary?.slug ?? tenantSlug,
    plan: workspacePlan,
    domainState: {
      primaryHost: data.domainSummary.primaryHost,
      primaryHostKind: data.domainSummary.primaryHostKind,
      subdomainHost: data.domainSummary.subdomainHost,
    },
  });
  const primaryHost = publicAddress.primaryHost;
  const primaryKind = publicAddress.primaryKind;
  const publicUrl = publicAddress.primaryKind === "path"
    ? publicAddress.primaryUrl
    : formatPrimaryDomainUrl(primaryHost);
  const previewUrl = resolveWorkspacePreviewUrl({
    slug: summary?.slug ?? tenantSlug,
    plan: workspacePlan,
    primaryHost: data.domainSummary.primaryHost,
    primaryHostKind: data.domainSummary.primaryHostKind,
    subdomainHost: data.domainSummary.subdomainHost,
    domainRows: [
      ...data.domainSummary.subdomains.map((domain) => ({
        hostname: domain.hostname,
        kind: "subdomain" as const,
        status: domain.status,
        isPrimary: domain.isPrimary,
      })),
      ...data.domainSummary.customDomains.map((domain) => ({
        hostname: domain.hostname,
        kind: "custom" as const,
        status: domain.status,
        isPrimary: domain.isPrimary,
      })),
    ],
  });
  const liveUrl = publicUrl;
  const canonicalHost = primaryHost;
  const dnsSummary = resolveDnsSummary(primaryKind, data.domainSummary);
  const sslSummary = resolveSslSummary(primaryKind, data.domainSummary);
  const recordSummary = resolveRecordSummary(primaryKind, data.domainSummary);
  const opensLocalPreview = previewUrl !== publicUrl;
  const pathHost = publicAddress.pathHost;
  const brandedHost = publicAddress.actualBrandedSubdomainHost ?? publicAddress.reservedBrandedSubdomainHost;
  const dnsRecordRows = buildDnsRecordRows(data.domainSummary);
  const connectedCustomDomains = customDomainsForDisplay(data.domainSummary)
    .slice()
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.hostname.localeCompare(b.hostname));
  const primaryCustomDomain = findPrimaryCustomDomain(connectedCustomDomains);
  const alternateCustomDomains = primaryCustomDomain
    ? listAlternateCustomDomains(connectedCustomDomains)
    : [];
  const aliasRedirect = resolveCustomDomainAliasRedirect(connectedCustomDomains);
  const suggestedAlternateDomain = suggestAlternateCustomDomainHostname(connectedCustomDomains);
  const customDomainFeatureUnlocked =
    data.domainSummary.customDomains.length > 0 ||
    CUSTOM_DOMAIN_ELIGIBLE_PLANS.has(workspacePlan);
  const canAddCustomDomains =
    canManageDomains && CUSTOM_DOMAIN_ELIGIBLE_PLANS.has(workspacePlan);
  const customDomainLockedCopy = workspacePlan === "free"
    ? "Branded subdomains unlock on Studio. Custom domains unlock on Agency and Network."
    : "Studio includes the branded Tulala subdomain. Custom domains unlock on Agency and Network.";
  const redirectMode = aliasRedirect?.mode
    ?? (primaryCustomDomain && suggestedAlternateDomain
      ? suggestedAlternateDomain.startsWith("www.")
        ? "www_to_bare"
        : "bare_to_www"
      : null);
  const pendingRoutingDomains = connectedCustomDomains.filter((domain) =>
    customDomainNeedsRouting(domain.status),
  );
  const brandedHosts = subdomainsForDisplay(data.domainSummary)
    .slice()
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.hostname.localeCompare(b.hostname));
  const brandedHostStatus = publicAddress.actualBrandedSubdomainHost
    ? brandedHosts.find((domain) => domain.hostname === publicAddress.actualBrandedSubdomainHost)?.status ?? null
    : null;
  const builderHref = `/admin/site-settings/sections`;

  const publishedPages  = data.pages.filter((p) => p.status === "published").length;
  const draftPages      = data.pages.filter((p) => p.status === "draft").length;
  const scheduledPages  = data.pages.filter((p) => p.status === "scheduled").length;
  const publishedPosts  = data.posts.filter((p) => p.status === "published").length;
  const activeRedirects = data.redirects.filter((r) => r.active).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT }}>
      {/* CSS hover effects for page cards */}
      <style>{`
        .page-card:hover { border-color: ${C.indigoDeep} !important; box-shadow: 0 4px 14px rgba(11,11,13,0.06); transform: translateY(-1px); }
        .post-row:hover  { background: ${C.surfaceAlt} !important; }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: C.accent,
              marginBottom: 4,
            }}
          >
            {scope.membership.display_name}
          </div>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              color: C.ink,
              margin: 0,
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            Website
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!canManage && (
            <span
              style={{
                fontSize: 11,
                color: C.inkMuted,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Read-only
            </span>
          )}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: -0.1,
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
            View live
          </a>
          <Link
            href={builderHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: -0.1,
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Open page builder
          </Link>
        </div>
      </div>

      {/* ── Hero gradient banner ── */}
      <section
        style={{
          background: `linear-gradient(135deg, ${C.fill} 0%, ${C.fillDeep} 100%)`,
          borderRadius: 14,
          padding: 20,
          color: "#fff",
          fontFamily: FONT,
        }}
      >
        {/* URL row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Live URL
          </span>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>
            {liveUrl}
          </span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              padding: "3px 9px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.30)",
              background: "transparent",
              color: "#fff",
              fontFamily: FONT,
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            Open ↗
          </a>
          <CopyUrlButton url={liveUrl} />
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#5BD893",
              }}
            />
            Live
          </span>
        </div>

        {/* Hero stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 14,
          }}
        >
          <HeroStat
            label="Pages live"
            value={publishedPages.toString()}
            sub={`${draftPages} draft`}
          />
          <HeroStat
            label="Posts"
            value={publishedPosts.toString()}
            sub={`${data.posts.length - publishedPosts} unpublished`}
          />
          <HeroStat
            label="Redirects active"
            value={activeRedirects.toString()}
            sub={`${data.redirects.length - activeRedirects} paused`}
          />
          <HeroStat
            label="Scheduled"
            value={scheduledPages.toString()}
            sub={scheduledPages > 0 ? "pending" : "none"}
          />
        </div>
      </section>

      {/* ── Pages section ── */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: FONT,
              fontSize: 18,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.2,
            }}
          >
            Pages
          </h2>
          <span style={{ fontSize: 11.5, color: C.inkMuted }}>
            {publishedPages} live · {draftPages} draft
            {scheduledPages > 0 ? ` · ${scheduledPages} scheduled` : ""}
          </span>
          {canManage && (
            <Link
              href={builderHref}
              style={{
                marginLeft: "auto",
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${C.borderSoft}`,
                background: C.cardBg,
                color: C.ink,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: FONT,
              }}
            >
              + New page
            </Link>
          )}
        </div>

        {data.pages.length === 0 ? (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: C.inkMuted,
              fontSize: 13,
              background: C.surface,
              borderRadius: 12,
              border: `1px dashed ${C.border}`,
              fontFamily: FONT,
            }}
          >
            No pages yet.{" "}
            <Link href={builderHref} style={{ color: C.accent, fontWeight: 600 }}>
              Open the page builder
            </Link>{" "}
            to create your first page.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {data.pages.map((p) => (
              <PageCard key={p.id} page={p} builderBase={builderHref} />
            ))}
          </div>
        )}
      </section>

      {/* ── Posts + Redirects 2-col ── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 14,
        }}
      >
        {/* Posts column */}
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: 16,
            fontFamily: FONT,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              Posts{" "}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: C.inkMuted,
                  marginLeft: 4,
                }}
              >
                {data.posts.length}
              </span>
            </h3>
            {canManage && (
              <Link
                href="/admin/site-settings/pages"
                style={{
                  fontSize: 11.5,
                  color: C.indigoDeep,
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: FONT,
                }}
              >
                + New post
              </Link>
            )}
          </div>

          {data.posts.length === 0 ? (
            <p style={{ fontSize: 13, color: C.inkMuted, margin: 0 }}>No posts yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.posts.map((p) => (
                <Link
                  key={p.id}
                  href="/admin/site-settings/pages"
                  className="post-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 9,
                    border: `1px solid ${C.borderSoft}`,
                    background: C.cardBg,
                    textDecoration: "none",
                    transition: "background 120ms",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <PageStatusChip status={p.status} />
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.ink,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.title}
                    </div>
                    <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: MONO, marginTop: 2 }}>
                      /{p.slug}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", color: C.inkMuted, fontSize: 11, flexShrink: 0 }}>
                    {fmtDate(p.updatedAt)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Redirects column */}
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: 16,
            fontFamily: FONT,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              Redirects{" "}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: C.inkMuted,
                  marginLeft: 4,
                }}
              >
                {activeRedirects}/{data.redirects.length}
              </span>
            </h3>
            {canManage && (
              <Link
                href="/admin/site-settings/system"
                style={{
                  fontSize: 11.5,
                  color: C.indigoDeep,
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: FONT,
                }}
              >
                + Add
              </Link>
            )}
          </div>

          {data.redirects.length === 0 ? (
            <p style={{ fontSize: 13, color: C.inkMuted, margin: 0 }}>No redirects configured.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.redirects.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: `1px solid ${C.borderSoft}`,
                    background: r.active ? C.cardBg : C.surfaceAlt,
                    opacity: r.active ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: C.indigoSoft,
                        color: C.indigoDeep,
                        fontFamily: MONO,
                      }}
                    >
                      {r.statusCode}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        fontWeight: 600,
                        color: r.active ? C.successDeep : C.inkDim,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {r.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: MONO,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        color: C.ink,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flexShrink: 1,
                        minWidth: 0,
                      }}
                    >
                      {r.oldPath}
                    </span>
                    <span style={{ color: C.inkDim, flexShrink: 0 }}>→</span>
                    <span
                      style={{
                        color: C.indigoDeep,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flexShrink: 1,
                        minWidth: 0,
                      }}
                    >
                      {r.newPath}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Configuration 3-col ── */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: FONT,
              fontSize: 18,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.2,
            }}
          >
            Configuration
          </h2>
          <span style={{ fontSize: 11.5, color: C.inkMuted }}>Domain · SEO · Tracking</span>
        </div>

        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {/* Domain column */}
          <div
            style={{
              padding: 18,
              borderRight: `1px solid ${C.borderSoft}`,
              fontFamily: FONT,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <SectionHead>Domain &amp; SSL</SectionHead>
              {canManage && (
                <Link
                  href={`/${tenantSlug}/admin/settings?section=domain`}
                  style={{
                    fontSize: 11,
                    color: C.indigoDeep,
                    fontWeight: 600,
                    textDecoration: "none",
                    fontFamily: FONT,
                  }}
                >
                  Manage →
                </Link>
              )}
            </div>
            {domainMessage ? <NoticeBanner kind="success" message={domainMessage} /> : null}
            {domainError ? <NoticeBanner kind="error" message={domainError} /> : null}
            <div
              style={{
                fontFamily: FONT,
                fontSize: 18,
                fontWeight: 600,
                color: C.ink,
                letterSpacing: -0.3,
                wordBreak: "break-all",
                marginBottom: 14,
              }}
            >
              {liveUrl.replace(/^https?:\/\//, "")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <ConfigStatusRow label="DNS" status={dnsSummary.status} value={dnsSummary.value} />
              <ConfigStatusRow label="SSL" status={sslSummary.status} value={sslSummary.value} />
              <ConfigStatusRow label="Records" status={recordSummary.status} value={recordSummary.value} />
            </div>
            {opensLocalPreview && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  color: C.inkMuted,
                }}
              >
                Local preview opens on{" "}
                <span style={{ fontFamily: MONO, color: C.ink }}>
                  {previewUrl.replace(/^https?:\/\//, "")}
                </span>
                . The public primary URL stays{" "}
                <span style={{ fontFamily: MONO, color: C.ink }}>
                  {primaryHost}
                </span>
                .
              </div>
            )}
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${C.borderSoft}`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <SectionHead>Routing surfaces</SectionHead>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      fontWeight: 600,
                      color: C.ink,
                      wordBreak: "break-all",
                    }}
                  >
                    {pathHost}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: C.inkMuted }}>
                    {publicAddress.primaryKind === "path"
                      ? "Current public URL on Tulala"
                      : "Always available on Tulala"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: C.inkDim,
                    flexShrink: 0,
                  }}
                >
                  Path
                </span>
              </div>
              {brandedHost ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    paddingTop: 10,
                    borderTop: `1px solid ${C.borderSoft}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.ink,
                        wordBreak: "break-all",
                      }}
                    >
                      {brandedHost}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: C.inkMuted }}>
                      {publicAddress.actualBrandedSubdomainHost
                        ? publicAddress.primaryKind === "subdomain"
                          ? "Current branded public host"
                          : "Branded fallback host"
                        : workspacePlan === "free"
                          ? "Unlocks on Studio"
                          : "Reserved branded host"}
                    </div>
                  </div>
                  {brandedHostStatus ? (
                    canManageDomains && publicAddress.primaryKind === "custom" ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        <form action={switchPrimaryDomainAction}>
                          <input type="hidden" name="tenantSlug" value={tenantSlug} />
                          <input type="hidden" name="hostname" value={brandedHost} />
                          <input type="hidden" name="returnTo" value="site" />
                          <DomainActionButton label="Use subdomain" />
                        </form>
                        <DomainStatusPill status={brandedHostStatus} />
                      </div>
                    ) : (
                      <DomainStatusPill status={brandedHostStatus} />
                    )
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: C.inkDim,
                        flexShrink: 0,
                      }}
                    >
                      Studio+
                    </span>
                  )}
                </div>
              ) : null}
            </div>
            {dnsRecordRows.length > 0 ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <SectionHead>DNS records</SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {dnsRecordRows.map((record) => (
                    <div
                      key={`${record.hostname}-${record.value}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "48px minmax(0, 1fr)",
                        gap: 10,
                        alignItems: "start",
                        paddingTop: 10,
                        borderTop: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: C.inkDim,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                        }}
                      >
                        TXT
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 12,
                            color: C.ink,
                            wordBreak: "break-all",
                          }}
                        >
                          {record.hostname}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontFamily: MONO,
                            fontSize: 11,
                            color: C.inkMuted,
                            wordBreak: "break-all",
                          }}
                        >
                          {record.value}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <DomainStatusPill status={record.status} />
                          {!record.matched && canManageDomains ? (
                            <form action={verifyCustomDomainNowAction}>
                              <input type="hidden" name="tenantSlug" value={tenantSlug} />
                              <input type="hidden" name="hostname" value={record.hostname} />
                              <input type="hidden" name="returnTo" value="site" />
                              <button
                                type="submit"
                                style={{
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 999,
                                  background: C.cardBg,
                                  color: C.ink,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "4px 10px",
                                  cursor: "pointer",
                                  fontFamily: FONT,
                                }}
                              >
                                Check DNS
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {pendingRoutingDomains.length > 0 ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <SectionHead>Routing records</SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingRoutingDomains.map((domain) => (
                    <div
                      key={`${domain.hostname}-routing`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        paddingTop: 10,
                        borderTop: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 12,
                              fontWeight: 600,
                              color: C.ink,
                              wordBreak: "break-all",
                            }}
                          >
                            {domain.hostname}
                          </span>
                          <DomainStatusPill status={domain.status} />
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11.5, color: C.inkMuted, lineHeight: 1.5 }}>
                          {domain.status === "ssl_provisioned"
                            ? "Routing is detected. HTTPS is still finishing on Vercel."
                            : "Ownership is verified. Add the routing record below so Vercel can serve the site."}
                        </div>
                      </div>
                      {buildCustomDomainRoutingRecords(domain.hostname).map((record) => (
                        <div
                          key={`${domain.hostname}-${record.type}-${record.host}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "56px minmax(0, 1fr)",
                            gap: 10,
                            alignItems: "start",
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: C.surfaceAlt,
                            border: `1px solid ${C.borderSoft}`,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: C.inkDim,
                              letterSpacing: 0.5,
                              textTransform: "uppercase",
                            }}
                          >
                            {record.type}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontFamily: MONO,
                                fontSize: 12,
                                color: C.ink,
                                wordBreak: "break-all",
                              }}
                            >
                              {record.host}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                fontFamily: MONO,
                                fontSize: 11,
                                color: C.inkMuted,
                                wordBreak: "break-all",
                              }}
                            >
                              {record.value}
                            </div>
                          </div>
                        </div>
                      ))}
                      {canManageDomains ? (
                        <form action={checkCustomDomainProvisioningAction}>
                          <input type="hidden" name="tenantSlug" value={tenantSlug} />
                          <input type="hidden" name="hostname" value={domain.hostname} />
                          <input type="hidden" name="returnTo" value="site" />
                          <button
                            type="submit"
                            style={{
                              alignSelf: "flex-start",
                              border: `1px solid ${C.border}`,
                              borderRadius: 999,
                              background: C.cardBg,
                              color: C.ink,
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "4px 10px",
                              cursor: "pointer",
                              fontFamily: FONT,
                            }}
                          >
                            Check routing
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {primaryCustomDomain ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <SectionHead>Primary custom domain</SectionHead>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    paddingTop: 10,
                    borderTop: `1px solid ${C.borderSoft}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.ink,
                          wordBreak: "break-all",
                        }}
                      >
                        {primaryCustomDomain.hostname}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: C.indigoSoft,
                          color: C.indigoDeep,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                        }}
                      >
                        Primary
                      </span>
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: C.inkMuted }}>
                      {describeCustomDomainStatus(primaryCustomDomain)}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    {canManageDomains && brandedHost ? (
                      <form action={switchPrimaryDomainAction}>
                        <input type="hidden" name="tenantSlug" value={tenantSlug} />
                        <input type="hidden" name="hostname" value={brandedHost} />
                        <input type="hidden" name="returnTo" value="site" />
                        <DomainActionButton label="Use subdomain" />
                      </form>
                    ) : null}
                    {canManageDomains ? (
                      <form action={removeCustomDomainAction}>
                        <input type="hidden" name="tenantSlug" value={tenantSlug} />
                        <input type="hidden" name="hostname" value={primaryCustomDomain.hostname} />
                        <input type="hidden" name="returnTo" value="site" />
                        <DomainActionButton label="Remove" tone="danger" />
                      </form>
                    ) : null}
                    <DomainStatusPill status={primaryCustomDomain.status} />
                  </div>
                </div>
              </div>
            ) : null}
            {!primaryCustomDomain && connectedCustomDomains.length > 0 ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <SectionHead>Connected domains</SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {connectedCustomDomains.map((domain) => (
                    <div
                      key={domain.hostname}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        paddingTop: 10,
                        borderTop: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 12,
                              fontWeight: 600,
                              color: C.ink,
                              wordBreak: "break-all",
                            }}
                          >
                            {domain.hostname}
                          </span>
                        </div>
                        <div style={{ marginTop: 3, fontSize: 11.5, color: C.inkMuted }}>
                          {describeCustomDomainStatus(domain)}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        {canManageDomains && customDomainCanBecomePrimary(domain.status) ? (
                          <form action={switchPrimaryDomainAction}>
                            <input type="hidden" name="tenantSlug" value={tenantSlug} />
                            <input type="hidden" name="hostname" value={domain.hostname} />
                            <input type="hidden" name="returnTo" value="site" />
                            <DomainActionButton label="Make primary" />
                          </form>
                        ) : null}
                        {canManageDomains ? (
                          <form action={removeCustomDomainAction}>
                            <input type="hidden" name="tenantSlug" value={tenantSlug} />
                            <input type="hidden" name="hostname" value={domain.hostname} />
                            <input type="hidden" name="returnTo" value="site" />
                            <DomainActionButton label="Remove" tone="danger" />
                          </form>
                        ) : null}
                        <DomainStatusPill status={domain.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {alternateCustomDomains.length > 0 ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <SectionHead>Alternate domains</SectionHead>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.inkMuted, marginBottom: 10 }}>
                  Additional domains that redirect to {primaryCustomDomain?.hostname}.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {alternateCustomDomains.map((domain) => (
                    <div
                      key={domain.hostname}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        paddingTop: 10,
                        borderTop: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 12,
                              fontWeight: 600,
                              color: C.ink,
                              wordBreak: "break-all",
                            }}
                          >
                            {domain.hostname}
                          </span>
                        </div>
                        <div style={{ marginTop: 3, fontSize: 11.5, color: C.inkMuted }}>
                          {describeCustomDomainStatus(domain)}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        {canManageDomains && customDomainCanBecomePrimary(domain.status) ? (
                          <form action={switchPrimaryDomainAction}>
                            <input type="hidden" name="tenantSlug" value={tenantSlug} />
                            <input type="hidden" name="hostname" value={domain.hostname} />
                            <input type="hidden" name="returnTo" value="site" />
                            <DomainActionButton label="Make primary" />
                          </form>
                        ) : null}
                        {canManageDomains ? (
                          <form action={removeCustomDomainAction}>
                            <input type="hidden" name="tenantSlug" value={tenantSlug} />
                            <input type="hidden" name="hostname" value={domain.hostname} />
                            <input type="hidden" name="returnTo" value="site" />
                            <DomainActionButton label="Remove" tone="danger" />
                          </form>
                        ) : null}
                        <DomainStatusPill status={domain.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {primaryCustomDomain && redirectMode ? (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: C.surfaceAlt,
                  border: `1px solid ${C.borderSoft}`,
                }}
              >
                <SectionHead>Redirect mode</SectionHead>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.ink,
                    marginBottom: 4,
                  }}
                >
                  {describeAliasRedirectMode(redirectMode)}
                </div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.inkMuted }}>
                  {describeAliasRedirectPolicy(
                    redirectMode,
                    primaryCustomDomain.hostname,
                  )}
                </div>
                {!aliasRedirect && suggestedAlternateDomain ? (
                  <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.inkMuted, marginTop: 10 }}>
                    Connect {suggestedAlternateDomain} first to control the redirect between the bare and www host.
                  </div>
                ) : null}
                {aliasRedirect && canManageDomains && customDomainCanBecomePrimary(aliasRedirect.alternateDomain.status) ? (
                  <form action={switchPrimaryDomainAction} style={{ marginTop: 10 }}>
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="hostname" value={aliasRedirect.alternateDomain.hostname} />
                    <input type="hidden" name="returnTo" value="site" />
                    <button
                      type="submit"
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 999,
                        background: C.cardBg,
                        color: C.ink,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      {aliasRedirect.mode === "bare_to_www" ? "Prefer bare" : "Prefer www"}
                    </button>
                  </form>
                ) : aliasRedirect && canManageDomains ? (
                  <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.inkMuted, marginTop: 10 }}>
                    {aliasRedirect.alternateDomain.hostname} must finish routing and SSL checks before it can become canonical.
                  </div>
                ) : null}
              </div>
            ) : null}
            {suggestedAlternateDomain && primaryCustomDomain ? (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: C.surfaceAlt,
                  border: `1px dashed ${C.border}`,
                }}
              >
                <SectionHead>Recommended alias</SectionHead>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.ink,
                    wordBreak: "break-all",
                    marginBottom: 4,
                  }}
                >
                  {suggestedAlternateDomain}
                </div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.inkMuted }}>
                  {describeSuggestedAlternateDomain(
                    suggestedAlternateDomain,
                    primaryCustomDomain.hostname,
                  )}
                </div>
                {canAddCustomDomains ? (
                  <form action={connectCustomDomainAction} style={{ marginTop: 10 }}>
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="hostname" value={suggestedAlternateDomain} />
                    <input type="hidden" name="returnTo" value="site" />
                    <button
                      type="submit"
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 999,
                        background: C.cardBg,
                        color: C.ink,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      Add alias
                    </button>
                  </form>
                ) : (
                  <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.inkMuted, marginTop: 10 }}>
                    {canManageDomains
                      ? "This plan cannot add more custom domains. Upgrade to Agency or Network to add aliases."
                      : "Only the workspace owner can add alternate domains."}
                  </div>
                )}
              </div>
            ) : null}
            {brandedHosts.length > 0 ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <SectionHead>Branded hosts</SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {brandedHosts.map((domain) => (
                    <div
                      key={domain.hostname}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        paddingTop: 10,
                        borderTop: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 12,
                              fontWeight: 600,
                              color: C.ink,
                              wordBreak: "break-all",
                            }}
                          >
                            {domain.hostname}
                          </span>
                          {domain.isPrimary ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 999,
                                background: C.indigoSoft,
                                color: C.indigoDeep,
                                letterSpacing: 0.4,
                                textTransform: "uppercase",
                              }}
                            >
                              Primary
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 11.5, color: C.inkMuted }}>
                          Permanent branded fallback host
                        </div>
                      </div>
                      <DomainStatusPill status={domain.status} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {customDomainFeatureUnlocked ? (
              canAddCustomDomains ? (
                <form
                  action={connectCustomDomainAction}
                  style={{
                    marginTop: 16,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: C.surfaceAlt,
                    border: `1px solid ${C.borderSoft}`,
                  }}
                >
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="returnTo" value="site" />
                  <SectionHead>
                    {connectedCustomDomains.length > 0 ? "Add another domain" : "Connect a custom domain"}
                  </SectionHead>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="text"
                      name="hostname"
                      placeholder="studio.example.com"
                      style={{
                        flex: "1 1 260px",
                        minWidth: 0,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        background: C.cardBg,
                        color: C.ink,
                        padding: "11px 12px",
                        fontSize: 13,
                        fontFamily: FONT,
                      }}
                    />
                    <DomainConnectSubmitButton hasExistingDomains={connectedCustomDomains.length > 0} />
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.5, marginTop: 8 }}>
                    Use only the hostname. We&apos;ll generate a verification token and keep the current public URL live while DNS updates.
                  </div>
                </form>
              ) : (
                <div
                  style={{
                    marginTop: 16,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: C.surfaceAlt,
                    border: `1px solid ${C.borderSoft}`,
                    color: C.inkMuted,
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    fontFamily: FONT,
                  }}
                >
                  {canManageDomains
                    ? "This plan cannot add more custom domains. Upgrade to Agency or Network to connect additional hosts."
                    : "Only the workspace owner can connect or replace custom domains."}
                </div>
              )
            ) : (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: C.surfaceAlt,
                  border: `1px solid ${C.borderSoft}`,
                  color: C.inkMuted,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  fontFamily: FONT,
                }}
              >
                {customDomainLockedCopy}
              </div>
            )}
          </div>

          {/* SEO column */}
          <div
            style={{
              padding: 18,
              borderRight: `1px solid ${C.borderSoft}`,
              fontFamily: FONT,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <SectionHead>SEO defaults</SectionHead>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: C.successSoft,
                  color: C.successDeep,
                  textTransform: "uppercase" as const,
                  letterSpacing: 0.5,
                }}
              >
                Indexable
              </span>
            </div>
            {data.seoTitle ? (
              <>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.ink,
                    marginBottom: 4,
                    lineHeight: 1.3,
                  }}
                >
                  {data.seoTitle}
                </div>
                {data.seoDescription && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: C.inkMuted,
                      marginBottom: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    {data.seoDescription}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
                No SEO title set.{" "}
                <Link
                  href="/admin/site-settings/seo"
                  style={{ color: C.indigoDeep, fontWeight: 600 }}
                >
                  Configure SEO →
                </Link>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.inkMuted }}>Sitemap</span>
                <span style={{ color: C.successDeep, fontWeight: 600 }}>Enabled</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.inkMuted }}>Canonical</span>
                <span
                  style={{
                    fontFamily: MONO,
                    color: C.ink,
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "60%",
                  }}
                >
                  {canonicalHost}
                </span>
              </div>
            </div>
          </div>

          {/* Tracking column */}
          <div style={{ padding: 18, fontFamily: FONT }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <SectionHead>Tracking</SectionHead>
              {canManage && (
                <Link
                  href="/admin/site-settings/system"
                  style={{
                    fontSize: 11,
                    color: C.indigoDeep,
                    fontWeight: 600,
                    textDecoration: "none",
                    fontFamily: FONT,
                  }}
                >
                  Configure →
                </Link>
              )}
            </div>
            {/* Tracking chips — placeholder since no schema yet */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["GA4", "Plausible", "Meta Pixel", "GTM", "Hotjar", "LinkedIn"].map(
                (label) => (
                  <span
                    key={label}
                    title="Not configured"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: C.surfaceAlt,
                      border: `1px solid ${C.borderSoft}`,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: C.inkDim,
                      fontFamily: FONT,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: C.inkDim,
                      }}
                    />
                    {label}
                  </span>
                ),
              )}
            </div>
            <p
              style={{
                fontSize: 11,
                color: C.inkDim,
                marginTop: 12,
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              Tracking integration configuration coming soon.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
