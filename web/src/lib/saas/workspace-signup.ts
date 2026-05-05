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
  return !tierInterest || tierInterest === "free";
}

export type WorkspaceSignupProfileEligibilityInput = {
  appRole: string | null | undefined;
  accountStatus: string | null | undefined;
  onboardingCompletedAt?: string | null | undefined;
  hasClientProfile: boolean;
  hasTalentProfile: boolean;
};

export function isWorkspaceSignupProfileEligible(
  input: WorkspaceSignupProfileEligibilityInput,
): boolean {
  if (!input.appRole) {
    return true;
  }

  if (input.appRole === "agency_staff" || input.appRole === "super_admin") {
    return true;
  }

  return (
    (input.appRole === "client" || input.appRole === "talent") &&
    (input.accountStatus === "onboarding" || input.accountStatus === "registered") &&
    !input.onboardingCompletedAt &&
    !input.hasClientProfile &&
    !input.hasTalentProfile
  );
}

export function buildWorkspaceOnboardingPath(leadId: string): string {
  return `/onboarding/workspace?${WORKSPACE_SIGNUP_LEAD_PARAM}=${encodeURIComponent(
    leadId,
  )}`;
}

export function buildWorkspaceRegisterPath(leadId: string): string {
  return `/register?intent=${WORKSPACE_SIGNUP_INTENT}&${WORKSPACE_SIGNUP_LEAD_PARAM}=${encodeURIComponent(
    leadId,
  )}`;
}

export function isWorkspaceOnboardingPath(path: string): boolean {
  return path === "/onboarding/workspace" || path.startsWith("/onboarding/workspace?");
}
