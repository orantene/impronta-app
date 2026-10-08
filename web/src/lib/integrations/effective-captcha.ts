/**
 * Pure rule for "which captcha does this workspace really use" (TUL-138).
 *
 * Mirrors `resolveTenantCaptcha` in resolve.ts: a workspace's OWN captcha row
 * wins whenever it holds a valid provider AND a non-empty site key (row status
 * is ignored by the resolver, so it is ignored here too). Otherwise the
 * workspace inherits the platform default.
 *
 * No I/O and no secret values: this only ever sees provider names and booleans.
 */

export type CaptchaProvider = "hcaptcha" | "turnstile";
export type EffectiveCaptchaProvider = CaptchaProvider | "none";

export type OwnCaptchaInput = {
  provider: unknown;
  siteKey: unknown;
};

export function normalizeCaptchaProvider(value: unknown): CaptchaProvider | null {
  return value === "hcaptcha" || value === "turnstile" ? value : null;
}

/** True when the row would be used by the resolver (valid provider + site key). */
export function isOwnCaptchaUsable(own: OwnCaptchaInput): boolean {
  return (
    normalizeCaptchaProvider(own.provider) !== null &&
    typeof own.siteKey === "string" &&
    own.siteKey.trim().length > 0
  );
}

export function effectiveCaptchaProvider(
  own: OwnCaptchaInput,
  platformDefault: EffectiveCaptchaProvider,
): { provider: EffectiveCaptchaProvider; source: "own" | "platform" } {
  const provider = normalizeCaptchaProvider(own.provider);
  if (provider && isOwnCaptchaUsable(own)) return { provider, source: "own" };
  return { provider: platformDefault, source: "platform" };
}

/** Keep at most the last 4 characters of a public site key. */
export function maskSiteKey(siteKey: string | null): string | null {
  if (!siteKey) return null;
  const k = siteKey.trim();
  if (!k) return null;
  return `••••${k.slice(-4)}`;
}
