/**
 * Env-level captcha fallback (used only when neither the tenant nor the
 * platform DB default has a captcha). TUL-123: Turnstile is checked BEFORE
 * hCaptcha so a Turnstile env key wins the low-friction path.
 */
export type EnvCaptcha = {
  provider: "hcaptcha" | "turnstile" | "none";
  siteKey: string | null;
  secret: string | null;
};

export function envCaptchaFallback(env: Record<string, string | undefined>): EnvCaptcha {
  const t = (k: string) => env[k]?.trim() || null;
  const tSite = t("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const hSite = t("NEXT_PUBLIC_HCAPTCHA_SITE_KEY");
  if (tSite) return { provider: "turnstile", siteKey: tSite, secret: t("TURNSTILE_SECRET") };
  if (hSite) return { provider: "hcaptcha", siteKey: hSite, secret: t("HCAPTCHA_SECRET") };
  return { provider: "none", siteKey: null, secret: null };
}
