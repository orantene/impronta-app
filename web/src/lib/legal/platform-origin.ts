/**
 * Marketing origin for Tulala's own documents (legal, contact, home).
 *
 * `NEXT_PUBLIC_SITE_URL` is set per environment (production = tulala.digital,
 * staging = staging.tulala.digital), so staging links stay on staging instead of
 * leaking to production (TUL staging legal links). Falls back to production when
 * the variable is unset, which is the behaviour before this helper existed.
 */
export const PROD_PLATFORM_ORIGIN = "https://tulala.digital";

export function platformOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return PROD_PLATFORM_ORIGIN;
  try {
    const u = new URL(raw);
    return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? PROD_PLATFORM_ORIGIN : u.origin;
  } catch {
    return PROD_PLATFORM_ORIGIN;
  }
}
