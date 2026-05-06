"use client";

// SettingsClientShell — prototype-fidelity settings page.
// Tabs: Workspace / Team / Plan / Advanced
// Accordion sections within each tab.

import { useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type {
  WorkspaceTeamMember,
  WorkspaceAgencySummary,
  WorkspaceDomainSummary,
  WorkspaceFieldGroup,
} from "../../_data-bridge";
import {
  checkCustomDomainProvisioningAction,
  connectCustomDomainAction,
  removeCustomDomainAction,
  switchPrimaryDomainAction,
  verifyCustomDomainNowAction,
} from "./domain-actions";
import { resolveWorkspacePublicAddress } from "@/lib/saas/workspace-public-url";
import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  customDomainNeedsRouting,
} from "@/lib/saas/custom-domain-routing";
import {
  filterOperatorFacingCustomDomains,
  filterOperatorFacingSubdomains,
  findPrimaryCustomDomain,
  listAlternateCustomDomains,
  resolveCustomDomainAliasRedirect,
  suggestAlternateCustomDomainHostname,
} from "@/lib/saas/domain-display";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  white:      "#ffffff",
  green:      "#2E7D5B",
  greenSoft:  "rgba(15,79,62,0.06)",
  greenDeep:  "#1A5E3C",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(212,160,23,0.10)",
  violet:     "#6B3EBB",
  violetSoft: "rgba(107,62,187,0.10)",
  accent:     "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const PLAN_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  free:    { bg: "rgba(82,96,109,0.10)",  color: "rgba(11,11,13,0.72)", label: "Free"    },
  studio:  { bg: "rgba(180,130,20,0.12)", color: "#7A5710",             label: "Studio"  },
  agency:  { bg: "rgba(15,79,62,0.10)",   color: "#0F4F3E",             label: "Agency"  },
  network: { bg: "rgba(91,60,140,0.10)",  color: "#5B3C8C",             label: "Network" },
};

const CUSTOM_DOMAIN_ELIGIBLE_PLANS = new Set(["agency", "network", "legacy"]);

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  owner:       { bg: C.violetSoft, color: C.violet },
  admin:       { bg: "rgba(27,110,156,0.10)", color: "#1B6E9C" },
  coordinator: { bg: C.amberSoft, color: C.amber },
  editor:      { bg: "rgba(46,125,91,0.10)", color: C.greenDeep },
  viewer:      { bg: "rgba(11,11,13,0.06)", color: C.inkMuted },
};

const DOMAIN_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  dns_verification_sent: "Waiting on DNS",
  verified: "Verified",
  ssl_provisioned: "SSL provisioned",
  active: "Active",
  failed: "Needs attention",
  suspended: "Suspended",
};

const DOMAIN_STATUS_TONE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(82,96,109,0.10)", color: "rgba(11,11,13,0.72)" },
  dns_verification_sent: { bg: C.amberSoft, color: C.amber },
  verified: { bg: C.greenSoft, color: C.greenDeep },
  ssl_provisioned: { bg: C.greenSoft, color: C.greenDeep },
  active: { bg: C.greenSoft, color: C.greenDeep },
  failed: { bg: "rgba(165,38,38,0.08)", color: "#8D1F1F" },
  suspended: { bg: "rgba(82,96,109,0.10)", color: "rgba(11,11,13,0.72)" },
};

function customDomainsForDisplay(domainSummary: WorkspaceDomainSummary) {
  return filterOperatorFacingCustomDomains(domainSummary.customDomains);
}

function subdomainsForDisplay(domainSummary: WorkspaceDomainSummary) {
  return filterOperatorFacingSubdomains(domainSummary.subdomains);
}

type ConnectedCustomDomain = WorkspaceDomainSummary["customDomains"][number];

// ─── Subcomponents ────────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  const meta = ROLE_COLORS[role] ?? ROLE_COLORS.viewer;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 9px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "capitalize",
        fontFamily: FONT,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {role}
    </span>
  );
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(15,79,62,0.08)",
        color: C.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: FONT,
        letterSpacing: 0.3,
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

function AccordionItem({
  id,
  label,
  desc,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  desc: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-section-id={id}
      style={{
        marginBottom: 8,
        background: C.white,
        border: `1px solid ${open ? C.border : C.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: open ? "0 1px 3px rgba(11,11,13,0.04)" : "none",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: FONT,
          textAlign: "left",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.02)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: C.inkMuted,
              marginTop: 2,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {desc}
          </div>
        </div>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            color: C.inkMuted,
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-flex",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.borderSoft}` }}>
          <div style={{ paddingTop: 12 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

function SettingsRow({
  title,
  desc,
  action,
  onClick,
  disabled,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px",
        marginBottom: 8,
        background: hover && onClick ? "rgba(11,11,13,0.02)" : C.white,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        cursor: onClick ? "pointer" : "default",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s",
        fontFamily: FONT,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{desc}</div>
      </div>
      {action ?? (
        onClick && !disabled ? (
          <span style={{ fontSize: 12, color: C.inkMuted, flexShrink: 0 }}>
            Configure →
          </span>
        ) : null
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = DOMAIN_STATUS_LABEL[status] ?? status;
  const tone = DOMAIN_STATUS_TONE[status] ?? {
    bg: "rgba(82,96,109,0.10)",
    color: "rgba(11,11,13,0.72)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 9px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: FONT,
        whiteSpace: "nowrap",
      }}
    >
      {label}
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
    ? { bg: C.greenSoft, border: "rgba(15,79,62,0.10)", color: C.greenDeep }
    : { bg: "rgba(165,38,38,0.06)", border: "rgba(165,38,38,0.12)", color: "#8D1F1F" };

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.color,
        fontSize: 12.5,
        lineHeight: 1.45,
        fontFamily: FONT,
        marginBottom: 10,
      }}
    >
      {message}
    </div>
  );
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
}) {
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

function DomainSubmitButton({ hasExistingDomains }: { hasExistingDomains: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        flexShrink: 0,
        border: "none",
        borderRadius: 10,
        background: pending ? "rgba(15,79,62,0.45)" : C.accent,
        color: C.white,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "11px 14px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending
        ? "Saving..."
        : hasExistingDomains
          ? "Add domain"
          : "Connect domain"}
    </button>
  );
}

function DomainVerifyButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: pending ? "rgba(11,11,13,0.04)" : C.white,
        color: C.ink,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "9px 12px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Checking..." : "Check now"}
    </button>
  );
}

function DomainRoutingButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: pending ? "rgba(11,11,13,0.04)" : C.white,
        color: C.ink,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "9px 12px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Checking..." : "Check routing"}
    </button>
  );
}

function DomainPrimaryButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: pending ? "rgba(11,11,13,0.04)" : C.white,
        color: C.ink,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "9px 12px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Updating..." : label}
    </button>
  );
}

function DomainRemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        border: "1px solid rgba(165,38,38,0.18)",
        borderRadius: 10,
        background: pending ? "rgba(165,38,38,0.05)" : "rgba(165,38,38,0.03)",
        color: "#8D1F1F",
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "9px 12px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Removing..." : "Remove"}
    </button>
  );
}

function DomainAliasButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: pending ? "rgba(11,11,13,0.04)" : C.white,
        color: C.ink,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "9px 12px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Adding..." : "Add alias"}
    </button>
  );
}

function CustomDomainSection({
  title,
  caption,
  domains,
  canManageDomains,
  tenantSlug,
}: {
  title: string;
  caption?: string;
  domains: ConnectedCustomDomain[];
  canManageDomains: boolean;
  tenantSlug: string;
}) {
  if (domains.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: C.inkMuted,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 8,
          fontFamily: FONT,
        }}
      >
        {title}
      </div>
      {caption ? (
        <div
          style={{
            fontSize: 12,
            color: C.inkMuted,
            lineHeight: 1.45,
            marginBottom: 8,
            fontFamily: FONT,
          }}
        >
          {caption}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 8 }}>
        {domains.map((domain) => (
          <div
            key={domain.hostname}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "11px 12px",
              borderRadius: 10,
              background: "rgba(11,11,13,0.02)",
              border: `1px solid ${C.borderSoft}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: FONT }}>
                  {domain.hostname}
                </span>
                {domain.isPrimary ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: C.violetSoft,
                      color: C.violet,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: FONT,
                    }}
                  >
                    Primary
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3, fontFamily: FONT }}>
                {describeCustomDomainStatus(domain)}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              {!domain.isPrimary &&
              canManageDomains &&
              customDomainCanBecomePrimary(domain.status) ? (
                <form action={switchPrimaryDomainAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="hostname" value={domain.hostname} />
                  <DomainPrimaryButton label="Make primary" />
                </form>
              ) : null}
              {canManageDomains ? (
                <form action={removeCustomDomainAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="hostname" value={domain.hostname} />
                  <DomainRemoveButton />
                </form>
              ) : null}
              <StatusPill status={domain.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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

function describeAliasRedirectSwitch(mode: "bare_to_www" | "www_to_bare", hostname: string): string {
  return mode === "bare_to_www"
    ? `Make ${hostname} the canonical public URL instead.`
    : `Make ${hostname} the canonical public URL instead.`;
}

// ─── Main shell ───────────────────────────────────────────────────────────────

type SettingsTab = "workspace" | "roster" | "team" | "plan" | "fields" | "advanced";

export function SettingsClientShell({
  summary,
  domainSummary,
  teamMembers,
  canManageTeam,
  canManageDomains,
  tenantSlug,
  fieldGroups,
  openDomainSection,
  domainMessage,
  domainError,
}: {
  summary: WorkspaceAgencySummary | null;
  domainSummary: WorkspaceDomainSummary;
  teamMembers: WorkspaceTeamMember[];
  canManageTeam: boolean;
  canManageDomains: boolean;
  tenantSlug: string;
  /** F2 — field catalog from profile_field_definitions with workspace overrides */
  fieldGroups: WorkspaceFieldGroup[];
  openDomainSection: boolean;
  domainMessage: string | null;
  domainError: string | null;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(openDomainSection ? ["domain"] : ["account"])
  );

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Default section to open when switching tabs so no tab appears empty.
  const TAB_DEFAULT_SECTION: Record<SettingsTab, string | null> = {
    workspace: "account",
    roster:    "talent-types",
    team:      "team",
    plan:      "plan",
    fields:    null,
    advanced:  "features",
  };

  const handleTabSwitch = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    const def = TAB_DEFAULT_SECTION[tabId];
    if (def) {
      setOpenSections((prev) => {
        if (prev.has(def)) return prev;
        const next = new Set(prev);
        next.add(def);
        return next;
      });
    }
  };

  const planChip = PLAN_CHIP[summary?.plan ?? "free"] ?? PLAN_CHIP.free;
  const workspacePlan = summary?.plan ?? "free";
  const workspaceSlug = summary?.slug ?? tenantSlug;
  const publicAddress = resolveWorkspacePublicAddress({
    slug: workspaceSlug,
    plan: workspacePlan,
    domainState: {
      primaryHost: domainSummary.primaryHost,
      primaryHostKind: domainSummary.primaryHostKind,
      subdomainHost: domainSummary.subdomainHost,
    },
  });
  const pathWorkspaceHost = publicAddress.pathHost;
  const brandedHost = publicAddress.actualBrandedSubdomainHost;
  const reservedBrandedHost = publicAddress.reservedBrandedSubdomainHost;
  const connectedCustomDomains = customDomainsForDisplay(domainSummary);
  const primaryCustomDomain = findPrimaryCustomDomain(connectedCustomDomains);
  const alternateCustomDomains = primaryCustomDomain
    ? listAlternateCustomDomains(connectedCustomDomains)
    : [];
  const aliasRedirect = resolveCustomDomainAliasRedirect(connectedCustomDomains);
  const suggestedAlternateDomain = suggestAlternateCustomDomainHostname(connectedCustomDomains);
  const redirectMode = aliasRedirect?.mode
    ?? (primaryCustomDomain && suggestedAlternateDomain
      ? suggestedAlternateDomain.startsWith("www.")
        ? "www_to_bare"
        : "bare_to_www"
      : null);
  const brandedHosts = subdomainsForDisplay(domainSummary);
  const brandedHostStatus = brandedHost
    ? brandedHosts.find((domain) => domain.hostname === brandedHost)?.status ?? null
    : null;
  const primaryHost = publicAddress.primaryHost;
  const primaryHostStatusLabel = domainSummary.primaryHostStatus
    ? DOMAIN_STATUS_LABEL[domainSummary.primaryHostStatus] ?? domainSummary.primaryHostStatus
    : null;
  const verifiedCustomDomainExists = connectedCustomDomains.some((domain) => customDomainCanBecomePrimary(domain.status));
  const primaryHostDesc = publicAddress.primaryKind === "custom"
    ? [
        "Primary public URL",
        primaryHostStatusLabel,
      ]
        .filter(Boolean)
        .join(" · ")
    : publicAddress.primaryKind === "subdomain"
      ? verifiedCustomDomainExists
      ? "Branded subdomain stays primary until routing and SSL are live on a custom domain."
      : workspacePlan === "studio"
        ? "Branded Studio subdomain"
        : "Branded workspace subdomain"
      : workspacePlan === "free"
        ? "Default public URL on tulala.digital"
        : "Path-based public URL while branded hosting is not enabled.";
  const customDomainFeatureUnlocked =
    domainSummary.customDomains.length > 0 ||
    CUSTOM_DOMAIN_ELIGIBLE_PLANS.has(workspacePlan);
  const canAddCustomDomains =
    canManageDomains && CUSTOM_DOMAIN_ELIGIBLE_PLANS.has(workspacePlan);
  const pendingVerificationDomains = connectedCustomDomains.filter(
    (domain) =>
      domain.status === "dns_verification_sent" &&
      Boolean(domain.verificationToken),
  );
  const pendingRoutingDomains = connectedCustomDomains.filter((domain) =>
    customDomainNeedsRouting(domain.status),
  );
  const alternateDomainCaption = primaryCustomDomain
    ? `Additional domains that redirect to ${primaryCustomDomain.hostname}.`
    : undefined;
  const brandedHostTitle = brandedHost ?? reservedBrandedHost ?? "Studio+";
  const brandedHostDesc = brandedHost
    ? publicAddress.primaryKind === "custom"
      ? "Tulala-hosted branded fallback"
      : workspacePlan === "studio"
        ? "Branded Studio public host"
        : "Branded workspace public host"
    : workspacePlan === "free"
      ? "Unlocks on Studio"
      : workspacePlan === "studio"
        ? "Optional branded Studio host"
        : "Reserved branded workspace host";
  const customDomainLockedCopy = workspacePlan === "free"
    ? "Branded subdomains unlock on Studio. Custom domains unlock on Agency and Network."
    : "Studio includes the branded Tulala subdomain. Custom domains unlock on Agency and Network.";

  const TABS: { id: SettingsTab; label: string; emoji: string }[] = [
    { id: "workspace", label: "Workspace",           emoji: "🏛" },
    { id: "roster",    label: "Roster",              emoji: "🎯" },
    { id: "team",      label: "Team & legal",        emoji: "👥" },
    { id: "plan",      label: "Plan & integrations", emoji: "💳" },
    { id: "fields",    label: "Fields",              emoji: "📋" },
    { id: "advanced",  label: "Advanced",            emoji: "⚙" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
          Configuration
        </p>
        <h1
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.4,
            margin: 0,
          }}
        >
          Settings
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
          Plan, team, branding, and workspace identity.
        </p>
      </div>

      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 20,
          maxWidth: 600,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabSwitch(t.id)}
              style={{
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 999,
                border: "none",
                background: active ? C.white : "transparent",
                color: active ? C.ink : C.inkMuted,
                fontFamily: FONT,
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span aria-hidden style={{ fontSize: 13 }}>{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 680 }}>

        {/* ── Workspace tab ── */}
        {activeTab === "workspace" && (
          <>
            <AccordionItem
              id="account"
              label="Account"
              desc="Workspace name, slug, and contact info."
              open={openSections.has("account")}
              onToggle={() => toggleSection("account")}
            >
              <SettingsRow
                title={summary?.displayName ?? "Your workspace"}
                desc={`${summary?.slug ?? tenantSlug} · ${summary?.contactEmail ?? "No contact email set"}`}
                onClick={() => {}}
              />
            </AccordionItem>

            <AccordionItem
              id="domain"
              label="Domain"
              desc="Run your storefront at your own domain."
              open={openSections.has("domain")}
              onToggle={() => toggleSection("domain")}
            >
              <SettingsRow
                title={primaryHost}
                desc={primaryHostDesc}
                onClick={() => {}}
                action={
                  domainSummary.primaryHostStatus && publicAddress.primaryKind === "custom" ? (
                    <StatusPill status={domainSummary.primaryHostStatus} />
                  ) : undefined
                }
              />
              <SettingsRow
                title={pathWorkspaceHost}
                desc="Path-based public URL on tulala.digital"
                action={
                  <span style={{ fontSize: 12, color: C.inkMuted, flexShrink: 0 }}>
                    Every plan
                  </span>
                }
              />
              <SettingsRow
                title={brandedHostTitle}
                desc={brandedHostDesc}
                action={
                  canManageDomains &&
                  brandedHost &&
                  publicAddress.primaryKind === "custom" ? (
                    <form action={switchPrimaryDomainAction}>
                      <input type="hidden" name="tenantSlug" value={tenantSlug} />
                      <input type="hidden" name="hostname" value={brandedHost} />
                      <DomainPrimaryButton label="Use subdomain" />
                    </form>
                  ) : brandedHost ? (
                    <StatusPill status={brandedHostStatus ?? "active"} />
                  ) : undefined
                }
              />
              {primaryCustomDomain ? (
                <CustomDomainSection
                  title="Primary custom domain"
                  domains={[primaryCustomDomain]}
                  canManageDomains={canManageDomains}
                  tenantSlug={tenantSlug}
                />
              ) : null}

              {!primaryCustomDomain && connectedCustomDomains.length > 0 ? (
                <CustomDomainSection
                  title="Connected domains"
                  domains={connectedCustomDomains}
                  canManageDomains={canManageDomains}
                  tenantSlug={tenantSlug}
                />
              ) : null}

              {alternateCustomDomains.length > 0 ? (
                <CustomDomainSection
                  title="Alternate domains"
                  caption={alternateDomainCaption}
                  domains={alternateCustomDomains}
                  canManageDomains={canManageDomains}
                  tenantSlug={tenantSlug}
                />
              ) : null}

              {primaryCustomDomain && redirectMode ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "rgba(11,11,13,0.02)",
                    border: `1px solid ${C.borderSoft}`,
                    fontFamily: FONT,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.inkMuted,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Redirect mode
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                    {describeAliasRedirectMode(redirectMode)}
                  </div>
                  <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.45 }}>
                    {describeAliasRedirectPolicy(
                      redirectMode,
                      primaryCustomDomain.hostname,
                    )}
                  </div>
                  {aliasRedirect ? (
                    <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.45, marginTop: 4 }}>
                      {describeAliasRedirectSwitch(
                        aliasRedirect.mode,
                        aliasRedirect.alternateDomain.hostname,
                      )}
                    </div>
                  ) : suggestedAlternateDomain ? (
                    <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.45, marginTop: 4 }}>
                      Connect {suggestedAlternateDomain} first to control the redirect between the bare and www host.
                    </div>
                  ) : null}
                  {aliasRedirect && canManageDomains && customDomainCanBecomePrimary(aliasRedirect.alternateDomain.status) ? (
                    <form
                      action={switchPrimaryDomainAction}
                      style={{
                        marginTop: 10,
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <input type="hidden" name="tenantSlug" value={tenantSlug} />
                      <input type="hidden" name="hostname" value={aliasRedirect.alternateDomain.hostname} />
                      <DomainPrimaryButton
                        label={aliasRedirect.mode === "bare_to_www" ? "Prefer bare" : "Prefer www"}
                      />
                    </form>
                  ) : aliasRedirect && canManageDomains ? (
                    <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 10 }}>
                      {aliasRedirect.alternateDomain.hostname} must finish routing and SSL checks before it can become the canonical URL.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {suggestedAlternateDomain && primaryCustomDomain ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "rgba(11,11,13,0.02)",
                    border: `1px dashed ${C.border}`,
                    fontFamily: FONT,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.inkMuted,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Recommended alias
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                    {suggestedAlternateDomain}
                  </div>
                  <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.45 }}>
                    {describeSuggestedAlternateDomain(
                      suggestedAlternateDomain,
                      primaryCustomDomain.hostname,
                    )}
                  </div>
                  {canAddCustomDomains ? (
                    <form
                      action={connectCustomDomainAction}
                      style={{
                        marginTop: 10,
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <input type="hidden" name="tenantSlug" value={tenantSlug} />
                      <input type="hidden" name="hostname" value={suggestedAlternateDomain} />
                      <DomainAliasButton />
                    </form>
                  ) : (
                    <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 10 }}>
                      {canManageDomains
                        ? "This plan cannot add more custom domains. Upgrade to Agency or Network to add aliases."
                        : "Only the workspace owner can add alternate domains."}
                    </div>
                  )}
                </div>
              ) : null}

              {brandedHosts.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.inkMuted,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      marginBottom: 8,
                      fontFamily: FONT,
                    }}
                  >
                    Branded hosts
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {brandedHosts.map((domain) => (
                      <div
                        key={domain.hostname}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "11px 12px",
                          borderRadius: 10,
                          background: "rgba(11,11,13,0.02)",
                          border: `1px solid ${C.borderSoft}`,
                          fontFamily: FONT,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                            {domain.hostname}
                          </div>
                          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3 }}>
                            Permanent fallback host
                          </div>
                        </div>
                        <StatusPill status={domain.status} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(domainMessage || domainError) ? (
                <div style={{ marginTop: 12 }}>
                  {domainMessage ? <NoticeBanner kind="success" message={domainMessage} /> : null}
                  {domainError ? <NoticeBanner kind="error" message={domainError} /> : null}
                </div>
              ) : null}

              {pendingVerificationDomains.length > 0 ? (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {pendingVerificationDomains.map((domain) => (
                    <div
                      key={`${domain.hostname}-dns`}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: "rgba(11,11,13,0.02)",
                        border: `1px solid ${C.borderSoft}`,
                        fontFamily: FONT,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
                        Add this TXT record to verify {domain.hostname}
                      </div>
                      <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.7 }}>
                        <div><strong style={{ color: C.ink }}>Type:</strong> TXT</div>
                        <div><strong style={{ color: C.ink }}>Host:</strong> {domain.hostname}</div>
                        <div><strong style={{ color: C.ink }}>Value:</strong> {domain.verificationToken}</div>
                        <div><strong style={{ color: C.ink }}>TTL:</strong> 3600</div>
                      </div>
                      {canManageDomains ? (
                        <form
                          action={verifyCustomDomainNowAction}
                          style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}
                        >
                          <input type="hidden" name="tenantSlug" value={tenantSlug} />
                          <input type="hidden" name="hostname" value={domain.hostname} />
                          <DomainVerifyButton />
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {pendingRoutingDomains.length > 0 ? (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {pendingRoutingDomains.map((domain) => (
                    <div
                      key={`${domain.hostname}-routing`}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: "rgba(11,11,13,0.02)",
                        border: `1px solid ${C.borderSoft}`,
                        fontFamily: FONT,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
                        {domain.status === "ssl_provisioned"
                          ? `Routing detected for ${domain.hostname}`
                          : `Finish routing ${domain.hostname} to Vercel`}
                      </div>
                      <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.6, marginBottom: 8 }}>
                        {domain.status === "ssl_provisioned"
                          ? "DNS is pointed at Vercel. HTTPS should finish shortly."
                          : "TXT ownership is verified. Add the routing record below so Vercel can serve the site."}
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {buildCustomDomainRoutingRecords(domain.hostname).map((record) => (
                          <div
                            key={`${domain.hostname}-${record.type}-${record.host}`}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              background: C.white,
                              border: `1px solid ${C.borderSoft}`,
                            }}
                          >
                            <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.7 }}>
                              <div><strong style={{ color: C.ink }}>Type:</strong> {record.type}</div>
                              <div><strong style={{ color: C.ink }}>Host:</strong> {record.host}</div>
                              <div><strong style={{ color: C.ink }}>Value:</strong> {record.value}</div>
                              <div><strong style={{ color: C.ink }}>TTL:</strong> 3600</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {canManageDomains ? (
                        <form
                          action={checkCustomDomainProvisioningAction}
                          style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}
                        >
                          <input type="hidden" name="tenantSlug" value={tenantSlug} />
                          <input type="hidden" name="hostname" value={domain.hostname} />
                          <DomainRoutingButton />
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {customDomainFeatureUnlocked ? (
                canAddCustomDomains ? (
                  <form
                    action={connectCustomDomainAction}
                    style={{
                      marginTop: 12,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "rgba(11,11,13,0.02)",
                      border: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.ink,
                        marginBottom: 8,
                        fontFamily: FONT,
                      }}
                    >
                      {domainSummary.customDomains.length > 0 ? "Add another domain" : "Connect a custom domain"}
                    </div>
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
                          background: C.white,
                          color: C.ink,
                          padding: "11px 12px",
                          fontSize: 13,
                          fontFamily: FONT,
                        }}
                      />
                      <DomainSubmitButton hasExistingDomains={domainSummary.customDomains.length > 0} />
                    </div>
                    <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 8, fontFamily: FONT }}>
                      Use only the hostname. We&apos;ll generate a verification token and keep your current domains live while DNS updates.
                    </div>
                  </form>
                ) : (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "rgba(11,11,13,0.02)",
                      border: `1px solid ${C.borderSoft}`,
                      color: C.inkMuted,
                      fontSize: 12.5,
                      lineHeight: 1.45,
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
                    marginTop: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "rgba(11,11,13,0.02)",
                    border: `1px solid ${C.borderSoft}`,
                    color: C.inkMuted,
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    fontFamily: FONT,
                  }}
                >
                  {customDomainLockedCopy}
                </div>
              )}
            </AccordionItem>

            <AccordionItem
              id="branding"
              label="Branding"
              desc="Logo, colors, and email identity."
              open={openSections.has("branding")}
              onToggle={() => toggleSection("branding")}
            >
              <SettingsRow
                title="Brand identity"
                desc="Logo · Colors · Email signature"
                action={
                  <Link
                    href={`/${tenantSlug}/admin/site`}
                    style={{
                      fontSize: 12,
                      color: C.accent,
                      fontFamily: FONT,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Go to Site →
                  </Link>
                }
              />
            </AccordionItem>
          </>
        )}

        {/* ── Roster tab ── */}
        {activeTab === "roster" && (
          <>
            <AccordionItem
              id="talent-types"
              label="Talent types"
              desc="Manage categories, specialties, and taxonomy for your roster."
              open={openSections.has("talent-types")}
              onToggle={() => toggleSection("talent-types")}
            >
              <SettingsRow
                title="Manage talent types"
                desc="Categories and specialties used to classify your roster"
                action={
                  <Link
                    href="/admin/taxonomy"
                    style={{ fontSize: 12, color: C.accent, fontFamily: FONT, fontWeight: 600, textDecoration: "none" }}
                  >
                    Open taxonomy →
                  </Link>
                }
              />
            </AccordionItem>

            <AccordionItem
              id="custom-fields"
              label="Custom fields"
              desc="Extra fields on talent profiles — height, measurements, languages, and more."
              open={openSections.has("custom-fields")}
              onToggle={() => toggleSection("custom-fields")}
            >
              <SettingsRow
                title="Manage fields"
                desc="Add, edit, and reorder profile fields"
                action={
                  <Link
                    href="/admin/fields"
                    style={{ fontSize: 12, color: C.accent, fontFamily: FONT, fontWeight: 600, textDecoration: "none" }}
                  >
                    Open field catalog →
                  </Link>
                }
              />
            </AccordionItem>
          </>
        )}

        {/* ── Team tab ── */}
        {activeTab === "team" && (
          <AccordionItem
            id="team"
            label="Team members"
            desc={`${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""} in this workspace.`}
            open={openSections.has("team")}
            onToggle={() => toggleSection("team")}
          >
            {teamMembers.length === 0 ? (
              <div style={{ padding: "16px 0", textAlign: "center", color: C.inkMuted, fontSize: 12.5, fontFamily: FONT }}>
                No team members found.
              </div>
            ) : (
              <div
                style={{
                  background: C.white,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {teamMembers.map((member, i) => (
                  <div
                    key={member.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
                    }}
                  >
                    <Avatar name={member.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {member.name}
                      </div>
                    </div>
                    {member.status === "pending_acceptance" && (
                      <span
                        style={{
                          fontSize: 10.5,
                          color: C.inkMuted,
                          background: "rgba(11,11,13,0.05)",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontFamily: FONT,
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        Pending
                      </span>
                    )}
                    <RolePill role={member.role} />
                  </div>
                ))}
              </div>
            )}

            {canManageTeam && (
              <div style={{ marginTop: 12 }}>
                <a
                  href={`/${tenantSlug}/admin/settings`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: `1px solid ${C.borderSoft}`,
                    background: "transparent",
                    color: C.ink,
                    fontFamily: FONT,
                    fontSize: 12.5,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Invite & manage team →
                </a>
              </div>
            )}
          </AccordionItem>
        )}

        {/* ── Plan tab ── */}
        {activeTab === "plan" && (
          <>
            <AccordionItem
              id="plan"
              label="Current plan"
              desc="Usage, limits, and upgrade options."
              open={openSections.has("plan")}
              onToggle={() => toggleSection("plan")}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  background: C.white,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    background: planChip.bg,
                    color: planChip.color,
                    fontFamily: FONT,
                    flexShrink: 0,
                  }}
                >
                  {planChip.label}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: FONT }}>
                    {planChip.label} plan
                  </div>
                  {summary && (
                    <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2, fontFamily: FONT }}>
                      {summary.talentCount} talent
                      {summary.talentLimit != null
                        ? ` of ${summary.talentLimit} seats used`
                        : " · unlimited seats"}
                    </div>
                  )}
                </div>
              </div>

              <a
                href={`/${tenantSlug}/admin/account`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 8,
                  background: C.accent,
                  color: "#fff",
                  fontFamily: FONT,
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Manage plan & billing →
              </a>
            </AccordionItem>

            <AccordionItem
              id="integrations"
              label="Integrations"
              desc="Connect email, calendar, and third-party apps."
              open={openSections.has("integrations")}
              onToggle={() => toggleSection("integrations")}
            >
              <div style={{ padding: "8px 0", color: C.inkMuted, fontSize: 12.5, fontFamily: FONT }}>
                Integrations available via workspace settings.
              </div>
            </AccordionItem>
          </>
        )}

        {/* ── Fields tab (F2 cutover — reads profile_field_definitions) ── */}
        {activeTab === "fields" && (
          <>
            {/* Intro */}
            <div
              style={{
                padding: "14px 16px",
                background: C.white,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3, fontFamily: FONT }}>
                Profile field catalog
              </div>
              <div style={{ fontSize: 12.5, color: C.inkMuted, fontFamily: FONT, lineHeight: 1.5 }}>
                These fields power talent profile pages, the directory, and registration flows.
                Universal fields are always active. Global and type-specific fields can be
                enabled or disabled for your workspace. Workspace-level overrides do not affect
                the platform catalog — only your agency&apos;s views.
              </div>
            </div>

            {/* One accordion per tier group */}
            {fieldGroups.length === 0 ? (
              <div style={{ padding: "32px 24px", textAlign: "center", color: C.inkMuted, fontSize: 13, fontFamily: FONT }}>
                Field catalog unavailable.
              </div>
            ) : (
              fieldGroups.map((group) => {
                const TIER_LABELS: Record<string, string> = {
                  universal:     "Universal",
                  global:        "Global",
                  "type-specific": "Type-Specific",
                };
                const TIER_DESC: Record<string, string> = {
                  universal:     "Required for all talent — cannot be disabled.",
                  global:        "Cross-type optional fields. Most talent fill these over time.",
                  "type-specific": "Only relevant for specific talent types.",
                };
                return (
                  <AccordionItem
                    key={group.tier}
                    id={`fields-${group.tier}`}
                    label={`${TIER_LABELS[group.tier] ?? group.tier} (${group.fields.length})`}
                    desc={TIER_DESC[group.tier] ?? ""}
                    open={openSections.has(`fields-${group.tier}`)}
                    onToggle={() => toggleSection(`fields-${group.tier}`)}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,2fr) 100px 80px 80px",
                        gap: 10,
                        padding: "7px 16px",
                        background: "rgba(11,11,13,0.02)",
                        borderBottom: `1px solid ${C.borderSoft}`,
                        fontFamily: FONT,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        color: C.inkMuted,
                      }}
                    >
                      <span>Field</span>
                      <span>Kind</span>
                      <span>Public</span>
                      <span>Status</span>
                    </div>
                    {group.fields.map((f, i) => (
                      <div
                        key={f.fieldKey}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,2fr) 100px 80px 80px",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 16px",
                          borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
                          fontFamily: FONT,
                        }}
                      >
                        {/* Field name + key */}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
                            {f.label}
                          </div>
                          <div style={{ fontSize: 11, color: C.inkDim, fontFamily: '"Fira Code", monospace', marginTop: 1 }}>
                            {f.fieldKey}
                          </div>
                        </div>
                        {/* Kind */}
                        <div style={{ fontSize: 11.5, color: C.inkMuted, textTransform: "capitalize" }}>
                          {f.kind.replace(/_/g, " ")}
                        </div>
                        {/* Public */}
                        <div>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              color: f.showInPublic ? C.greenDeep : C.inkDim,
                            }}
                          >
                            {f.showInPublic ? "Yes" : "No"}
                          </span>
                        </div>
                        {/* Status */}
                        <div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 7px",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 600,
                              background: f.enabled
                                ? "rgba(46,125,91,0.08)"
                                : "rgba(11,11,13,0.05)",
                              color: f.enabled ? C.greenDeep : C.inkMuted,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: f.enabled ? C.green : C.inkMuted,
                              }}
                            />
                            {f.enabled ? "Active" : "Off"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </AccordionItem>
                );
              })
            )}

            <div style={{ padding: "10px 16px", color: C.inkDim, fontSize: 11.5, fontFamily: FONT, lineHeight: 1.5 }}>
              Full field configuration (required/optional overrides, custom labels, workspace-specific order) available in a future release.
            </div>
          </>
        )}

        {/* ── Advanced tab ── */}
        {activeTab === "advanced" && (
          <>
            <AccordionItem
              id="features"
              label="Feature controls"
              desc="Turn platform features on or off for your workspace."
              open={openSections.has("features")}
              onToggle={() => toggleSection("features")}
            >
              <div style={{ padding: "8px 0", color: C.inkMuted, fontSize: 12.5, fontFamily: FONT, lineHeight: 1.5 }}>
                Feature controls available in future platform releases.
              </div>
            </AccordionItem>

            <AccordionItem
              id="compliance"
              label="Compliance & legal"
              desc="Legal agreements, data export, and deletion requests."
              open={openSections.has("compliance")}
              onToggle={() => toggleSection("compliance")}
            >
              <div style={{ color: C.inkMuted, fontSize: 12.5, fontFamily: FONT, lineHeight: 1.5 }}>
                Data export and account deletion requests — contact support.
              </div>
            </AccordionItem>

            <AccordionItem
              id="danger"
              label="Danger zone"
              desc="Irreversible operations — proceed with care."
              open={openSections.has("danger")}
              onToggle={() => toggleSection("danger")}
            >
              <div style={{ padding: "8px 0", color: "#DC2626", fontSize: 12.5, fontFamily: FONT, lineHeight: 1.5 }}>
                Workspace deletion and data wipe — contact support to proceed.
              </div>
            </AccordionItem>
          </>
        )}
      </div>
    </div>
  );
}
