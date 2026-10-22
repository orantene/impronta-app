/**
 * Shared "is this a test account / test workspace" rule (TUL-1884 hub list, TUL-1931 IndexNow).
 * Pure. Moved out of `hub-agency-model.ts` (which re-exports these names for backward
 * compatibility) so IndexNow can skip demo/test workspaces with the exact same rule the hub list
 * uses, instead of a second, drifting copy.
 */

const RESERVED_TEST_TLDS = new Set(["test", "example", "invalid", "localhost"]);

/** The QA tester inbox. Replaced (not extended) by `QA_TEST_EMAIL_DOMAINS` when that env var is set. */
export const DEFAULT_QA_TEST_EMAIL_DOMAINS: readonly string[] = ["mail.grokbot.com"];

/** Comma-separated `QA_TEST_EMAIL_DOMAINS` (a leading "@" is tolerated), else the defaults. */
export function qaTestEmailDomains(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const raw = env.QA_TEST_EMAIL_DOMAINS;
  if (raw === undefined || raw.trim() === "") return [...DEFAULT_QA_TEST_EMAIL_DOMAINS];
  return raw.split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
}

/**
 * True when the address can only belong to a test account: an RFC 2606 / 6761 reserved TLD, or a domain
 * (or subdomain of one) in the QA test-domain list. Plus-addressing (`tulalaqa+studio@mail.grokbot.com`)
 * is irrelevant: only the domain is read.
 */
export function isReservedTestEmail(
  email: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  if (RESERVED_TEST_TLDS.has(domain.split(".").pop() ?? "")) return true;
  return qaTestEmailDomains(env).some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Which tenants have a real owner. `ownersByTenant` holds active 'owner' memberships; an owner is a
 * test account when their email is on a reserved TLD, a QA test-email domain, or any account flag (profiles.is_test_account,
 * talent_profiles.is_test_account / is_demo) is set. A tenant with no owner is not listed.
 */
export function tenantsWithRealOwner(input: {
  ownersByTenant: ReadonlyMap<string, readonly string[]>;
  emailByUser: ReadonlyMap<string, string>;
  flaggedUserIds: ReadonlySet<string>;
}): Set<string> {
  const out = new Set<string>();
  for (const [tenantId, owners] of input.ownersByTenant) {
    const real = owners.some((u) => !input.flaggedUserIds.has(u) && !isReservedTestEmail(input.emailByUser.get(u)));
    if (real) out.add(tenantId);
  }
  return out;
}
