/**
 * TUL-1017: automatic Cloudflare Turnstile widget per connected custom domain.
 *
 * PURE decision module: no I/O, no env reads except through the `env` argument.
 * The Cloudflare client (`cloudflare-client.ts`) and the orchestration
 * (`run.ts`) make the calls; this file only answers "what should happen".
 *
 * Today a workspace on its own custom domain with no own captcha keys resolves
 * to captcha "none" (`chooseCaptchaSource`, own > platform > none), because the
 * platform widget cannot render on that hostname. When the flag is on, the
 * domain-verification cron creates a Turnstile widget named `tulala:<domain>`
 * for that domain and stores its keys in the workspace's existing captcha
 * integration, marked `managed_by: "tulala-auto"`. Those keys only apply on the
 * managed domain (`managedCaptchaAppliesToHost`), so the workspace's
 * `*.tulala.digital` host keeps the platform widget.
 */

import { isPlatformCaptchaHost, normalizeHost } from "../platform-hosts";

export const AUTO_WIDGET_FLAG = "CAPTCHA_AUTO_WIDGET";
export const MANAGED_BY_TULALA_AUTO = "tulala-auto";
export const WIDGET_NAME_PREFIX = "tulala:";
/** Cap on widget creations per cron run. */
export const MAX_WIDGET_CREATIONS_PER_RUN = 5;

export type AutoWidgetEnv = { accountId: string; apiToken: string };

/** True only when `CAPTCHA_AUTO_WIDGET` is exactly "1". */
export function isAutoWidgetFlagOn(env: Record<string, string | undefined>): boolean {
  return env[AUTO_WIDGET_FLAG] === "1";
}

/**
 * Flag + credentials, or null when anything is missing. Null means: make zero
 * Cloudflare calls.
 */
export function readAutoWidgetEnv(env: Record<string, string | undefined>): AutoWidgetEnv | null {
  if (!isAutoWidgetFlagOn(env)) return null;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_TURNSTILE_API_TOKEN?.trim();
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Normalized, valid custom hostname (2+ DNS labels), or null. */
export function normalizeWidgetDomain(raw: string | null | undefined): string | null {
  const host = normalizeHost(raw);
  if (!host || host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return null;
  return host;
}

export function widgetNameFor(domain: string): string {
  return `${WIDGET_NAME_PREFIX}${domain}`;
}

/** `<base>` + `www.<base>` (a `www.` hostname maps to its apex as base). */
export function widgetDomainsFor(domain: string): string[] {
  const base = domain.startsWith("www.") ? domain.slice(4) : domain;
  return [base, `www.${base}`];
}

/** The subset of the captcha integration's config_json this feature reads. */
export type CaptchaConfigView = {
  provider?: unknown;
  site_key?: unknown;
  managed_by?: unknown;
  managed_domain?: unknown;
  managed_widget_name?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Keys written by this feature (not typed in by the workspace). */
export function isTulalaManagedCaptcha(config: CaptchaConfigView | null | undefined): boolean {
  return !!config && config.managed_by === MANAGED_BY_TULALA_AUTO;
}

/** Usable keys the workspace typed in itself. These are never touched. */
export function hasOwnUserKeys(config: CaptchaConfigView | null | undefined): boolean {
  if (!config) return false;
  const provider = config.provider === "hcaptcha" || config.provider === "turnstile";
  return provider && !!str(config.site_key) && !isTulalaManagedCaptcha(config);
}

export type ActivationPreflight =
  | { action: "proceed"; domain: string }
  | {
      action: "skip";
      reason:
        | "invalid_domain"
        | "platform_host"
        | "own_keys"
        | "already_managed"
        | "managed_for_other_domain";
    };

/**
 * Before any Cloudflare call: should this newly active domain get a widget?
 * A workspace with its own keys is skipped; one managed widget per workspace
 * (a second custom domain is a follow-up, not a silent overwrite).
 */
export function decideOnDomainActive(input: {
  hostname: string;
  config: CaptchaConfigView | null;
  env?: Record<string, string | undefined>;
}): ActivationPreflight {
  const domain = normalizeWidgetDomain(input.hostname);
  if (!domain) return { action: "skip", reason: "invalid_domain" };
  if (isPlatformCaptchaHost(domain, input.env ?? {})) return { action: "skip", reason: "platform_host" };
  if (hasOwnUserKeys(input.config)) return { action: "skip", reason: "own_keys" };
  if (isTulalaManagedCaptcha(input.config)) {
    const managed = str(input.config?.managed_domain);
    return managed === domain
      ? { action: "skip", reason: "already_managed" }
      : { action: "skip", reason: "managed_for_other_domain" };
  }
  return { action: "proceed", domain };
}

export type ListedWidget = { sitekey: string; name: string };

export type CreateOrReuse =
  | { action: "create"; name: string; domains: string[] }
  | { action: "already_configured"; sitekey: string }
  | { action: "skip_reuse_no_secret"; sitekey: string }
  | { action: "skip_cap_reached" };

/**
 * After listing the account's widgets. A listed widget never carries its
 * secret, and rotating it would break forms already using it, so an existing
 * `tulala:<domain>` widget whose keys we do not hold is skipped (logged once).
 */
export function decideCreateOrReuse(input: {
  domain: string;
  widgets: ListedWidget[];
  storedSiteKey: string | null;
  storedSecretPresent: boolean;
  createdSoFar: number;
  cap?: number;
}): CreateOrReuse {
  const name = widgetNameFor(input.domain);
  const existing = input.widgets.find((w) => w.name === name);
  if (existing) {
    if (input.storedSiteKey === existing.sitekey && input.storedSecretPresent) {
      return { action: "already_configured", sitekey: existing.sitekey };
    }
    return { action: "skip_reuse_no_secret", sitekey: existing.sitekey };
  }
  if (input.createdSoFar >= (input.cap ?? MAX_WIDGET_CREATIONS_PER_RUN)) {
    return { action: "skip_cap_reached" };
  }
  return { action: "create", name, domains: widgetDomainsFor(input.domain) };
}

export type DetachDecision =
  | { action: "delete"; sitekey: string }
  | { action: "skip"; reason: "invalid_domain" | "not_managed" | "other_domain" | "name_mismatch" | "no_site_key" };

/**
 * On domain detach: delete the Cloudflare widget and the stored keys ONLY when
 * this feature wrote them for exactly this domain and the widget name carries
 * the `tulala:` prefix. A workspace's own keys are never touched.
 */
export function decideOnDomainDetach(input: {
  hostname: string;
  config: CaptchaConfigView | null;
}): DetachDecision {
  const domain = normalizeWidgetDomain(input.hostname);
  if (!domain) return { action: "skip", reason: "invalid_domain" };
  if (!isTulalaManagedCaptcha(input.config)) return { action: "skip", reason: "not_managed" };
  if (str(input.config?.managed_domain) !== domain) return { action: "skip", reason: "other_domain" };
  const name = str(input.config?.managed_widget_name);
  if (!name || !name.startsWith(WIDGET_NAME_PREFIX) || name !== widgetNameFor(domain)) {
    return { action: "skip", reason: "name_mismatch" };
  }
  const sitekey = str(input.config?.site_key);
  if (!sitekey) return { action: "skip", reason: "no_site_key" };
  return { action: "delete", sitekey };
}

/**
 * Managed keys only render on their own domain (the widget lists only it), so
 * on any other host (the workspace's `*.tulala.digital`, another custom
 * domain) they must not count as "own". A missing host keeps them off too:
 * the platform decision then applies, exactly as before this feature.
 */
export function managedCaptchaAppliesToHost(
  config: CaptchaConfigView | null | undefined,
  rawHost: string | null | undefined,
): boolean {
  if (!isTulalaManagedCaptcha(config)) return true;
  const managed = str(config?.managed_domain);
  const host = normalizeHost(rawHost);
  if (!managed || !host) return false;
  return widgetDomainsFor(managed).includes(host);
}
