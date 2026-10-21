/**
 * TUL-1397: who gets a product-update email.
 *
 * Pure mapping only. Nothing here reads a database, calls Resend or sends mail.
 * A later job turns `RecipientFacts` rows into Resend audience members using
 * `audienceKeys` and `resendAudienceName`.
 *
 * Two kinds of mail, two consent rules:
 *  - "service" (price, terms, security changes): everyone affected, whatever
 *    their marketing choice.
 *  - "newsletter" (monthly Novedades, launch email): only people who opted in,
 *    and never anyone who unsubscribed.
 */

export const AUDIENCE_ROLES = ["talent", "business", "agency", "client"] as const;
export type AudienceRole = (typeof AUDIENCE_ROLES)[number];

export const AUDIENCE_PLANS = ["free", "website", "studio", "agency", "network"] as const;
export type AudiencePlan = (typeof AUDIENCE_PLANS)[number];

export const AUDIENCE_LANGUAGES = ["es", "en"] as const;
export type AudienceLanguage = (typeof AUDIENCE_LANGUAGES)[number];

/** Market is a country code (MX, US, ...) or "other". */
export type AudienceMarket = string;

export type EmailKind = "service" | "newsletter";

/**
 * Where a recipient's marketing choice is stored today:
 *  - "subscriber": marketing_subscribers (opted in by subscribing, out via unsubscribed_at)
 *  - "client_profile": client_profiles.marketing_opt_in (default false)
 *  - "none": talent and business accounts have no marketing opt-in column yet,
 *    so they receive service mail only until one exists.
 */
export type ConsentSource = "subscriber" | "client_profile" | "none";

export type RecipientFacts = {
  email: string;
  role: AudienceRole;
  plan: AudiencePlan;
  language: string | null;
  market: string | null;
  consentSource: ConsentSource;
  /** marketing_opt_in for a client_profile; true for a live subscriber row. */
  marketingOptIn: boolean;
  /** marketing_subscribers.unsubscribed_at is set. */
  unsubscribed: boolean;
};

export function normalizeLanguage(raw: string | null | undefined): AudienceLanguage {
  return (raw ?? "").trim().toLowerCase().startsWith("en") ? "en" : "es";
}

export function normalizeMarket(raw: string | null | undefined): AudienceMarket {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "OTHER";
}

/** May this person receive this kind of mail? */
export function canReceive(kind: EmailKind, r: RecipientFacts): boolean {
  if (!r.email.includes("@")) return false;
  if (kind === "service") return true;
  if (r.unsubscribed) return false;
  if (r.consentSource === "none") return false;
  return r.marketingOptIn === true;
}

/** The Resend audience a recipient belongs to, e.g. "tulala-talent-es". */
export function resendAudienceName(role: AudienceRole, language: AudienceLanguage): string {
  return `tulala-${role}-${language}`;
}

/**
 * Segment keys a recipient is filed under. A broadcast targets one key, so
 * the same person appears under role, plan, language and market keys, plus
 * the combined role+language audience that carries the actual Resend list.
 */
export function audienceKeys(r: RecipientFacts): string[] {
  const language = normalizeLanguage(r.language);
  return [
    resendAudienceName(r.role, language),
    `role:${r.role}`,
    `plan:${r.plan}`,
    `language:${language}`,
    `market:${normalizeMarket(r.market)}`,
  ];
}

/** Properties stored on the Resend contact so a broadcast can filter by them. */
export function contactProperties(r: RecipientFacts): Record<string, string> {
  return {
    role: r.role,
    plan: r.plan,
    language: normalizeLanguage(r.language),
    market: normalizeMarket(r.market),
  };
}

export type EntryAudienceTarget = {
  /** Roles the entry is for. Empty or missing means everyone. */
  roles?: readonly string[] | null;
  /** Plans the entry is for. Empty or missing means every plan. */
  plans?: readonly string[] | null;
};

/** Does a changelog entry apply to this recipient? Used to pick digest content. */
export function entryAppliesTo(
  entry: EntryAudienceTarget,
  r: Pick<RecipientFacts, "role" | "plan">,
): boolean {
  const roles = entry.roles ?? [];
  const plans = entry.plans ?? [];
  if (roles.length > 0 && !roles.includes(r.role)) return false;
  if (plans.length > 0 && !plans.includes(r.plan)) return false;
  return true;
}

export type AudiencePlanSummary = { key: string; recipients: number };

/**
 * Dry-run summary: how many recipients per audience name would receive a mail
 * of this kind. Pure, so it can be shown in Platform Admin before any send.
 */
export function summarizeAudiences(kind: EmailKind, rows: readonly RecipientFacts[]): AudiencePlanSummary[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (!canReceive(kind, r)) continue;
    const email = r.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const name = resendAudienceName(r.role, normalizeLanguage(r.language));
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, recipients]) => ({ key, recipients }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
