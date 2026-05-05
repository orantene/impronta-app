import { resolve4, resolveCname, resolveTxt } from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  buildCustomDomainRoutingRecords,
  customDomainNeedsRouting,
  isAcceptedVercelCname,
  isLikelyApexCustomDomain,
  normalizeDnsComparableValue,
  VERCEL_APEX_A_RECORD,
  type DomainRoutingRecord,
} from "./custom-domain-routing";

export type CustomDomainLifecycleStatus =
  | "pending"
  | "dns_verification_sent"
  | "verified"
  | "ssl_provisioned"
  | "active"
  | "failed"
  | "suspended";

export type CustomDomainVerificationRecord = {
  id: string;
  tenantId: string;
  tenantSlug: string | null;
  hostname: string;
  status: CustomDomainLifecycleStatus;
  verificationToken: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastHealthCheckAt: string | null;
  verifiedAt: string | null;
  sslProvisionedAt: string | null;
  failureReason: string | null;
};

export type DomainVerificationTransition = {
  status: CustomDomainLifecycleStatus;
  verifiedAt: string | null;
  failureReason: string | null;
  lastHealthCheckAt: string;
  matchedToken: boolean;
  expired: boolean;
};

export type PendingDomainSweepReport = {
  scanned: number;
  verified: number;
  stillPending: number;
  failed: number;
  results: Array<{
    id: string;
    hostname: string;
    from: CustomDomainLifecycleStatus;
    to: CustomDomainLifecycleStatus;
    matchedToken: boolean;
    expired: boolean;
  }>;
};

type TxtResolver = (hostname: string) => Promise<string[][]>;
type ResolveARecords = (hostname: string) => Promise<string[]>;
type ResolveCnameRecords = (hostname: string) => Promise<string[]>;
type DomainHttpsProbe = (
  hostname: string,
) => Promise<{ reachable: boolean; fromVercel: boolean }>;

export type DomainProvisioningObservation = {
  routingRecords: DomainRoutingRecord[];
  matchedRouting: boolean;
  httpsReachable: boolean;
  httpsFromVercel: boolean;
};

export type DomainProvisioningTransition = {
  status: Extract<CustomDomainLifecycleStatus, "verified" | "ssl_provisioned" | "active">;
  failureReason: string | null;
  lastHealthCheckAt: string;
  sslProvisionedAt: string | null;
  matchedRouting: boolean;
  httpsReachable: boolean;
  httpsFromVercel: boolean;
};

export type ProvisioningDomainSweepReport = {
  scanned: number;
  active: number;
  sslProvisioned: number;
  stillVerified: number;
  results: Array<{
    id: string;
    hostname: string;
    from: CustomDomainLifecycleStatus;
    to: CustomDomainLifecycleStatus;
    matchedRouting: boolean;
    httpsReachable: boolean;
    httpsFromVercel: boolean;
  }>;
};

export const DOMAIN_VERIFICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type VercelDomainChallenge = {
  type: string;
  domain: string;
  value: string;
  reason: string | null;
};

type VercelDomainPayload = {
  verified?: boolean;
  verification?: Array<{
    type?: string;
    domain?: string;
    value?: string;
    reason?: string | null;
  }>;
};

type VercelDomainApiConfig = {
  token: string;
  projectId: string;
  teamId: string | null;
  teamSlug: string | null;
};

export type VercelDomainSyncResult = {
  attempted: boolean;
  attached: boolean;
  verified: boolean | null;
  alreadyExists: boolean;
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  challenges: VercelDomainChallenge[];
};

export type VercelDomainRemoveResult = {
  attempted: boolean;
  removed: boolean;
  skippedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type EnvLike = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function readVercelDomainApiConfig(
  env: EnvLike = process.env,
): VercelDomainApiConfig | null {
  const token = (env.VERCEL_API_TOKEN ?? env.VERCEL_TOKEN ?? "").trim();
  const projectId = (env.VERCEL_PROJECT_ID ?? "").trim();
  if (!token || !projectId) return null;
  const teamId = (env.VERCEL_TEAM_ID ?? "").trim() || null;
  const teamSlug = (env.VERCEL_TEAM_SLUG ?? "").trim() || null;
  return { token, projectId, teamId, teamSlug };
}

function vercelQuery(config: VercelDomainApiConfig): string {
  const query = new URLSearchParams();
  if (config.teamId) query.set("teamId", config.teamId);
  if (config.teamSlug) query.set("slug", config.teamSlug);
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function normalizeVercelChallenges(payload: VercelDomainPayload): VercelDomainChallenge[] {
  return (payload.verification ?? [])
    .map((challenge) => ({
      type: challenge.type ?? "",
      domain: challenge.domain ?? "",
      value: challenge.value ?? "",
      reason: challenge.reason ?? null,
    }))
    .filter((challenge) => challenge.type && challenge.domain && challenge.value);
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
    const code = payload.error?.code ?? payload.code ?? null;
    const message = payload.error?.message ?? payload.message ?? null;
    return { code, message };
  } catch {
    return { code: null, message: response.statusText || null };
  }
}

function vercelDomainPath(projectId: string, hostname: string): string {
  return `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`;
}

export async function ensureCustomDomainOnVercelProject(
  hostname: string,
  options: {
    env?: EnvLike;
    fetchFn?: FetchLike;
  } = {},
): Promise<VercelDomainSyncResult> {
  const config = readVercelDomainApiConfig(options.env);
  if (!config) {
    return {
      attempted: false,
      attached: false,
      verified: null,
      alreadyExists: false,
      skippedReason: "VERCEL_API_TOKEN/VERCEL_TOKEN or VERCEL_PROJECT_ID is not configured.",
      errorCode: null,
      errorMessage: null,
      challenges: [],
    };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const query = vercelQuery(config);
  const base = `https://api.vercel.com`;
  const addUrl = `${base}/v10/projects/${encodeURIComponent(config.projectId)}/domains${query}`;

  let addResponse: Response;
  try {
    addResponse = await fetchFn(addUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: hostname }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        attempted: true,
        attached: false,
        verified: null,
        alreadyExists: false,
        skippedReason: null,
        errorCode: "timeout",
        errorMessage: "Vercel API timed out",
        challenges: [],
      };
    }
    return {
      attempted: true,
      attached: false,
      verified: null,
      alreadyExists: false,
      skippedReason: null,
      errorCode: "network_error",
      errorMessage: error instanceof Error ? error.message : "Network error",
      challenges: [],
    };
  }

  if (addResponse.ok) {
    const payload = (await addResponse.json()) as VercelDomainPayload;
    return {
      attempted: true,
      attached: true,
      verified: typeof payload.verified === "boolean" ? payload.verified : null,
      alreadyExists: false,
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
      challenges: normalizeVercelChallenges(payload),
    };
  }

  const addError = await parseVercelError(addResponse);
  const addCode = (addError.code ?? "").toLowerCase();
  const addMessage = (addError.message ?? "").toLowerCase();
  const isAlreadyExists =
    addCode === "not_modified" ||
    addCode === "domain_already_in_use" ||
    addMessage.includes("already exists");
  if (!isAlreadyExists) {
    return {
      attempted: true,
      attached: false,
      verified: null,
      alreadyExists: false,
      skippedReason: null,
      errorCode: addError.code ?? `http_${addResponse.status}`,
      errorMessage: addError.message ?? "Could not add domain to Vercel project.",
      challenges: [],
    };
  }

  // M9: Verify the domain is on OUR project, not a different one.
  // A 200 means it exists on this project; a 404 means it's on another project.
  const getUrl = `${base}${vercelDomainPath(config.projectId, hostname)}${query}`;
  try {
    const getResponse = await fetchFn(getUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (getResponse.ok) {
      const payload = (await getResponse.json()) as VercelDomainPayload;
      return {
        attempted: true,
        attached: true,
        verified: typeof payload.verified === "boolean" ? payload.verified : null,
        alreadyExists: true,
        skippedReason: null,
        errorCode: null,
        errorMessage: null,
        challenges: normalizeVercelChallenges(payload),
      };
    }
    if (getResponse.status === 404) {
      return {
        attempted: true,
        attached: false,
        verified: null,
        alreadyExists: false,
        skippedReason: null,
        errorCode: "domain_taken_elsewhere",
        errorMessage: "This domain is registered on a different Vercel project; transfer it first.",
        challenges: [],
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        attempted: true,
        attached: false,
        verified: null,
        alreadyExists: false,
        skippedReason: null,
        errorCode: "timeout",
        errorMessage: "Vercel API timed out",
        challenges: [],
      };
    }
  }

  // Unknown error verifying ownership — treat as a retriable failure rather
  // than an optimistic success so callers don't assume the domain is attached.
  return {
    attempted: true,
    attached: false,
    verified: null,
    alreadyExists: true,
    skippedReason: null,
    errorCode: "domain_verification_failed",
    errorMessage: "Could not verify domain ownership on Vercel project.",
    challenges: [],
  };
}

export async function removeCustomDomainFromVercelProject(
  hostname: string,
  options: {
    env?: EnvLike;
    fetchFn?: FetchLike;
  } = {},
): Promise<VercelDomainRemoveResult> {
  const config = readVercelDomainApiConfig(options.env);
  if (!config) {
    return {
      attempted: false,
      removed: false,
      skippedReason: "VERCEL_API_TOKEN/VERCEL_TOKEN or VERCEL_PROJECT_ID is not configured.",
      errorCode: null,
      errorMessage: null,
    };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const query = vercelQuery(config);
  const removeUrl = `https://api.vercel.com${vercelDomainPath(config.projectId, hostname)}${query}`;

  let removeResponse: Response;
  try {
    removeResponse = await fetchFn(removeUrl, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${config.token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        attempted: true,
        removed: false,
        skippedReason: null,
        errorCode: "timeout",
        errorMessage: "Vercel API timed out",
      };
    }
    return {
      attempted: true,
      removed: false,
      skippedReason: null,
      errorCode: "network_error",
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }

  if (removeResponse.ok) {
    return {
      attempted: true,
      removed: true,
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  const removeError = await parseVercelError(removeResponse);
  const removeCode = (removeError.code ?? "").toLowerCase();
  if (removeResponse.status === 404 || removeCode === "not_found") {
    return {
      attempted: true,
      removed: true,
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  return {
    attempted: true,
    removed: false,
    skippedReason: null,
    errorCode: removeError.code ?? `http_${removeResponse.status}`,
    errorMessage: removeError.message ?? "Could not remove domain from Vercel project.",
  };
}

async function probeHttpsFromVercel(
  hostname: string,
): Promise<{ reachable: boolean; fromVercel: boolean }> {
  try {
    const response = await fetch(`https://${hostname}`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        "user-agent": "impronta-domain-check",
      },
    });

    const server = response.headers.get("server")?.toLowerCase() ?? "";
    const vercelId = response.headers.get("x-vercel-id");
    return {
      reachable: true,
      fromVercel: Boolean(vercelId) || server.includes("vercel"),
    };
  } catch {
    return { reachable: false, fromVercel: false };
  }
}

export function flattenTxtRecords(records: string[][]): string[] {
  return records.map((record) => record.join(""));
}

export function resolveDomainVerificationTransition(
  domain: Pick<
    CustomDomainVerificationRecord,
    "status" | "verificationToken" | "createdAt" | "updatedAt"
  >,
  txtRecords: string[],
  now = new Date(),
): DomainVerificationTransition {
  const nowIso = now.toISOString();
  const token = domain.verificationToken?.trim() ?? "";

  if (token && txtRecords.includes(token)) {
    return {
      status: "verified",
      verifiedAt: nowIso,
      failureReason: null,
      lastHealthCheckAt: nowIso,
      matchedToken: true,
      expired: false,
    };
  }

  const basis = domain.updatedAt ?? domain.createdAt;
  const ageMs = basis ? now.getTime() - new Date(basis).getTime() : 0;
  const expired =
    domain.status === "failed" ||
    ageMs >= DOMAIN_VERIFICATION_WINDOW_MS;

  return {
    status: expired ? "failed" : "dns_verification_sent",
    verifiedAt: null,
    failureReason: expired
      ? "TXT record not found before the 7-day verification window expired."
      : "TXT record not found yet.",
    lastHealthCheckAt: nowIso,
    matchedToken: false,
    expired,
  };
}

export async function loadCustomDomainVerificationRecord(
  supabase: SupabaseClient,
  tenantId: string,
  hostname: string,
): Promise<{ data: CustomDomainVerificationRecord | null; error: unknown | null }> {
  const { data, error } = await supabase
    .from("agency_domains")
    .select(
      "id, tenant_id, tenant_slug, hostname, status, verification_token, created_at, updated_at, last_health_check_at, verified_at, ssl_provisioned_at, failure_reason",
    )
    .eq("tenant_id", tenantId)
    .eq("kind", "custom")
    .eq("hostname", hostname)
    .maybeSingle();

  if (error || !data) {
    return {
      data: null,
      error,
    };
  }

  return {
    data: {
      id: data.id,
      tenantId: data.tenant_id,
      tenantSlug: data.tenant_slug,
      hostname: data.hostname,
      status: data.status as CustomDomainLifecycleStatus,
      verificationToken: data.verification_token,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastHealthCheckAt: data.last_health_check_at,
      verifiedAt: data.verified_at,
      sslProvisionedAt: data.ssl_provisioned_at,
      failureReason: data.failure_reason,
    },
    error: null,
  };
}

async function persistDomainVerificationTransition(
  supabase: SupabaseClient,
  domainId: string,
  transition: DomainVerificationTransition,
): Promise<void> {
  const { error } = await supabase
    .from("agency_domains")
    .update({
      status: transition.status,
      verified_at: transition.verifiedAt,
      ssl_provisioned_at: null,
      failure_reason: transition.failureReason,
      last_health_check_at: transition.lastHealthCheckAt,
    })
    .eq("id", domainId);

  if (error) {
    throw error;
  }
}

export async function verifyCustomDomainRecord(
  supabase: SupabaseClient,
  domain: CustomDomainVerificationRecord,
  options: {
    now?: Date;
    txtResolver?: TxtResolver;
  } = {},
): Promise<DomainVerificationTransition> {
  const now = options.now ?? new Date();
  const txtResolver = options.txtResolver ?? resolveTxt;

  let txtRecords: string[] = [];
  try {
    txtRecords = flattenTxtRecords(await txtResolver(domain.hostname));
  } catch {
    txtRecords = [];
  }

  const transition = resolveDomainVerificationTransition(domain, txtRecords, now);
  await persistDomainVerificationTransition(supabase, domain.id, transition);
  return transition;
}

export async function loadPendingCustomDomainVerifications(
  supabase: SupabaseClient,
  limit = 100,
): Promise<CustomDomainVerificationRecord[]> {
  const { data, error } = await supabase
    .from("agency_domains")
    .select(
      "id, tenant_id, tenant_slug, hostname, status, verification_token, created_at, updated_at, last_health_check_at, verified_at, ssl_provisioned_at, failure_reason",
    )
    .eq("kind", "custom")
    .eq("status", "dns_verification_sent")
    .not("verification_token", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    hostname: row.hostname,
    status: row.status as CustomDomainLifecycleStatus,
    verificationToken: row.verification_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastHealthCheckAt: row.last_health_check_at,
    verifiedAt: row.verified_at,
    sslProvisionedAt: row.ssl_provisioned_at,
    failureReason: row.failure_reason,
  }));
}

export async function inspectCustomDomainProvisioning(
  hostname: string,
  options: {
    resolveARecords?: ResolveARecords;
    resolveCnameRecords?: ResolveCnameRecords;
    httpsProbe?: DomainHttpsProbe;
  } = {},
): Promise<DomainProvisioningObservation> {
  const resolveARecords = options.resolveARecords ?? resolve4;
  const resolveCnameRecords = options.resolveCnameRecords ?? resolveCname;
  const httpsProbe = options.httpsProbe ?? probeHttpsFromVercel;
  const routingRecords = buildCustomDomainRoutingRecords(hostname);
  const expectsARecord = isLikelyApexCustomDomain(hostname);

  let aRecords: string[] = [];
  let cnameRecords: string[] = [];

  try {
    aRecords = await resolveARecords(hostname);
  } catch {
    aRecords = [];
  }

  try {
    cnameRecords = await resolveCnameRecords(hostname);
  } catch {
    cnameRecords = [];
  }

  const matchedRouting = expectsARecord
    ? aRecords.some((record) => normalizeDnsComparableValue(record) === VERCEL_APEX_A_RECORD)
    : cnameRecords.some((record) => isAcceptedVercelCname(record))
      || aRecords.some((record) => normalizeDnsComparableValue(record) === VERCEL_APEX_A_RECORD);

  const httpsResult = matchedRouting
    ? await httpsProbe(hostname)
    : { reachable: false, fromVercel: false };

  return {
    routingRecords,
    matchedRouting,
    httpsReachable: httpsResult.reachable,
    httpsFromVercel: httpsResult.fromVercel,
  };
}

export function resolveDomainProvisioningTransition(
  domain: Pick<CustomDomainVerificationRecord, "status" | "sslProvisionedAt">,
  observation: DomainProvisioningObservation,
  now = new Date(),
): DomainProvisioningTransition {
  const nowIso = now.toISOString();

  if (!observation.matchedRouting) {
    return {
      status: "verified",
      failureReason: "Routing records not found yet.",
      lastHealthCheckAt: nowIso,
      sslProvisionedAt: domain.sslProvisionedAt,
      matchedRouting: false,
      httpsReachable: observation.httpsReachable,
      httpsFromVercel: observation.httpsFromVercel,
    };
  }

  const sslProvisionedAt = domain.sslProvisionedAt ?? nowIso;
  if (observation.httpsReachable && observation.httpsFromVercel) {
    return {
      status: "active",
      failureReason: null,
      lastHealthCheckAt: nowIso,
      sslProvisionedAt,
      matchedRouting: true,
      httpsReachable: true,
      httpsFromVercel: true,
    };
  }

  return {
    status: "ssl_provisioned",
    failureReason: "Routing detected. Waiting for HTTPS to finish provisioning on Vercel.",
    lastHealthCheckAt: nowIso,
    sslProvisionedAt,
    matchedRouting: true,
    httpsReachable: observation.httpsReachable,
    httpsFromVercel: observation.httpsFromVercel,
  };
}

async function persistDomainProvisioningTransition(
  supabase: SupabaseClient,
  domainId: string,
  transition: DomainProvisioningTransition,
): Promise<void> {
  const { error } = await supabase
    .from("agency_domains")
    .update({
      status: transition.status,
      failure_reason: transition.failureReason,
      last_health_check_at: transition.lastHealthCheckAt,
      ssl_provisioned_at: transition.sslProvisionedAt,
    })
    .eq("id", domainId);

  if (error) {
    throw error;
  }
}

export async function syncCustomDomainProvisioning(
  supabase: SupabaseClient,
  domain: CustomDomainVerificationRecord,
  options: {
    now?: Date;
    resolveARecords?: ResolveARecords;
    resolveCnameRecords?: ResolveCnameRecords;
    httpsProbe?: DomainHttpsProbe;
  } = {},
): Promise<DomainProvisioningTransition> {
  const observation = await inspectCustomDomainProvisioning(domain.hostname, options);
  const transition = resolveDomainProvisioningTransition(
    {
      status: domain.status,
      sslProvisionedAt: domain.sslProvisionedAt,
    },
    observation,
    options.now ?? new Date(),
  );
  await persistDomainProvisioningTransition(supabase, domain.id, transition);
  return transition;
}

export async function loadProvisioningCustomDomains(
  supabase: SupabaseClient,
  limit = 100,
): Promise<CustomDomainVerificationRecord[]> {
  const { data, error } = await supabase
    .from("agency_domains")
    .select(
      "id, tenant_id, tenant_slug, hostname, status, verification_token, created_at, updated_at, last_health_check_at, verified_at, ssl_provisioned_at, failure_reason",
    )
    .eq("kind", "custom")
    .in("status", ["verified", "ssl_provisioned"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    hostname: row.hostname,
    status: row.status as CustomDomainLifecycleStatus,
    verificationToken: row.verification_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastHealthCheckAt: row.last_health_check_at,
    verifiedAt: row.verified_at,
    sslProvisionedAt: row.ssl_provisioned_at,
    failureReason: row.failure_reason,
  }));
}

export async function sweepProvisioningCustomDomains(
  supabase: SupabaseClient,
  options: {
    now?: Date;
    resolveARecords?: ResolveARecords;
    resolveCnameRecords?: ResolveCnameRecords;
    httpsProbe?: DomainHttpsProbe;
    limit?: number;
  } = {},
): Promise<ProvisioningDomainSweepReport> {
  const rows = await loadProvisioningCustomDomains(supabase, options.limit);
  const report: ProvisioningDomainSweepReport = {
    scanned: rows.length,
    active: 0,
    sslProvisioned: 0,
    stillVerified: 0,
    results: [],
  };

  for (const row of rows) {
    if (!customDomainNeedsRouting(row.status)) continue;

    try {
      const transition = await syncCustomDomainProvisioning(supabase, row, options);
      if (transition.status === "active") report.active += 1;
      else if (transition.status === "ssl_provisioned") report.sslProvisioned += 1;
      else report.stillVerified += 1;

      report.results.push({
        id: row.id,
        hostname: row.hostname,
        from: row.status,
        to: transition.status,
        matchedRouting: transition.matchedRouting,
        httpsReachable: transition.httpsReachable,
        httpsFromVercel: transition.httpsFromVercel,
      });
    } catch (error) {
      logServerError("saas.custom-domain.sweepProvisioning", error);
      report.stillVerified += 1;
      report.results.push({
        id: row.id,
        hostname: row.hostname,
        from: row.status,
        to: row.status,
        matchedRouting: false,
        httpsReachable: false,
        httpsFromVercel: false,
      });
    }
  }

  return report;
}

export async function sweepPendingCustomDomainVerifications(
  supabase: SupabaseClient,
  options: {
    now?: Date;
    txtResolver?: TxtResolver;
    limit?: number;
  } = {},
): Promise<PendingDomainSweepReport> {
  const rows = await loadPendingCustomDomainVerifications(
    supabase,
    options.limit,
  );

  const report: PendingDomainSweepReport = {
    scanned: rows.length,
    verified: 0,
    stillPending: 0,
    failed: 0,
    results: [],
  };

  for (const row of rows) {
    try {
      const transition = await verifyCustomDomainRecord(supabase, row, {
        now: options.now,
        txtResolver: options.txtResolver,
      });

      if (transition.status === "verified") report.verified += 1;
      else if (transition.status === "failed") report.failed += 1;
      else report.stillPending += 1;

      report.results.push({
        id: row.id,
        hostname: row.hostname,
        from: row.status,
        to: transition.status,
        matchedToken: transition.matchedToken,
        expired: transition.expired,
      });
    } catch (error) {
      logServerError("saas.custom-domain.sweepPending", error);
      report.failed += 1;
      report.results.push({
        id: row.id,
        hostname: row.hostname,
        from: row.status,
        to: "failed",
        matchedToken: false,
        expired: false,
      });
    }
  }

  return report;
}
