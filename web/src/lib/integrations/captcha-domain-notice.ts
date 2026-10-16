/**
 * When to nudge a workspace to add its own captcha keys.
 *
 * The platform Turnstile widget only renders on platform hosts
 * (`isPlatformCaptchaHost`). A workspace serving its site on its OWN live
 * custom domain with no usable own captcha gets no captcha there at all, so
 * the integrations page shows a short notice naming that domain.
 *
 * Pure: no I/O.
 */
import { isPlatformCaptchaHost, normalizeHost } from "@/lib/captcha/platform-hosts";
import { isOwnCaptchaUsable, type OwnCaptchaInput } from "@/lib/integrations/effective-captcha";

export type NoticeDomainRow = {
  hostname: string | null;
  kind: string | null;
  status: string | null;
  is_primary?: boolean | null;
};

const LIVE = new Set(["active", "ssl_provisioned", "verified"]);

/** The custom domain to name in the notice, or null when no notice is needed. */
export function captchaNoticeDomain(input: {
  domains: NoticeDomainRow[];
  ownCaptcha: OwnCaptchaInput;
  env?: Record<string, string | undefined>;
}): string | null {
  if (isOwnCaptchaUsable(input.ownCaptcha)) return null;
  const env = input.env ?? process.env;
  const candidates = input.domains
    .filter((d) => d.kind === "custom" && LIVE.has(d.status ?? ""))
    .map((d) => ({ host: normalizeHost(d.hostname), primary: d.is_primary === true }))
    .filter((d): d is { host: string; primary: boolean } => !!d.host)
    .filter((d) => !isPlatformCaptchaHost(d.host, env))
    .sort((a, b) => Number(b.primary) - Number(a.primary));
  return candidates[0]?.host ?? null;
}
