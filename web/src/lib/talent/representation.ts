/**
 * Canonical effective-visibility resolver for the Representation drawer.
 * Single source for chip states — must stay aligned with
 * talent_has_public_roster() and ProfileVisibilityDrawer logic.
 */

export type RepresentationKind = "hub" | "agency" | "self_page";
export type RosterStatus = "active" | "pending" | "inactive" | "removed";
export type AgencyVisibility = "roster_only" | "site_visible" | "featured";

export type EffectiveVisibility =
  | "live"
  | "you_hid"
  | "agency_hidden"
  | "winding_down"
  | "pending"
  | "global_hidden"
  | "removed";

export type RepresentationEntry = {
  tenantId: string;
  slug: string;
  name: string;
  kind: RepresentationKind;
  planTier: string | null;
  status: RosterStatus;
  agencyVisibility: AgencyVisibility;
  talentSiteHidden: boolean;
  isPrimary: boolean;
  takeRatePct: number | null;
  joinedAt: string | null;
  publicUrl: string;
  /** Workspace/agency logo (agency_branding.theme_json.logo_url); null → initial-square fallback. */
  logoUrl: string | null;
  effective: EffectiveVisibility;
};

export function resolveEffectiveVisibility(args: {
  status: RosterStatus;
  agencyVisibility: AgencyVisibility;
  talentSiteHidden: boolean;
  globalHidden: boolean;
}): EffectiveVisibility {
  if (args.status === "removed") return "removed";
  if (args.globalHidden) return "global_hidden";
  if (args.status === "inactive") return "winding_down";
  if (args.status === "pending") return "pending";
  if (args.talentSiteHidden) return "you_hid";
  if (args.agencyVisibility === "roster_only") return "agency_hidden";
  return "live";
}

export type RepresentationChipCopy = {
  talent: string;
  agency: string;
  tone: "live" | "warn" | "muted" | "conflict";
};

export function representationChipCopy(
  effective: EffectiveVisibility,
  actor: "talent" | "agency",
): RepresentationChipCopy | null {
  if (effective === "removed") return null;
  const table: Record<
    Exclude<EffectiveVisibility, "removed">,
    RepresentationChipCopy
  > = {
    live: {
      talent: "Live",
      agency: "Live on your roster",
      tone: "live",
    },
    you_hid: {
      talent: "You hid this",
      agency: "Talent hid their profile here",
      tone: actor === "talent" ? "muted" : "conflict",
    },
    agency_hidden: {
      talent: "Agency isn't showing you",
      agency: "Not on your public site (roster-only)",
      tone: actor === "talent" ? "conflict" : "muted",
    },
    winding_down: {
      talent: "Winding down",
      agency: "Leaving (inactive)",
      tone: "warn",
    },
    pending: {
      talent: "Pending",
      agency: "Pending activation",
      tone: "warn",
    },
    global_hidden: {
      talent: "Hidden everywhere",
      agency: "Talent hidden globally",
      tone: actor === "talent" ? "muted" : "conflict",
    },
  };
  const row = table[effective as Exclude<EffectiveVisibility, "removed">];
  return {
    talent: row.talent,
    agency: row.agency,
    tone: row.tone,
  };
}
