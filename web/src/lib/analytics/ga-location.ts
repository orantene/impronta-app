import { redactSecretPath } from "./redact-secret-path";

/** GA uses utm_* for campaign attribution; everything else is dropped. */
export function buildGaPageLocation(href: string): string {
  try {
    const u = new URL(href);
    const kept = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (k.toLowerCase().startsWith("utm_")) kept.append(k, v);
    });
    const qs = kept.toString();
    return u.origin + redactSecretPath(u.pathname) + (qs ? `?${qs}` : "");
  } catch {
    return "";
  }
}

/** Referrer reduced to its origin. */
export function buildGaReferrer(href: string | null | undefined): string {
  if (!href) return "";
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : "";
  } catch {
    return "";
  }
}
