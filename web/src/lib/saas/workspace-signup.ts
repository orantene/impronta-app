import { isReservedSlug } from "@/lib/site-admin/reserved-routes";

export const WORKSPACE_SIGNUP_INTENT = "workspace" as const;
export const WORKSPACE_SIGNUP_LEAD_PARAM = "lead" as const;

export const WORKSPACE_SLUG_MAX_LENGTH = 32;
export const WORKSPACE_SLUG_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export const WORKSPACE_RESERVED_SLUGS = [
  "www",
  "api",
  "app",
  "hub",
  "admin",
  "dashboard",
  "docs",
  "help",
  "support",
  "status",
  "mail",
  "email",
  "blog",
  "press",
  "jobs",
  "careers",
  "about",
  "legal",
  "privacy",
  "terms",
  "security",
  "auth",
  "login",
  "signup",
  "signin",
  "logout",
  "impronta",
  "rostra",
  "tulala",
  "marketing",
  "cdn",
  "assets",
  "static",
  "media",
  "images",
  "files",
  "download",
  "uploads",
  "test",
  "staging",
  "dev",
  "beta",
  "alpha",
  "demo",
  "example",
] as const;

const WORKSPACE_RESERVED_SLUG_SET = new Set<string>(WORKSPACE_RESERVED_SLUGS);

export function isReservedWorkspaceSlug(candidate: string): boolean {
  const normalized = candidate.trim().toLowerCase();
  return (
    !normalized ||
    WORKSPACE_RESERVED_SLUG_SET.has(normalized) ||
    isReservedSlug(normalized)
  );
}

export function normalizeWorkspaceSlugCandidate(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  let slug = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-{2,}/g, "-");

  if (!slug) return "";

  if (slug.length > WORKSPACE_SLUG_MAX_LENGTH) {
    slug = slug.slice(0, WORKSPACE_SLUG_MAX_LENGTH);
    slug = slug.replace(/-+$/, "");
  }

  return slug;
}

export function preferredWorkspaceSlugFromLead(input: {
  subdomainWanted?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  const bySubdomain = normalizeWorkspaceSlugCandidate(
    input.subdomainWanted ?? "",
  );
  if (bySubdomain) return bySubdomain;

  const byName = normalizeWorkspaceSlugCandidate(input.name ?? "");
  if (byName) return byName;

  const localPart = (input.email ?? "").split("@")[0] ?? "";
  const byEmail = normalizeWorkspaceSlugCandidate(localPart);
  if (byEmail) return byEmail;

  return "workspace";
}

export function isSelfServeWorkspaceLeadEligible(
  tierInterest: string | null | undefined,
): boolean {
  if (!tierInterest || tierInterest === "free") return true;
  return (
    tierInterest === "studio" ||
    tierInterest === "agency" ||
    tierInterest === "network"
  );
}

export function isPaidWorkspaceTierInterest(
  tierInterest: string | null | undefined,
): tierInterest is "studio" | "agency" {
  return tierInterest === "studio" || tierInterest === "agency";
}

export function isNetworkWorkspaceTierInterest(
  tierInterest: string | null | undefined,
): boolean {
  return tierInterest === "network";
}

/**
 * Which `app_role` should a fresh workspace owner end up with?
 *
 * `agency_staff` only when the account has no role yet. An existing client or
 * talent KEEPS their role: workspace access is membership-based (the shell
 * admits via `agency.workspace.view`, RLS via `is_staff_of_tenant()`), so the
 * owner membership alone is enough, and overwriting `app_role` would move
 * their home dashboard out from under them. A talent who opens a workspace
 * would lose `/talent`, which the hybrid direction explicitly supports.
 *
 * Returns null when the profile row should keep whatever role it has.
 *
 * Who may provision at all: everyone with an account. There used to be an
 * eligibility gate here that refused any client/talent who had finished
 * onboarding, and it was permanent with no self-serve way out, because
 * `/onboarding/role` offers exactly two choices and picking Client runs
 * `complete_client_onboarding`. One click and the account could never own a
 * workspace. What still stops a provision is unchanged and lives elsewhere: a
 * lead claimed by another account, one Free workspace per owner, slug
 * availability.
 */
export function resolveWorkspaceOwnerAppRole(
  currentAppRole: string | null | undefined,
): "agency_staff" | null {
  if (!currentAppRole) return "agency_staff";
  return null;
}

/**
 * Does this owned Free workspace belong to the signup lead being provisioned?
 *
 * Only a YES authorizes reuse. A NO means the person already owns an unrelated
 * Free workspace, which is the "one Free workspace per owner" case: the
 * provisioner must refuse rather than silently redirect them into a workspace
 * with a different name than the one they just reserved.
 *
 * `signup_lead_id` is stamped into `agencies.settings` at creation. Rows
 * created before that stamp existed fall back to an exact slug match against
 * the slug this lead reserved.
 */
export function workspaceBelongsToSignupLead(input: {
  workspaceSignupLeadId: string | null;
  workspaceSlug: string;
  leadId: string;
  desiredSlug: string;
}): boolean {
  if (input.workspaceSignupLeadId) {
    return input.workspaceSignupLeadId === input.leadId;
  }
  return Boolean(input.desiredSlug) && input.workspaceSlug === input.desiredSlug;
}

export function buildWorkspaceOnboardingPath(leadId: string): string {
  return `/onboarding/workspace?${WORKSPACE_SIGNUP_LEAD_PARAM}=${encodeURIComponent(
    leadId,
  )}`;
}

export function buildWorkspaceRegisterPath(leadId: string): string {
  // `next` is REQUIRED, not decoration. The middleware branch that redirects an
  // already-signed-in visitor away from /register reads only `?next=`; without
  // it, someone who signs in mid-funnel is bounced to /onboarding/role, the
  // lead id is dropped, and picking "I'm a Client" there permanently
  // disqualifies the account from workspace provisioning.
  const next = encodeURIComponent(buildWorkspaceOnboardingPath(leadId));
  return `/register?intent=${WORKSPACE_SIGNUP_INTENT}&${WORKSPACE_SIGNUP_LEAD_PARAM}=${encodeURIComponent(
    leadId,
  )}&next=${next}`;
}

export function isWorkspaceOnboardingPath(path: string): boolean {
  return path === "/onboarding/workspace" || path.startsWith("/onboarding/workspace?");
}
