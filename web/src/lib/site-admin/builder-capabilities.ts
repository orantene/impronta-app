import { improntaLog } from "@/lib/server/structured-log";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brandedSubdomainEligible,
  customDomainEligible,
  type WorkspaceUrlPlan,
} from "@/lib/saas/workspace-public-url";

export type BuilderWorkspacePlan = WorkspaceUrlPlan;

const KNOWN_BUILDER_PLANS = new Set<BuilderWorkspacePlan>([
  "free",
  "website",
  "studio",
  "agency",
  "network",
  "legacy",
]);

export const DEFAULT_FREE_STARTER_SLUG = "free-quickstart-5" as const;

export interface BuilderPlanPolicy {
  plan: BuilderWorkspacePlan;
  maxPublicPages: number | null;
  maxVisibleRosterProfiles: number | null;
  workspaceTemplateLibrary: boolean;
  starterTemplateMode: "free-only" | "paid";
  shellEditMode: "locked" | "basic" | "full";
  brandedSubdomainEligible: boolean;
  customDomainEligible: boolean;
}

export type BuilderCapabilityKey =
  | "builder.section.body.edit"
  | "builder.shell.edit"
  | "builder.domain.subdomain"
  | "builder.domain.custom";

const BUILDER_PLAN_POLICY: Record<BuilderWorkspacePlan, BuilderPlanPolicy> = {
  free: {
    plan: "free",
    maxPublicPages: 1,
    maxVisibleRosterProfiles: 5,
    workspaceTemplateLibrary: false,
    starterTemplateMode: "free-only",
    shellEditMode: "locked",
    brandedSubdomainEligible: brandedSubdomainEligible("free"),
    customDomainEligible: customDomainEligible("free"),
  },
  // Website: the full site builder on a custom domain, minus the roster.
  // `maxVisibleRosterProfiles` stays null on purpose — roster visibility is a
  // workspace-TYPE concern (`agencies.workspace_type`), not a plan concern,
  // and `clampFeaturedRosterLimitForPlan` has a floor of 1, so a 0 here would
  // clamp to 1 rather than hide anything. The roster cap that actually bites
  // is `PLAN_SEAT_CAPS.website = 0`.
  website: {
    plan: "website",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "full",
    brandedSubdomainEligible: brandedSubdomainEligible("website"),
    customDomainEligible: customDomainEligible("website"),
  },
  studio: {
    plan: "studio",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "basic",
    brandedSubdomainEligible: brandedSubdomainEligible("studio"),
    customDomainEligible: customDomainEligible("studio"),
  },
  agency: {
    plan: "agency",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "full",
    brandedSubdomainEligible: brandedSubdomainEligible("agency"),
    customDomainEligible: customDomainEligible("agency"),
  },
  network: {
    plan: "network",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "full",
    brandedSubdomainEligible: brandedSubdomainEligible("network"),
    customDomainEligible: customDomainEligible("network"),
  },
  legacy: {
    plan: "legacy",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "full",
    brandedSubdomainEligible: brandedSubdomainEligible("legacy"),
    customDomainEligible: customDomainEligible("legacy"),
  },
};

export function normalizeBuilderWorkspacePlan(
  planTier: string | null | undefined,
): BuilderWorkspacePlan {
  if (planTier && KNOWN_BUILDER_PLANS.has(planTier as BuilderWorkspacePlan)) {
    return planTier as BuilderWorkspacePlan;
  }
  return "free";
}

export async function loadBuilderWorkspacePlan(
  supabase: SupabaseClient,
  tenantId: string,
  options?: {
    logTag?: string;
    onError?: (message: string) => void;
  },
): Promise<BuilderWorkspacePlan> {
  const { data, error } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", tenantId)
    .maybeSingle<{ plan_tier: string | null }>();

  if (error) {
    if (options?.onError) {
      options.onError(error.message);
    } else if (options?.logTag) {
      void improntaLog("site_admin_builder_capabilities.warn", {
        message: `[${options.logTag}] failed to load workspace plan_tier`,
        tenantId,
        error: error.message,
      });
    }
    return "free";
  }

  return normalizeBuilderWorkspacePlan(data?.plan_tier);
}

export function getBuilderPlanPolicy(
  planTier: string | null | undefined,
): BuilderPlanPolicy {
  return BUILDER_PLAN_POLICY[normalizeBuilderWorkspacePlan(planTier)];
}

/**
 * Single source of truth for "is this workspace on a paid plan?".
 *
 * Normalizes first, so an unknown / empty / null plan string collapses to
 * `free` and the predicate returns **false** — paid-plan gates must fail
 * CLOSED. Comparing a raw string against `"free"` does the opposite (any
 * garbage value reads as paid), which is why call sites must use this helper
 * rather than an inline comparison.
 *
 * `legacy` counts as paid: its policy row grants every paid capability.
 */
export function isPaidBuilderPlan(
  planTier: string | null | undefined,
): boolean {
  return normalizeBuilderWorkspacePlan(planTier) !== "free";
}

export function builderPlanAllows(
  planTier: string | null | undefined,
  capability: BuilderCapabilityKey,
): boolean {
  const policy = getBuilderPlanPolicy(planTier);
  if (capability === "builder.section.body.edit") return true;
  if (capability === "builder.shell.edit") {
    return policy.shellEditMode !== "locked";
  }
  if (capability === "builder.domain.subdomain") {
    return policy.brandedSubdomainEligible;
  }
  if (capability === "builder.domain.custom") {
    return policy.customDomainEligible;
  }
  return false;
}

export function resolveStarterTemplateSlugs(
  planTier: string | null | undefined,
  allStarterSlugs: ReadonlyArray<string>,
  freeStarterSlug: string = DEFAULT_FREE_STARTER_SLUG,
): ReadonlyArray<string> {
  const policy = getBuilderPlanPolicy(planTier);
  if (policy.starterTemplateMode === "free-only") {
    return [freeStarterSlug];
  }
  return allStarterSlugs.filter((slug) => slug !== freeStarterSlug);
}

export function starterTemplateDeniedReason(
  planTier: string | null | undefined,
): string | null {
  const policy = getBuilderPlanPolicy(planTier);
  if (policy.starterTemplateMode === "free-only") {
    return "Free workspaces include one starter template. Upgrade to Studio to unlock additional starters.";
  }
  return null;
}

export function workspaceTemplateLibraryDeniedReason(
  planTier: string | null | undefined,
): string | null {
  const policy = getBuilderPlanPolicy(planTier);
  if (!policy.workspaceTemplateLibrary) {
    return "Free workspaces include one landing template. Upgrade to Studio to unlock template library tools.";
  }
  return null;
}

// ─── PAGE QUOTA: system/role pages do NOT count ─────────────────────────────
//
// `maxPublicPages` is a cap on what the OPERATOR chose to build, not on what
// the platform had to provision for them. The non-negotiable set — homepage,
// 404, site shell, and the directory page a roster workspace gets — is
// installed by the seed, not authored by the operator. Counting it would make
// the contract self-defeating: Free caps at 1, the seed alone ships 2-4, and a
// fresh Free workspace would be over quota before its owner clicked anything.
//
// So the quota counts only operator-created extra pages, and the exemption is
// defined ONCE here so every enforcement site agrees.

/**
 * `cms_pages.system_template_key` values the platform provisions itself.
 * `contact` is listed for the day a contact page is seeded — it is NOT seeded
 * today (see `onboard-starter-content.ts`), so the entry is inert until then.
 */
export const QUOTA_EXEMPT_SYSTEM_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  "homepage",
  "site_shell",
  "directory",
  "not_found",
  "contact",
]);

/** The minimum a quota-counted page row must expose. */
export interface QuotaPageRow {
  slug?: string | null;
  status?: string | null;
  system_template_key?: string | null;
  is_system_owned?: boolean | null;
}

/**
 * True when this page row consumes one of the workspace's `maxPublicPages`
 * slots. Exempt: archived pages (they serve nothing), fenced `__…__` system
 * slugs, `is_system_owned` rows, anything carrying a provisioned
 * `system_template_key`, and any page currently HOLDING a page role — a page
 * the operator promoted to homepage or 404 is doing the platform's job, so it
 * stops billing against their allowance.
 */
export function isQuotaCountedPage(
  row: QuotaPageRow,
  roleSlugs: ReadonlySet<string> = new Set(),
): boolean {
  if ((row.status ?? "") === "archived") return false;
  if (row.is_system_owned === true) return false;
  const key = (row.system_template_key ?? "").trim();
  if (key && QUOTA_EXEMPT_SYSTEM_TEMPLATE_KEYS.has(key)) return false;
  const slug = (row.slug ?? "").trim();
  if (slug.startsWith("__")) return false;
  if (slug && roleSlugs.has(slug)) return false;
  return true;
}

/** How many of a tenant's pages count against `maxPublicPages`. */
export function countQuotaCountedPages(
  rows: ReadonlyArray<QuotaPageRow>,
  roleSlugs: ReadonlySet<string> = new Set(),
): number {
  return rows.reduce(
    (total, row) => total + (isQuotaCountedPage(row, roleSlugs) ? 1 : 0),
    0,
  );
}

/**
 * Load the tenant's counted-page total: every non-archived page row, minus the
 * system/role pages the platform provisioned. Deliberately reads the role
 * pointers too, so a promoted page stops counting the moment it takes a role.
 *
 * Fails CLOSED (returns null) when the read errors, and
 * {@link cmsAdditionalPageDeniedReason} treats a null count as "assume the
 * quota is spent" — a broken read must not hand out unlimited pages.
 */
export async function loadQuotaCountedPageCount(
  supabase: SupabaseClient,
  tenantId: string,
  roleSlugs: ReadonlySet<string> = new Set(),
): Promise<number | null> {
  const { data, error } = await supabase
    .from("cms_pages")
    .select("slug, status, system_template_key, is_system_owned")
    .eq("tenant_id", tenantId)
    .neq("status", "archived");
  if (error || !data) return null;
  return countQuotaCountedPages(data as QuotaPageRow[], roleSlugs);
}

/**
 * Why this workspace may not create another page, or null when it may.
 *
 * `countedPages` is the operator-created total from
 * {@link loadQuotaCountedPageCount}. Omitting it (or passing null) keeps the
 * historical fail-closed behaviour: an unmetered Free workspace is denied.
 */
export function cmsAdditionalPageDeniedReason(
  planTier: string | null | undefined,
  countedPages?: number | null,
): string | null {
  const policy = getBuilderPlanPolicy(planTier);
  const max = policy.maxPublicPages;
  if (max === null) return null;
  if (typeof countedPages === "number" && countedPages < max) return null;
  return max === 1
    ? "Free workspaces include one page of your own, on top of your homepage and 404. Upgrade to Studio to add more."
    : `Your plan includes ${max} pages of your own. Upgrade to Studio to add more.`;
}

export function clampFeaturedRosterLimitForPlan(
  planTier: string | null | undefined,
  value: unknown,
): number | null {
  const policy = getBuilderPlanPolicy(planTier);
  if (policy.maxVisibleRosterProfiles === null) return null;

  const max = policy.maxVisibleRosterProfiles;
  const min = 1;
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : max;
  return Math.max(min, Math.min(max, normalized));
}
