/**
 * Server-only Vercel Domains Registrar client.
 *
 * Search / availability / price / buy via `/v1/registrar/domains/...`.
 * Uses `VERCEL_API_TOKEN` | `VERCEL_TOKEN` + optional `VERCEL_TEAM_ID`.
 * Never exposes the token. Skips cleanly when env is missing.
 *
 * Buy is intended for the Stripe webhook path ONLY (after payment).
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type EnvLike = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RegistrarContactInformation = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  companyName?: string;
};

export type RegistrarConfig = {
  token: string;
  teamId: string | null;
};

export type DomainAvailabilityResult = {
  attempted: boolean;
  available: boolean | null;
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type DomainPriceResult = {
  attempted: boolean;
  /** Price in the registrar's major currency units (e.g. USD dollars). */
  price: number | null;
  currency: string | null;
  periodYears: number | null;
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type DomainSearchQuote = {
  domain: string;
  available: boolean;
  price: number | null;
  currency: string | null;
  priceCents: number | null;
};

export type DomainSearchResult = {
  attempted: boolean;
  quotes: DomainSearchQuote[];
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type DomainBuyResult = {
  attempted: boolean;
  purchased: boolean;
  orderId: string | null;
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/** Product policy: purchased domains auto-renew at the registrar. */
export const REGISTRAR_AUTO_RENEW_POLICY = true as const;
export const REGISTRAR_PURCHASE_YEARS = 1 as const;

const SEARCH_WINDOW_MS = 60_000;
const SEARCH_MAX_PER_WINDOW = 10;

/** In-process search rate limit keyed by talent profile id. */
const searchHitsByTalent = new Map<string, number[]>();

export function resetRegistrarSearchRateLimitForTests(): void {
  searchHitsByTalent.clear();
}

export function checkRegistrarSearchRateLimit(
  talentProfileId: string,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; retryAfterMs: number } {
  const key = talentProfileId.trim();
  if (!key) return { ok: false, retryAfterMs: SEARCH_WINDOW_MS };
  const prior = (searchHitsByTalent.get(key) ?? []).filter(
    (t) => nowMs - t < SEARCH_WINDOW_MS,
  );
  if (prior.length >= SEARCH_MAX_PER_WINDOW) {
    const oldest = prior[0] ?? nowMs;
    return { ok: false, retryAfterMs: Math.max(0, SEARCH_WINDOW_MS - (nowMs - oldest)) };
  }
  prior.push(nowMs);
  searchHitsByTalent.set(key, prior);
  return { ok: true };
}

export function readVercelRegistrarConfig(
  env: EnvLike = process.env,
): RegistrarConfig | null {
  const token = (env.VERCEL_API_TOKEN ?? env.VERCEL_TOKEN ?? "").trim();
  if (!token) return null;
  const teamId = (env.VERCEL_TEAM_ID ?? "").trim() || null;
  return { token, teamId };
}

function teamQuery(config: RegistrarConfig): string {
  if (!config.teamId) return "";
  return `?teamId=${encodeURIComponent(config.teamId)}`;
}

async function parseVercelError(response: Response): Promise<{
  code: string | null;
  message: string | null;
}> {
  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string };
      code?: string;
      message?: string;
    };
    return {
      code: payload.error?.code ?? payload.code ?? null,
      message: payload.error?.message ?? payload.message ?? null,
    };
  } catch {
    return { code: null, message: response.statusText || null };
  }
}

function toPriceCents(price: number | null): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * 100);
}

export async function getDomainAvailability(
  domain: string,
  options: { env?: EnvLike; fetchFn?: FetchLike } = {},
): Promise<DomainAvailabilityResult> {
  const config = readVercelRegistrarConfig(options.env);
  if (!config) {
    return {
      attempted: false,
      available: null,
      skippedReason: "VERCEL_API_TOKEN/VERCEL_TOKEN is not configured.",
      errorCode: null,
      errorMessage: null,
    };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const url = `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/availability${teamQuery(config)}`;
  try {
    const response = await fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await parseVercelError(response);
      return {
        attempted: true,
        available: null,
        skippedReason: null,
        errorCode: err.code,
        errorMessage: err.message,
      };
    }
    const payload = (await response.json()) as { available?: boolean };
    return {
      attempted: true,
      available: Boolean(payload.available),
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    logServerError("vercelRegistrar.availability", error);
    return {
      attempted: true,
      available: null,
      skippedReason: null,
      errorCode: "network_error",
      errorMessage: "Availability check failed.",
    };
  }
}

export async function getDomainPrice(
  domain: string,
  options: { env?: EnvLike; fetchFn?: FetchLike } = {},
): Promise<DomainPriceResult> {
  const config = readVercelRegistrarConfig(options.env);
  if (!config) {
    return {
      attempted: false,
      price: null,
      currency: null,
      periodYears: null,
      skippedReason: "VERCEL_API_TOKEN/VERCEL_TOKEN is not configured.",
      errorCode: null,
      errorMessage: null,
    };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const url = `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/price${teamQuery(config)}`;
  try {
    const response = await fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await parseVercelError(response);
      return {
        attempted: true,
        price: null,
        currency: null,
        periodYears: null,
        skippedReason: null,
        errorCode: err.code,
        errorMessage: err.message,
      };
    }
    const payload = (await response.json()) as {
      price?: number;
      purchasePrice?: number;
      currency?: string;
      period?: number;
      years?: number;
    };
    const price =
      typeof payload.price === "number"
        ? payload.price
        : typeof payload.purchasePrice === "number"
          ? payload.purchasePrice
          : null;
    return {
      attempted: true,
      price,
      currency: typeof payload.currency === "string" ? payload.currency : "usd",
      periodYears:
        typeof payload.years === "number"
          ? payload.years
          : typeof payload.period === "number"
            ? payload.period
            : 1,
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    logServerError("vercelRegistrar.price", error);
    return {
      attempted: true,
      price: null,
      currency: null,
      periodYears: null,
      skippedReason: null,
      errorCode: "network_error",
      errorMessage: "Price check failed.",
    };
  }
}

/**
 * Search a single hostname: availability + price quote.
 * Callers must rate-limit by talent id via `checkRegistrarSearchRateLimit`.
 */
export async function searchDomainQuote(
  domain: string,
  options: { env?: EnvLike; fetchFn?: FetchLike } = {},
): Promise<DomainSearchResult> {
  const availability = await getDomainAvailability(domain, options);
  if (!availability.attempted) {
    return {
      attempted: false,
      quotes: [],
      skippedReason: availability.skippedReason,
      errorCode: null,
      errorMessage: null,
    };
  }
  if (availability.errorCode || availability.available == null) {
    return {
      attempted: true,
      quotes: [],
      skippedReason: null,
      errorCode: availability.errorCode,
      errorMessage: availability.errorMessage,
    };
  }
  if (!availability.available) {
    return {
      attempted: true,
      quotes: [
        {
          domain,
          available: false,
          price: null,
          currency: null,
          priceCents: null,
        },
      ],
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  const price = await getDomainPrice(domain, options);
  if (price.errorCode || price.price == null) {
    return {
      attempted: true,
      quotes: [
        {
          domain,
          available: true,
          price: null,
          currency: price.currency,
          priceCents: null,
        },
      ],
      skippedReason: null,
      errorCode: price.errorCode,
      errorMessage: price.errorMessage ?? "Price unavailable.",
    };
  }

  return {
    attempted: true,
    quotes: [
      {
        domain,
        available: true,
        price: price.price,
        currency: price.currency,
        priceCents: toPriceCents(price.price),
      },
    ],
    skippedReason: null,
    errorCode: null,
    errorMessage: null,
  };
}

export async function buyDomain(
  domain: string,
  opts: {
    expectedPrice: number;
    contactInformation: RegistrarContactInformation;
    years?: number;
    autoRenew?: boolean;
    env?: EnvLike;
    fetchFn?: FetchLike;
  },
): Promise<DomainBuyResult> {
  const config = readVercelRegistrarConfig(opts.env);
  if (!config) {
    return {
      attempted: false,
      purchased: false,
      orderId: null,
      skippedReason: "VERCEL_API_TOKEN/VERCEL_TOKEN is not configured.",
      errorCode: null,
      errorMessage: null,
    };
  }

  const fetchFn = opts.fetchFn ?? fetch;
  const url = `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/buy${teamQuery(config)}`;
  const body = {
    autoRenew: opts.autoRenew ?? REGISTRAR_AUTO_RENEW_POLICY,
    years: opts.years ?? REGISTRAR_PURCHASE_YEARS,
    expectedPrice: opts.expectedPrice,
    contactInformation: opts.contactInformation,
  };

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await parseVercelError(response);
      return {
        attempted: true,
        purchased: false,
        orderId: null,
        skippedReason: null,
        errorCode: err.code,
        errorMessage: err.message,
      };
    }
    const payload = (await response.json()) as { orderId?: string };
    return {
      attempted: true,
      purchased: true,
      orderId: typeof payload.orderId === "string" ? payload.orderId : null,
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    logServerError("vercelRegistrar.buy", error);
    return {
      attempted: true,
      purchased: false,
      orderId: null,
      skippedReason: null,
      errorCode: "network_error",
      errorMessage: "Domain purchase failed.",
    };
  }
}

export type RegistrarDomainInfo = {
  attempted: boolean;
  ok: boolean;
  /** When the registrar says the domain expires (ISO), null when unknown. */
  expiresAt: string | null;
  autoRenew: boolean | null;
  /** What the registrar charges to renew, USD cents; null when it does not say. Never guessed from the buy price. */
  renewalPriceCents: number | null;
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Read one registered domain: expiry, auto-renew flag and renewal price
 * (`GET /v1/registrar/domains/{domain}`). Parsing is deliberately tolerant of
 * the field spellings the registrar uses; anything it does not state stays null
 * so callers never bill or schedule off a guess.
 */
export async function getRegistrarDomain(
  domain: string,
  options: { env?: EnvLike; fetchFn?: FetchLike } = {},
): Promise<RegistrarDomainInfo> {
  const empty = { expiresAt: null, autoRenew: null, renewalPriceCents: null } as const;
  const config = readVercelRegistrarConfig(options.env);
  if (!config) {
    return {
      attempted: false,
      ok: false,
      ...empty,
      skippedReason: "VERCEL_API_TOKEN/VERCEL_TOKEN is not configured.",
      errorCode: null,
      errorMessage: null,
    };
  }
  const fetchFn = options.fetchFn ?? fetch;
  const url = `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}${teamQuery(config)}`;
  try {
    const response = await fetchFn(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
    });
    if (!response.ok) {
      const err = await parseVercelError(response);
      return { attempted: true, ok: false, ...empty, skippedReason: null, errorCode: err.code, errorMessage: err.message };
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const body = (typeof raw.domain === "object" && raw.domain !== null ? raw.domain : raw) as Record<string, unknown>;
    const renewal = body.renewalPrice ?? body.renewal_price ?? body.renewPrice;
    return {
      attempted: true,
      ok: true,
      expiresAt: toIso(body.expiresAt ?? body.expires_at ?? body.expirationDate),
      autoRenew: typeof body.autoRenew === "boolean" ? body.autoRenew : null,
      renewalPriceCents: typeof renewal === "number" ? toPriceCents(renewal) : null,
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    logServerError("vercelRegistrar.getDomain", error);
    return { attempted: true, ok: false, ...empty, skippedReason: null, errorCode: "network_error", errorMessage: "Domain lookup failed." };
  }
}

export type SetAutoRenewResult = {
  attempted: boolean;
  ok: boolean;
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/** Turn the registrar's auto-renew on or off (`PATCH /v1/registrar/domains/{domain}/auto-renew`). */
export async function setDomainAutoRenew(
  domain: string,
  autoRenew: boolean,
  options: { env?: EnvLike; fetchFn?: FetchLike } = {},
): Promise<SetAutoRenewResult> {
  const config = readVercelRegistrarConfig(options.env);
  if (!config) {
    return { attempted: false, ok: false, skippedReason: "VERCEL_API_TOKEN/VERCEL_TOKEN is not configured.", errorCode: null, errorMessage: null };
  }
  const fetchFn = options.fetchFn ?? fetch;
  const url = `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/auto-renew${teamQuery(config)}`;
  try {
    const response = await fetchFn(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ autoRenew }),
    });
    if (!response.ok) {
      const err = await parseVercelError(response);
      return { attempted: true, ok: false, skippedReason: null, errorCode: err.code, errorMessage: err.message };
    }
    return { attempted: true, ok: true, skippedReason: null, errorCode: null, errorMessage: null };
  } catch (error) {
    logServerError("vercelRegistrar.setAutoRenew", error);
    return { attempted: true, ok: false, skippedReason: null, errorCode: "network_error", errorMessage: "Auto-renew update failed." };
  }
}
