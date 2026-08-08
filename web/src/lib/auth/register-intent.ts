/**
 * P2 — the single signup front door.
 *
 * WHY this module exists: signup used to be five differently-designed pages
 * (`/register`, `/talent/register`, `/client/register`, `/join`, and the
 * marketing get-started modal). Same job, five copies of the copy, five places
 * to fix i18n and legal text forever. `/register` is now the only page; the
 * others are permanent redirects into it carrying an intent.
 *
 * Everything here is PURE (no `next/*`, no server imports, no DB) so the
 * intent parsing, the copy mapping and the redirect-href building are unit
 * testable without a request. The page keeps the parts that genuinely need a
 * request: the session check, the agency-name lookups, and the host-aware
 * post-auth destination.
 */

/** The three audiences the funnel serves. */
export const REGISTER_INTENTS = ["talent", "client", "operator"] as const;

export type RegisterIntent = (typeof REGISTER_INTENTS)[number];

/**
 * Canonical query param: `/register?as=talent`.
 *
 * `role` is the legacy alias. It is NOT dead: the page-builder link resolver
 * (`lib/site-admin/links/link-ref.ts`) already coerces every legacy
 * `/talent/register` / `/join` / `/client/register` href in saved page data to
 * `/register?role=<x>` — and `/register` used to ignore it, so every builder
 * CTA landed on the generic "you'll choose whether you're Talent or a Client"
 * page. Reading both params fixes that without a data migration.
 */
export const REGISTER_INTENT_PARAM = "as";
export const REGISTER_INTENT_LEGACY_PARAM = "role";

/** `"talent"` → `"talent"`; anything unrecognised → `null` (generic page). */
export function parseRegisterIntent(raw: unknown): RegisterIntent | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (REGISTER_INTENTS as readonly string[]).includes(normalized)
    ? (normalized as RegisterIntent)
    : null;
}

/**
 * Read the intent off a search-param bag, canonical param first, then the
 * legacy `role` alias.
 */
export function readRegisterIntent(
  params: Readonly<Record<string, string | string[] | undefined>>,
): RegisterIntent | null {
  return (
    parseRegisterIntent(params[REGISTER_INTENT_PARAM]) ??
    parseRegisterIntent(params[REGISTER_INTENT_LEGACY_PARAM])
  );
}

/**
 * The flow the visitor is actually in. Ordered by precedence, highest first —
 * a concrete invitation always outranks a generic `?as=`, because the invite
 * names a specific profile or workspace and the copy must say so.
 *
 *   operator  the get-started funnel (`?intent=workspace&lead=<id>`) or `?as=operator`
 *   claim     a talent claim invite (`?invitation=<id>`)
 *   invite    a roster invite arriving via `/invite/[token]` (inviter cookie)
 *   talent    `?as=talent`  (was `/talent/register`, `/join`)
 *   client    `?as=client`  (was `/client/register`)
 *   generic   plain `/register`
 */
export type RegisterFlow =
  | "operator"
  | "claim"
  | "invite"
  | "talent"
  | "client"
  | "generic";

export function resolveRegisterFlow(input: {
  /** True for the get-started funnel: `intent=workspace` AND a lead id. */
  workspaceSignup: boolean;
  /** True when `?invitation=<id>` is present. */
  claimInvite: boolean;
  /** True when the inviter cookie resolved to an agency name. */
  rosterInvite: boolean;
  intent: RegisterIntent | null;
}): RegisterFlow {
  if (input.workspaceSignup || input.intent === "operator") return "operator";
  if (input.claimInvite) return "claim";
  if (input.rosterInvite) return "invite";
  if (input.intent === "talent") return "talent";
  if (input.intent === "client") return "client";
  return "generic";
}

/** i18n catalog keys for one flow's headline block + buttons. */
export type RegisterCopyKeys = {
  eyebrow: string;
  title: string;
  description: string;
  google: string;
  submit: string;
};

const R = "public.auth.register";
const RR = "public.auth.roleRegister";

/**
 * Flow → catalog keys. This is the whole per-intent copy contract, in one
 * place, asserted by `register-intent.test.ts` against BOTH `messages/en.json`
 * and `messages/es.json` so a missing translation is a red test, not a raw key
 * shipped to a Spanish visitor.
 *
 * `hasAgencyName` only matters for the claim flow, which has a named and an
 * unnamed headline ("Claim your profile on Impronta Models" vs "Claim your
 * profile"). The invite flow is only ever entered WITH a name, so it has one.
 */
export function registerCopyKeys(
  flow: RegisterFlow,
  hasAgencyName = false,
): RegisterCopyKeys {
  switch (flow) {
    case "operator":
      return {
        eyebrow: `${R}.operatorEyebrow`,
        title: `${R}.operatorTitle`,
        description: `${R}.operatorDescription`,
        google: `${R}.googleContinue`,
        submit: `${R}.operatorSubmit`,
      };
    case "claim":
      return {
        eyebrow: `${R}.claimEyebrow`,
        title: hasAgencyName ? `${R}.claimTitleAgency` : `${R}.claimTitle`,
        description: `${R}.claimDescription`,
        google: `${R}.google`,
        submit: `${R}.claimSubmit`,
      };
    case "invite":
      return {
        eyebrow: `${R}.inviteEyebrow`,
        title: `${R}.inviteTitle`,
        description: `${R}.inviteDescription`,
        google: `${R}.google`,
        submit: `${R}.inviteSubmit`,
      };
    case "talent":
      return {
        eyebrow: `${RR}.talentEyebrow`,
        title: `${RR}.talentTitle`,
        description: `${RR}.talentDescription`,
        google: `${R}.google`,
        submit: `${RR}.talentSubmit`,
      };
    case "client":
      return {
        eyebrow: `${RR}.clientEyebrow`,
        title: `${RR}.clientTitle`,
        description: `${RR}.clientDescription`,
        google: `${R}.google`,
        submit: `${RR}.clientSubmit`,
      };
    case "generic":
      return {
        eyebrow: `${R}.eyebrow`,
        title: `${R}.title`,
        description: `${R}.description`,
        google: `${R}.google`,
        submit: `${R}.emailSubmit`,
      };
  }
}

/**
 * `/register?as=<intent>&<every other param, unchanged>`.
 *
 * Used by the three retired routes to redirect without losing anything on the
 * URL. Existing emails, page-builder CTAs, marketing links and inbound SEO
 * links carry real payload (`next`, `email`, `intent=inquiry`, `invitation`,
 * UTM tags), so the ONLY thing this rewrites is the intent: any inbound `as`
 * or `role` is replaced, everything else is copied through in order,
 * repeated params included.
 */
export function buildRegisterHref(
  intent: RegisterIntent,
  params: Readonly<Record<string, string | string[] | undefined>> = {},
): string {
  const query = new URLSearchParams();
  // Intent first so the URL reads as the front door it is.
  query.set(REGISTER_INTENT_PARAM, intent);

  for (const [key, value] of Object.entries(params)) {
    if (key === REGISTER_INTENT_PARAM || key === REGISTER_INTENT_LEGACY_PARAM) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
      continue;
    }
    if (typeof value === "string") query.append(key, value);
  }

  return `/register?${query.toString()}`;
}
