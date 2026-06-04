import "server-only";

/**
 * Resend Domains API helpers for the per-tenant white-label sending domain.
 *
 * Uses the PLATFORM `RESEND_API_KEY` (the same key the platform sends from) to
 * register and verify a tenant's own sending domain. The tenant never supplies
 * a Resend key — the platform owns the Resend account, and each tenant domain is
 * just another domain under that account. The verified `from` is then used for
 * that tenant's outbound mail (see resolveTenantEmailFrom).
 *
 * Resend Domains API (https://resend.com/docs/api-reference/domains):
 *   POST /domains            { name }            → { id, name, status, records[] }
 *   GET  /domains/{id}                            → { id, name, status, records[] }
 *   POST /domains/{id}/verify                     → triggers a re-check
 *
 * `status` is one of: not_started | pending | verified | failed | temporary_failure.
 * `records[]` are the DNS records the tenant must add (type/name/value/...).
 *
 * All helpers are read/throw-free: they return a discriminated result so the
 * server action can surface a clean error. They never expose the platform key.
 */

const RESEND_BASE = "https://api.resend.com";

/** A single DNS record Resend asks the tenant to add (shape varies by record). */
export type ResendDnsRecord = {
  record?: string;
  name?: string;
  type?: string;
  value?: string;
  ttl?: string;
  priority?: number;
  status?: string;
};

export type ResendDomainResult =
  | {
      ok: true;
      id: string;
      name: string;
      status: string;
      records: ResendDnsRecord[];
    }
  | { ok: false; error: string };

function apiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

type RawResendDomain = {
  id?: string;
  name?: string;
  status?: string;
  records?: unknown;
};

function normalizeRecords(raw: unknown): ResendDnsRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      record: typeof r.record === "string" ? r.record : undefined,
      name: typeof r.name === "string" ? r.name : undefined,
      type: typeof r.type === "string" ? r.type : undefined,
      value: typeof r.value === "string" ? r.value : undefined,
      ttl: typeof r.ttl === "string" ? r.ttl : undefined,
      priority: typeof r.priority === "number" ? r.priority : undefined,
      status: typeof r.status === "string" ? r.status : undefined,
    }));
}

function toResult(raw: RawResendDomain): ResendDomainResult {
  if (!raw.id || !raw.name) {
    return { ok: false, error: "Resend returned an unexpected response." };
  }
  return {
    ok: true,
    id: raw.id,
    name: raw.name,
    status: typeof raw.status === "string" ? raw.status : "pending",
    records: normalizeRecords(raw.records),
  };
}

/**
 * Register (create) a sending domain with Resend. Idempotent enough for our
 * use: if Resend already has the domain it returns a 4xx; the caller then polls
 * with the stored id instead. Returns the domain id + DNS records to display.
 */
export async function createResendDomain(
  domain: string,
): Promise<ResendDomainResult> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error: "Email sending is not configured on the platform (RESEND_API_KEY).",
    };
  }
  try {
    const r = await fetch(`${RESEND_BASE}/domains`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    });
    const json = (await r.json().catch(() => ({}))) as RawResendDomain & {
      message?: string;
    };
    if (!r.ok) {
      return {
        ok: false,
        error:
          typeof json.message === "string"
            ? json.message
            : `Resend rejected the domain (HTTP ${r.status}).`,
      };
    }
    return toResult(json);
  } catch {
    return { ok: false, error: "Couldn't reach the email provider." };
  }
}

/**
 * Fetch the current state (status + DNS records) of an already-registered
 * Resend domain by id. Optionally trigger a re-verification first so the
 * returned status reflects freshly-propagated DNS.
 */
export async function fetchResendDomain(
  domainId: string,
  triggerVerify = true,
): Promise<ResendDomainResult> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error: "Email sending is not configured on the platform (RESEND_API_KEY).",
    };
  }
  const auth = { Authorization: `Bearer ${key}` };
  try {
    if (triggerVerify) {
      // Best-effort verify trigger; ignore its body — we read state from GET.
      await fetch(`${RESEND_BASE}/domains/${domainId}/verify`, {
        method: "POST",
        headers: auth,
      }).catch(() => undefined);
    }
    const r = await fetch(`${RESEND_BASE}/domains/${domainId}`, {
      method: "GET",
      headers: auth,
    });
    const json = (await r.json().catch(() => ({}))) as RawResendDomain & {
      message?: string;
    };
    if (!r.ok) {
      return {
        ok: false,
        error:
          typeof json.message === "string"
            ? json.message
            : `Couldn't read the domain status (HTTP ${r.status}).`,
      };
    }
    return toResult(json);
  } catch {
    return { ok: false, error: "Couldn't reach the email provider." };
  }
}
