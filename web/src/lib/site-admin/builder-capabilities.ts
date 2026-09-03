import { improntaLog } from "@/lib/server/structured-log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_SEAT_CAPS } from "@/lib/saas/plan-seat-caps";
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
    // RATIFIED 2026-09-03, raised from 1. The rationale is the shape of the
    // incoming cohort, NOT current usage: a local business's normal site is
    // home, menu, about, contact, and since homepage and contact are
    // platform-provisioned and quota-exempt that is two counted pages. A cap of
    // one blocked them on day one, on the plan we had just recommended.
    //
    // Current usage does NOT support this number either way, and the honest
    // record is that an earlier reading which appeared to support it was a
    // measurement error: it counted `cms_pages` rows rather than what
    // `isQuotaCountedPage` counts, so the platform's own homepage, contact,
    // directory and 404 were being charged to the operator's allowance. Every
    // Free tenant is actually at ZERO counted pages. Judgment, not evidence.
    //
    // Read the enforcement path before changing this: the number means
    // quota-counted pages (see isQuotaCountedPage), not rows in cms_pages.
    maxPublicPages: 5,
    maxVisibleRosterProfiles: PLAN_SEAT_CAPS.free,
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
  /**
   * Display name of the cheapest tier that is BOTH sellable today and lifts
   * this cap. Resolved by the server caller from the live catalog; omitted in
   * pure contexts, where the copy falls back to plan-neutral wording.
   */
  lifterPlanName?: string | null,
): string | null {
  const policy = getBuilderPlanPolicy(planTier);
  const max = policy.maxPublicPages;
  if (max === null) return null;
  if (typeof countedPages === "number" && countedPages < max) return null;
  // The named plan is INJECTED, not hard-coded. Two bugs live in that sentence
  // if you write a literal:
  //
  //   1. It said "Upgrade to Studio". Every paid tier sets maxPublicPages null,
  //      so the cheapest lift is Website at $12, and Studio is $29. We were
  //      telling a shop to spend $17 a month more than it needed, for roster
  //      machinery it will never open.
  //   2. Naming Website is only correct while Website is SELLABLE. Its tier is
  //      `is_active = false` today, so a literal "Website" would point at a
  //      plan that refuses checkout — a dead CTA, which is the failure class
  //      this codebase has spent a lot of effort removing.
  //
  // So the caller resolves the cheapest ACTIVE tier that lifts the cap and
  // passes its display name. With no name resolved the copy stays plan-neutral,
  // which is always true and can never be a dead end.
  const noun = max === 1 ? "one page" : `${max} pages`;
  const lift = lifterPlanName
    ? `Every paid plan adds unlimited pages, starting with ${lifterPlanName}.`
    : "Every paid plan adds unlimited pages.";
  return `Your plan includes ${noun} of your own, on top of your homepage and 404. ${lift}`;
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
