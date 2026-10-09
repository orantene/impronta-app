/** Pure helpers for the client account popover. No I/O, no clock of their own. */

/** Methods recorded on `client_auth_events.method` (foundation + Apple widen). */
export const CLIENT_AUTH_METHODS = ["email_code", "google", "password", "sso", "apple"] as const;
export type ClientAuthMethod = (typeof CLIENT_AUTH_METHODS)[number];

export function isClientAuthMethod(value: string): value is ClientAuthMethod {
  return (CLIENT_AUTH_METHODS as readonly string[]).includes(value);
}

export const RESEND_COOLDOWN_SECONDS = 30;

/** Whole seconds left before "Resend code" is allowed again; 0 means allowed. */
export function resendSecondsLeft(
  nowMs: number,
  lastSentMs: number | null,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): number {
  if (lastSentMs === null || !Number.isFinite(lastSentMs)) return 0;
  const left = Math.ceil((lastSentMs + cooldownSeconds * 1000 - nowMs) / 1000);
  return left > 0 ? Math.min(left, cooldownSeconds) : 0;
}

/** One or two capital letters for the signed-in avatar; "?" when nothing usable. */
export function accountInitials(displayName: string | null | undefined, email?: string | null): string {
  const name = (displayName ?? "").trim();
  const source = name || (email ?? "").split("@")[0]?.replace(/[._+-]+/g, " ").trim() || "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const second = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + second).toLocaleUpperCase();
}

/** Staff, talent and platform accounts are never treated as clients here. */
export function isClientAccountEligible(appRole: string | null | undefined): boolean {
  return appRole === "client" || appRole === null || appRole === undefined || appRole === "";
}

export type SummaryVisit = {
  title: string | null;
  eventDate: string | null;
  status: string | null;
  amountCents: number | null;
  currencyCode: string | null;
  paymentStatus: string | null;
};

export type AccountSummary = {
  nextVisit: { service: string | null; dateLabel: string; timeLabel: string } | null;
  unread: number;
  balanceDue: { amountCents: number; currencyCode: string } | null;
};

export const EMPTY_ACCOUNT_SUMMARY: AccountSummary = { nextVisit: null, unread: 0, balanceDue: null };

const OWED = new Set(["unpaid", "partial"]);

/** The zone actually used: the given IANA zone, or "UTC" when it is invalid. */
export function effectiveZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function zoned(ms: number, tz: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  const loc = locale === "es" ? "es-MX" : "en-US";
  try {
    return new Intl.DateTimeFormat(loc, { timeZone: tz, ...opts }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(loc, { timeZone: "UTC", ...opts }).format(ms);
  }
}

/**
 * Shapes the card. `upcoming` must already be tenant-scoped and owned by the
 * caller (the loader guarantees both). Balance sums only unpaid or partial
 * bookings in ONE currency; mixed currencies show the first, never a sum.
 */
export function shapeAccountSummary(input: {
  upcoming: readonly SummaryVisit[];
  unread: number;
  nowMs: number;
  timeZone: string;
  locale: string;
}): AccountSummary {
  const dated = input.upcoming
    .map((v) => ({ v, ms: v.eventDate ? Date.parse(v.eventDate) : NaN }))
    .filter((x) => Number.isFinite(x.ms) && x.ms >= input.nowMs - 3600_000)
    .sort((a, b) => a.ms - b.ms);
  const next = dated[0];
  const owed = input.upcoming.filter(
    (v) => OWED.has(v.paymentStatus ?? "") && (v.amountCents ?? 0) > 0 && v.currencyCode,
  );
  const currency = owed[0]?.currencyCode ?? null;
  const total = currency
    ? owed.filter((v) => v.currencyCode === currency).reduce((s, v) => s + (v.amountCents ?? 0), 0)
    : 0;
  return {
    nextVisit: next
      ? {
          service: next.v.title?.trim() || null,
          dateLabel: zoned(next.ms, input.timeZone, input.locale, { weekday: "short", day: "numeric", month: "short" }),
          timeLabel:
            zoned(next.ms, input.timeZone, input.locale, { hour: "numeric", minute: "2-digit" }) +
            (effectiveZone(input.timeZone) === "UTC" ? " UTC" : ""),
        }
      : null,
    unread: Math.max(0, Math.floor(input.unread || 0)),
    balanceDue: currency && total > 0 ? { amountCents: total, currencyCode: currency } : null,
  };
}

/** Existing-session pre-check: a business session must never reach the code form or verify. */
export function precheckSignIn(session: { signedIn: boolean; appRole: string | null | undefined }): "proceed" | "business_session" {
  return session.signedIn && !isClientAccountEligible(session.appRole) ? "business_session" : "proceed";
}

/** After a successful verify of a non-client email: sign out only when there was no prior session. */
export function shouldSignOutAfterVerify(hadPriorSession: boolean): boolean {
  return !hadPriorSession;
}

/** Host for `origin_domain` and `client_auth_events.host`: the `host` header only (x-impronta-host-name is not trusted). */
export function chooseTrustedHost(hostHeader: string | null | undefined): string | null {
  const h = (hostHeader ?? "").trim().toLowerCase();
  return h && /^[a-z0-9.-]+(:\d+)?$/.test(h) ? h : null;
}

/** Tenant source: only the proxy-set talent profile header on a talent_site host. Never a client value. */
export function tenantSourceProfileId(hostContext: string | null | undefined, profileHeader: string | null | undefined): string | null {
  if (hostContext !== "talent_site") return null;
  return profileHeader?.trim() || null;
}

/** Per-IP verify rate-limit key. */
export function verifyIpRateKey(ip: string): string {
  return `auth-otp-verify-ip:${ip || "unknown"}`;
}

/**
 * Whether claim/relink may run for this auth user.
 * OTP already proved the address; password/Google/Apple need
 * `email_confirmed_at` or a provider identity with `email_verified: true`.
 */
export function isAuthEmailConfirmedForClaim(user: {
  email_confirmed_at?: string | null;
  identities?: ReadonlyArray<{
    provider?: string | null;
    identity_data?: { email_verified?: boolean | string | null } | null;
  }> | null;
}): boolean {
  if (user.email_confirmed_at) return true;
  for (const id of user.identities ?? []) {
    const v = id.identity_data?.email_verified;
    if (v === true || v === "true") return true;
  }
  return false;
}

/**
 * Apple private-relay addresses never match a real inquiry contact email —
 * skip claim even when the provider marks them verified (TUL-65).
 */
export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.endsWith("@privaterelay.appleid.com");
}

/**
 * Claim/relink gate shared by code / password / Google / Apple attach.
 * OTP sets `otpProven`; OAuth/password supply confirmed + email.
 */
export function shouldClaimInquiriesForSignIn(input: {
  otpProven?: boolean;
  email: string | null | undefined;
  emailConfirmed: boolean;
}): boolean {
  if (input.otpProven) return true;
  if (!input.emailConfirmed) return false;
  if (isApplePrivateRelayEmail(input.email)) return false;
  return Boolean(normalizeClaimEmail(input.email));
}

function normalizeClaimEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** True when the session has a Google identity (required for Google finalize). */
export function userHasGoogleIdentity(user: {
  identities?: ReadonlyArray<{ provider?: string | null }> | null;
  app_metadata?: { provider?: string | null } | null;
}): boolean {
  if ((user.identities ?? []).some((i) => i.provider === "google")) return true;
  return user.app_metadata?.provider === "google";
}

/** True when the session has an Apple identity (required for Apple finalize). */
export function userHasAppleIdentity(user: {
  identities?: ReadonlyArray<{ provider?: string | null }> | null;
  app_metadata?: { provider?: string | null } | null;
}): boolean {
  if ((user.identities ?? []).some((i) => i.provider === "apple")) return true;
  return user.app_metadata?.provider === "apple";
}
