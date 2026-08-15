/**
 * logo-url-allowlist.ts — is this tenant-supplied logo URL safe to fetch?
 *
 * PURE. Lives apart from `watermark-bake.ts` because that module pulls in
 * `sharp` (a native codec) and this rule has to be unit-testable without it.
 *
 * WHY IT EXISTS (Batch A / A7)
 * ────────────────────────────
 * The bake used to hand `agencies.settings.branding.logo_url` straight to
 * `fetch()`. That value is written by tenant admins, so it was an authenticated
 * blind SSRF: point it at `http://169.254.169.254/…`, at an internal service,
 * or at any host worth probing, and the Function dials it. Nothing of the
 * response ever reaches the attacker (hence blind), which does not help —
 * response timing and the bake's own error text are signal enough, and a
 * server-side GET against an internal endpoint can have effects of its own.
 *
 * ALLOWLIST, NOT DENYLIST. The only place this product ever stores a logo is
 * its own Supabase project's storage. Blocking private IP ranges instead would
 * leave DNS rebinding, IPv6 forms, and redirect chains wide open; pinning the
 * one legitimate host closes the class.
 */

/**
 * True only for an `https` URL on the configured Supabase project's host,
 * under the storage path prefix.
 *
 * Returns false when the project URL is unset or unparseable: with no host to
 * compare against, nothing can be proven safe, and "allow anything" is the
 * wrong way to fail.
 */
export function isAllowedLogoUrl(
  rawUrl: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  let allowedHost: string;
  try {
    allowedHost = new URL((supabaseUrl ?? "").trim()).host;
  } catch {
    return false;
  }
  if (!allowedHost || parsed.host !== allowedHost) return false;

  // Storage objects only. The same host also serves /auth/v1 and /rest/v1;
  // keeping the path pinned means a future SSRF needs a new bug rather than a
  // creative path on an already-permitted host.
  return parsed.pathname.startsWith("/storage/v1/");
}
