/**
 * HybridModeSwitcher — top-nav pill that toggles between Talent and
 * Workspace surfaces for users who are BOTH (hybrid identity).
 *
 * Messages Consolidation Plan v2 — Item #15.
 *
 * Renders nothing when the user can't actually switch (pure talent
 * with no workspace, or pure workspace member with no talent profile).
 * Hybrid identity model from web/src/lib/identity/hybrid-mode.ts.
 */

import Link from "next/link";

export type HybridMode = "talent" | "workspace";

export function HybridModeSwitcher({
  current,
  canTalent,
  canWorkspace,
  talentHref,
  workspaceHref,
  /** Pure visual mode for narrow viewports. */
  compact = false,
}: {
  current: HybridMode;
  canTalent: boolean;
  canWorkspace: boolean;
  talentHref: string;
  workspaceHref: string;
  compact?: boolean;
}) {
  // Render nothing for non-hybrids — the switcher is meaningless when
  // there's only one surface.
  if (!canTalent || !canWorkspace) return null;

  const FONT = '"Inter", system-ui, sans-serif';

  return (
    <div
      role="group"
      aria-label="Switch between Talent and Workspace mode"
      data-hybrid-switcher
      style={{
        display: "inline-flex",
        gap: 0,
        padding: 2,
        background: "rgba(11,11,13,0.05)",
        border: "1px solid rgba(24,24,27,0.08)",
        borderRadius: 999,
        fontFamily: FONT,
      }}
    >
      <Pill
        active={current === "talent"}
        href={talentHref}
        label={compact ? "T" : "Talent"}
        ariaLabel="Switch to Talent mode"
      />
      <Pill
        active={current === "workspace"}
        href={workspaceHref}
        label={compact ? "W" : "Workspace"}
        ariaLabel="Switch to Workspace mode"
      />
    </div>
  );
}

function Pill({
  active, href, label, ariaLabel,
}: {
  active: boolean;
  href: string;
  label: string;
  ariaLabel: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: active ? 700 : 600,
        color: active ? "#fff" : "rgba(11,11,13,0.55)",
        background: active ? "#0F4F3E" : "transparent",
        textDecoration: "none",
        boxShadow: active ? "0 1px 3px rgba(11,11,13,0.10)" : "none",
        transition: "background 100ms, color 100ms",
        minHeight: 28,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}

/**
 * Convenience server-side helper that consumes a HybridIdentity (from
 * resolveActorIdentity) and emits the props ready to pass to the
 * switcher.
 */
export type HybridIdentityForSwitcher = {
  userId: string;
  hasTalent: boolean;
  primaryWorkspaceSlug: string | null;
};

export function hrefsForHybridIdentity(
  identity: HybridIdentityForSwitcher,
): { talentHref: string; workspaceHref: string } | null {
  if (!identity.hasTalent || !identity.primaryWorkspaceSlug) return null;
  return {
    talentHref: `/${identity.primaryWorkspaceSlug}/talent/inbox`,
    workspaceHref: `/${identity.primaryWorkspaceSlug}/admin`,
  };
}
