import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { platformConfigField } from "@/lib/integrations/platform-defaults";
import { EMAIL_DOMAIN_INTEGRATION_KEY } from "@/lib/integrations/catalog";
import { NOTIFICATION_CATALOG } from "@/lib/notifications/catalog";
import { loadNotificationOverlay, loadTemplateOverrides } from "@/lib/notifications/overlay";

/**
 * Read-only loaders for the platform-admin Email console
 * (/platform/admin/email). All run with the SERVICE-ROLE client (bypasses RLS)
 * — appropriate because the route is super_admin-gated at the layout layer.
 * Mirrors the loadPlatformAuditLog read pattern (platform-data.ts).
 */

/** Request-time (ms), read server-side. Kept out of the React render path so
 *  the client filter stays pure (the react-hooks/purity rule forbids Date.now
 *  in a component body — server components included). */
export function serverNowMs(): number {
  return Date.now();
}

// ─── Send log ────────────────────────────────────────────────────────────────

export type EmailLogRow = {
  id: string;
  createdAtIso: string;
  sentAtIso: string | null;
  eventKind: string;
  channel: string;
  status: string;
  recipientEmail: string | null;
  recipientUserId: string | null;
  tenantId: string | null;
  catalogEntryId: string | null;
  templateId: string | null;
  providerReference: string | null;
  errorMessage: string | null;
  deliveredAtIso: string | null;
  openedAtIso: string | null;
  clickedAtIso: string | null;
  bouncedAtIso: string | null;
  complaintAtIso: string | null;
  attempts: number;
  payload: Record<string, unknown> | null;
};

const LOG_COLUMNS =
  "id, created_at, sent_at, event_kind, channel, status, recipient_email, recipient_user_id, tenant_id, catalog_entry_id, template_id, provider_reference, error_message, delivered_at, opened_at, clicked_at, bounced_at, complaint_at, attempts, payload";

type RawLogRow = {
  id: string;
  created_at: string;
  sent_at: string | null;
  event_kind: string;
  channel: string;
  status: string;
  recipient_email: string | null;
  recipient_user_id: string | null;
  tenant_id: string | null;
  catalog_entry_id: string | null;
  template_id: string | null;
  provider_reference: string | null;
  error_message: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complaint_at: string | null;
  attempts: number | null;
  payload: Record<string, unknown> | null;
};

function normalizeLogRow(r: RawLogRow): EmailLogRow {
  return {
    id: r.id,
    createdAtIso: r.created_at,
    sentAtIso: r.sent_at,
    eventKind: r.event_kind,
    channel: r.channel,
    status: r.status,
    recipientEmail: r.recipient_email,
    recipientUserId: r.recipient_user_id,
    tenantId: r.tenant_id,
    catalogEntryId: r.catalog_entry_id,
    templateId: r.template_id,
    providerReference: r.provider_reference,
    errorMessage: r.error_message,
    deliveredAtIso: r.delivered_at,
    openedAtIso: r.opened_at,
    clickedAtIso: r.clicked_at,
    bouncedAtIso: r.bounced_at,
    complaintAtIso: r.complaint_at,
    attempts: r.attempts ?? 0,
    payload: r.payload,
  };
}

export async function loadEmailSendLog(opts?: { limit?: number }): Promise<EmailLogRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  const limit = opts?.limit ?? 300;
  const { data, error } = await sb
    .from("notification_dispatch_log")
    .select(LOG_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    logServerError("email-console.loadSendLog", error ?? new Error("no data"));
    return [];
  }
  return (data as unknown as RawLogRow[]).map(normalizeLogRow);
}

// ─── Metrics ───────────────────────────────────────────────────────────────--

export type EmailMetrics = {
  /** Number of rows the metrics were computed over (the bounded window). */
  windowRows: number;
  byStatus: { sent: number; failed: number; suppressed: number; queued: number; skipped: number };
  funnel: { sent: number; delivered: number; opened: number; clicked: number; bounced: number };
  /** Events with the most failures (status='failed'), most recent error sampled. */
  topFailingEvents: Array<{ eventKind: string; failed: number; lastError: string | null }>;
  last30d: { sent: number; failed: number };
};

const METRICS_WINDOW = 5000;

export async function loadEmailMetrics(): Promise<EmailMetrics> {
  const sb = createServiceRoleClient();
  const empty: EmailMetrics = {
    windowRows: 0,
    byStatus: { sent: 0, failed: 0, suppressed: 0, queued: 0, skipped: 0 },
    funnel: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 },
    topFailingEvents: [],
    last30d: { sent: 0, failed: 0 },
  };
  if (!sb) return empty;

  const { data, error } = await sb
    .from("notification_dispatch_log")
    .select(
      "status, event_kind, error_message, created_at, delivered_at, opened_at, clicked_at, bounced_at",
    )
    .order("created_at", { ascending: false })
    .limit(METRICS_WINDOW);
  if (error || !data) {
    logServerError("email-console.loadMetrics", error ?? new Error("no data"));
    return empty;
  }

  type Row = {
    status: string;
    event_kind: string;
    error_message: string | null;
    created_at: string;
    delivered_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    bounced_at: string | null;
  };
  const rows = data as unknown as Row[];
  const m: EmailMetrics = {
    ...empty,
    windowRows: rows.length,
    byStatus: { sent: 0, failed: 0, suppressed: 0, queued: 0, skipped: 0 },
    funnel: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 },
    topFailingEvents: [],
    last30d: { sent: 0, failed: 0 },
  };
  const thirtyAgo = Date.now() - 30 * 86400000;
  const failByEvent = new Map<string, { failed: number; lastError: string | null }>();

  for (const r of rows) {
    if (r.status in m.byStatus) m.byStatus[r.status as keyof typeof m.byStatus]++;
    if (r.status === "sent") m.funnel.sent++;
    if (r.delivered_at) m.funnel.delivered++;
    if (r.opened_at) m.funnel.opened++;
    if (r.clicked_at) m.funnel.clicked++;
    if (r.bounced_at) m.funnel.bounced++;
    const recent = new Date(r.created_at).getTime() >= thirtyAgo;
    if (recent && r.status === "sent") m.last30d.sent++;
    if (recent && r.status === "failed") m.last30d.failed++;
    if (r.status === "failed") {
      const e = failByEvent.get(r.event_kind) ?? { failed: 0, lastError: null };
      e.failed++;
      if (!e.lastError && r.error_message) e.lastError = r.error_message;
      failByEvent.set(r.event_kind, e);
    }
  }
  m.topFailingEvents = Array.from(failByEvent.entries())
    .map(([eventKind, v]) => ({ eventKind, failed: v.failed, lastError: v.lastError }))
    .sort((a, b) => b.failed - a.failed)
    .slice(0, 8);
  return m;
}

// ─── Suppressions ────────────────────────────────────────────────────────────

export type SuppressionRow = {
  id: string;
  email: string | null;
  userId: string | null;
  reason: string | null;
  source: string | null;
  notes: string | null;
  createdAtIso: string;
};

export async function loadEmailSuppressions(opts?: { limit?: number }): Promise<SuppressionRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  const limit = opts?.limit ?? 200;
  const { data, error } = await sb
    .from("email_suppressions")
    .select("id, email_address, user_id, reason, source, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    logServerError("email-console.loadSuppressions", error ?? new Error("no data"));
    return [];
  }
  type Raw = {
    id: string;
    email_address: string | null;
    user_id: string | null;
    reason: string | null;
    source: string | null;
    notes: string | null;
    created_at: string;
  };
  return (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    email: r.email_address,
    userId: r.user_id,
    reason: r.reason,
    source: r.source,
    notes: r.notes,
    createdAtIso: r.created_at,
  }));
}

// ─── Sending-domain health ─────────────────────────────────────────────────--

export type EmailDomainStatus = {
  fromAddress: string | null;
  domain: string | null;
  envFrom: string | null;
  /** The address mail will actually send from for platform-default sends. */
  effectiveFrom: string;
  status: "configured" | "env_fallback" | "unset";
};

export async function loadEmailDomainStatus(): Promise<EmailDomainStatus> {
  const fromAddress = await platformConfigField(EMAIL_DOMAIN_INTEGRATION_KEY, "from_address");
  const domain = await platformConfigField(EMAIL_DOMAIN_INTEGRATION_KEY, "domain");
  const envFrom = process.env.EMAIL_FROM?.trim() || null;
  const derivedFromDomain = domain ? `noreply@${domain.toLowerCase()}` : null;
  const effectiveFrom =
    fromAddress || derivedFromDomain || envFrom || "Tulala <noreply@tulala.digital>";
  const status: EmailDomainStatus["status"] =
    fromAddress || domain ? "configured" : envFrom ? "env_fallback" : "unset";
  return { fromAddress, domain, envFrom, effectiveFrom, status };
}

// ─── Catalog + per-event toggles (P3b) ───────────────────────────────────────

export type CatalogEntryState = {
  id: string;
  category: string;
  required: boolean;
  hasEmail: boolean;
  hasInApp: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

/**
 * Every code catalog entry merged with the admin overlay — drives the console's
 * per-event toggle grid. `emailEnabled`/`inAppEnabled` reflect the effective
 * state (overlay false = off, else on). `required` entries can't be disabled.
 */
export async function loadNotificationCatalogState(): Promise<CatalogEntryState[]> {
  const overlay = await loadNotificationOverlay();
  return NOTIFICATION_CATALOG.map((e) => {
    const o = overlay.get(e.id);
    return {
      id: e.id,
      category: e.category,
      required: e.required ?? false,
      hasEmail: Boolean(e.email),
      hasInApp: Boolean(e.in_app),
      emailEnabled: o?.email !== false,
      inAppEnabled: o?.in_app !== false,
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}

// ─── Editable template overrides (P3b) ───────────────────────────────────────

/**
 * Locales the template editor exposes. Sourced from the platform registry's
 * `adminLocales` (the set enabled for admin/back-end surfaces). The fallback
 * `["en", "es"]` is only reached when the DB is unavailable (test / offline).
 *
 * @deprecated Prefer passing `adminLocales` from `fetchLanguageSettingsPublic()`
 * at the page level and threading it through as a prop — this constant remains
 * only for call sites that can't easily receive the prop.
 */
export const TEMPLATE_LOCALES = ["en", "es"] as const;

export type TemplateLocaleOverride = {
  subject: string;
  body: string;
  enabled: boolean;
  hasOverride: boolean;
};

export type TemplateOverrideState = {
  id: string; // catalog_entry_id
  category: string;
  /** Override draft per locale (en, es). A blank subject/body = code default. */
  byLocale: Record<string, TemplateLocaleOverride>;
};

/**
 * Every email-capable catalog entry merged with its template overrides per
 * locale — the console's template editor. Tenant `default_locale` selects which
 * override the render path uses (en fallback); a blank field = the code default.
 */
export async function loadEmailTemplateState(): Promise<TemplateOverrideState[]> {
  const overrides = await loadTemplateOverrides();
  return NOTIFICATION_CATALOG.filter((e) => Boolean(e.email))
    .map((e) => {
      const byLocale: Record<string, TemplateLocaleOverride> = {};
      for (const loc of TEMPLATE_LOCALES) {
        const o = overrides.get(`${e.id}::${loc}`);
        byLocale[loc] = {
          subject: o?.subject ?? "",
          body: o?.body ?? "",
          enabled: o?.enabled ?? false,
          hasOverride: Boolean(o),
        };
      }
      return { id: e.id, category: e.category, byLocale };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}

// ─── Self-serve white-label sending domains ──────────────────────────────────

export type SendingDomainRecord = {
  record?: string;
  type?: string;
  name?: string;
  value?: string;
  ttl?: string;
  priority?: number;
  status?: string;
};

export type SendingDomainState = {
  tenantId: string;
  agencyName: string | null;
  domain: string;
  verificationStatus: string;
  connected: boolean;
  records: SendingDomainRecord[];
};

const PLATFORM_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Every tenant white-label sending domain (the email_domain integration rows,
 * excluding the platform default). Drives the console's "Sending domains"
 * section: domain + Resend verification status + the DNS records to add.
 */
export async function loadSendingDomains(): Promise<SendingDomainState[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("tenant_integrations")
    .select("tenant_id, status, config_json")
    .eq("integration_key", EMAIL_DOMAIN_INTEGRATION_KEY)
    .neq("tenant_id", PLATFORM_TENANT_ID);
  if (error || !data) {
    if (error) logServerError("email-console.loadSendingDomains", error);
    return [];
  }
  const rows = data as Array<{
    tenant_id: string;
    status: string | null;
    config_json: Record<string, unknown> | null;
  }>;

  const names = new Map<string, string>();
  const ids = rows.map((r) => r.tenant_id);
  if (ids.length) {
    const { data: ag } = await sb.from("agencies").select("id, display_name").in("id", ids);
    for (const a of (ag ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (a.display_name) names.set(a.id, a.display_name);
    }
  }

  return rows
    .map((r) => {
      const c = r.config_json ?? {};
      return {
        tenantId: r.tenant_id,
        agencyName: names.get(r.tenant_id) ?? null,
        domain: typeof c.domain === "string" ? c.domain : "",
        verificationStatus: typeof c.verification_status === "string" ? c.verification_status : "unknown",
        connected: r.status === "connected",
        records: Array.isArray(c.records) ? (c.records as SendingDomainRecord[]) : [],
      };
    })
    .filter((d) => d.domain)
    .sort((a, b) => (a.agencyName ?? a.tenantId).localeCompare(b.agencyName ?? b.tenantId));
}
