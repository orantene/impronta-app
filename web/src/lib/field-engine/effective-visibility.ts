// src/lib/field-engine/effective-visibility.ts
//
// THE single visibility decision for the talent catalog engine.
// Pure, total, side-effect-free — imported by the resolver
// (admin-taxonomy.ts), the workspace-field-settings server actions, the
// public profile (Phase 1.5), and Agency Fields (Phase 3). Never
// reimplement visibility anywhere else.
//
// Canonical states: "public" | "admin" | "hidden".
// Precedence (most-restrictive-wins; platform floor is absolute):
//   platform default  →  tenant override (restrict only)  →  per-value
//   override (narrow only)  →  platform floor re-applied.
// A tenant/talent can only make a field MORE restrictive, never raise it
// toward public. A platform admin_only / is_sensitive field can NEVER be
// made public by anyone.

export type FieldVisibility = "public" | "admin" | "hidden";

export type ViewerRole =
  | "public"
  | "client"
  | "talent"
  | "manager"
  | "agency_admin"
  | "platform_admin";

export interface FieldDefVisibilityInput {
  /** profile_field_definitions.default_visibility (string[] of channels). */
  default_visibility: string[] | null | undefined;
  /** profile_field_definitions.show_in_public (legacy public flag). */
  show_in_public?: boolean | null;
  /** profile_field_definitions.admin_only (hard floor → never public). */
  admin_only?: boolean | null;
  /** profile_field_definitions.is_sensitive (hard floor → never public). */
  is_sensitive?: boolean | null;
}

export interface TenantFieldVisibilityOverride {
  show_in_public_override?: boolean | null;
  admin_only_override?: boolean | null;
  default_visibility_override?: string[] | null;
}

const RANK: Record<FieldVisibility, number> = { public: 0, admin: 1, hidden: 2 };

/** The more restrictive of two visibilities (higher RANK wins). */
function moreRestrictive(a: FieldVisibility, b: FieldVisibility): FieldVisibility {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Channels array → canonical visibility. */
function channelsToVisibility(ch: string[]): FieldVisibility {
  if (ch.includes("public")) return "public";
  if (ch.includes("agency") || ch.includes("admin")) return "admin";
  return "hidden"; // empty / "private" == hidden from public
}

/** The visibility the PLATFORM catalog default implies for a field. */
export function platformBaseVisibility(def: FieldDefVisibilityInput): FieldVisibility {
  if (def.admin_only) return "admin";
  if (def.is_sensitive) return "admin";
  const dv = def.default_visibility ?? [];
  if (def.show_in_public === true || dv.includes("public")) return "public";
  return channelsToVisibility(dv);
}

/**
 * The effective visibility of a field for a talent in a tenant context.
 * `tenant` = the tenant's workspace_profile_field_settings row (or null =
 * inherit platform). `valueOverride` = talent_profile_field_values
 * .visibility_override (or null). The result is the canonical channel;
 * use `canViewerSee` to gate per audience.
 */
export function effectiveFieldVisibility(
  def: FieldDefVisibilityInput,
  tenant?: TenantFieldVisibilityOverride | null,
  valueOverride?: string[] | null,
): FieldVisibility {
  const base = platformBaseVisibility(def);
  const platformFloorIsAdmin = !!(def.admin_only || def.is_sensitive);

  let eff = base;

  // Tenant override — may only RESTRICT further (never raise to public).
  // Conflict resolution: most-restrictive-wins across the three override
  // columns. If a tenant sets admin_only_override:true alongside
  // show_in_public_override:true the `true` is silently ignored — the
  // admin floor wins. Same for is_sensitive at the platform layer.
  // `default_visibility_override` is read as an array — both `null` and
  // `undefined` are treated as "no override" (the Array.isArray guard
  // handles both equally).
  if (tenant) {
    let tenantDesired: FieldVisibility | null = null;
    if (tenant.admin_only_override === true) tenantDesired = "admin";
    if (tenant.show_in_public_override === false) {
      tenantDesired = tenantDesired
        ? moreRestrictive(tenantDesired, "admin")
        : "admin";
    }
    if (Array.isArray(tenant.default_visibility_override)) {
      const tv = channelsToVisibility(tenant.default_visibility_override);
      tenantDesired = tenantDesired ? moreRestrictive(tenantDesired, tv) : tv;
    }
    if (
      tenantDesired === null &&
      tenant.show_in_public_override === true
    ) {
      // Captured for completeness (and to make intent explicit), but the
      // moreRestrictive(base, "public") below collapses to `base` —
      // tenants can never raise visibility above the platform default.
      // Not dead code: keeps the branch parallel to the others and
      // documents the "this is a no-op by design" path.
      tenantDesired = "public";
    }
    if (tenantDesired !== null) {
      // Tenant can only move the field to a MORE restrictive state than
      // the platform base. moreRestrictive(base, desired) ignores any
      // attempt to loosen.
      eff = moreRestrictive(base, tenantDesired);
    }
  }

  // Per-value (talent) override — narrow only.
  // An empty `valueOverride` array and `null` are both no-ops, but they
  // arrive via different code paths: `[]` is an explicit "I have no
  // preference, keep tenant/platform" persisted by the editor, while
  // `null` is the absence of a row. Both should fall through unchanged.
  if (Array.isArray(valueOverride) && valueOverride.length >= 0) {
    if (valueOverride.length > 0) {
      eff = moreRestrictive(eff, channelsToVisibility(valueOverride));
    }
  }

  // Platform floor is absolute: admin_only / is_sensitive can never be
  // public, no matter what any override said.
  if (platformFloorIsAdmin && eff === "public") eff = "admin";

  return eff;
}

/** Can a given audience see a field at this effective visibility? */
export function canViewerSee(v: FieldVisibility, role: ViewerRole): boolean {
  if (v === "public") return true;
  const isStaff =
    role === "manager" ||
    role === "agency_admin" ||
    role === "platform_admin";
  if (v === "admin") {
    // staff see admin-only; talent sees their own admin-only value
    // (labeled). client/public never.
    return isStaff || role === "talent";
  }
  // hidden: data retained, never public/client; staff only.
  return isStaff;
}

/** UI tri-state → the override columns on workspace_profile_field_settings. */
export function visibilityToOverrideColumns(v: FieldVisibility): {
  show_in_public_override: boolean;
  admin_only_override: boolean;
  default_visibility_override: string[] | null;
} {
  switch (v) {
    case "public":
      return {
        show_in_public_override: true,
        admin_only_override: false,
        default_visibility_override: null,
      };
    case "admin":
      return {
        show_in_public_override: false,
        admin_only_override: true,
        default_visibility_override: null,
      };
    case "hidden":
      return {
        show_in_public_override: false,
        admin_only_override: false,
        default_visibility_override: [],
      };
  }
}
