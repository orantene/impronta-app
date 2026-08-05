import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getRequestCorrelationId } from "@/lib/server/structured-log";

/**
 * Workspace Activity Log writer — the single entry point for recording an
 * event into `public.workspace_audit_events` (the unified per-tenant audit
 * trail surfaced at Admin → Settings → Activity log).
 *
 * Contract:
 *  - Best-effort, NEVER throws. An audit failure must not break the mutation
 *    that already succeeded.
 *  - Writes via the service-role client only (the table has no INSERT policy),
 *    so rows cannot be forged from the client.
 *  - `scheduleWorkspaceAudit` captures request context (actor, IP, country,
 *    user agent) eagerly while the request scope is still alive, then defers
 *    the insert past the response flush via `after()` — the user never waits
 *    on the audit round-trip.
 *  - Keep `metadata` SMALL (changed keys, ids, short fragments — never full
 *    entity snapshots). The table is insert-heavy and retention-capped.
 */

export type WorkspaceAuditCategory =
  | "settings"
  | "team"
  | "roster"
  | "media"
  | "pages"
  | "billing"
  | "messages"
  | "auth"
  | "domain"
  | "integration"
  | "security"
  | "system";

export type WorkspaceAuditActorKind =
  | "staff"
  | "talent"
  | "client"
  | "platform"
  | "system"
  | "guest";

export interface WorkspaceAuditEvent {
  tenantId: string;
  category: WorkspaceAuditCategory;
  /** Dotted machine action, e.g. "settings.branding.updated". */
  action: string;
  /** Human-readable one-liner shown in the log table. */
  summary?: string;
  /** Omit to auto-resolve from the current session. Pass null for system events. */
  actorUserId?: string | null;
  actorLabel?: string | null;
  actorKind?: WorkspaceAuditActorKind;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
}

interface AuditRow {
  tenant_id: string;
  actor_user_id: string | null;
  actor_label: string | null;
  actor_kind: WorkspaceAuditActorKind;
  action: string;
  category: WorkspaceAuditCategory;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  country: string | null;
  user_agent: string | null;
  correlation_id: string | null;
}

const SUMMARY_MAX = 300;

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Trusted client IP. Vercel appends the real client IP to the RIGHT of
 * x-forwarded-for at the edge, so the rightmost hop is platform-set and
 * non-spoofable; the leftmost is attacker-controllable. Prefer x-real-ip
 * (single platform-set value), fall back to the rightmost XFF hop.
 */
function resolveClientIp(h: Headers): string | null {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return null;
}

function actorKindFromAppRole(appRole: string | null | undefined): WorkspaceAuditActorKind {
  switch (appRole) {
    case "super_admin":
      return "platform";
    case "agency_staff":
      return "staff";
    case "talent":
      return "talent";
    case "client":
      return "client";
    default:
      return "system";
  }
}

interface RequestAuditContext {
  ip: string | null;
  country: string | null;
  userAgent: string | null;
  correlationId: string | null;
  sessionUserId: string | null;
  sessionUserLabel: string | null;
  sessionActorKind: WorkspaceAuditActorKind | null;
}

/**
 * Capture actor + request context. Must run while the request scope is alive
 * (`headers()` and the react-cached session are unavailable once the response
 * has flushed), which is why the schedule* helpers start this promise eagerly
 * and only defer the insert.
 */
async function captureRequestContext(): Promise<RequestAuditContext> {
  let ip: string | null = null;
  let country: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = resolveClientIp(h);
    country = h.get("x-vercel-ip-country")?.trim() || null;
    userAgent = truncate(h.get("user-agent"), 400);
  } catch {
    // Non-request context (cron, webhook) — no IP/UA to record.
  }

  let sessionUserId: string | null = null;
  let sessionUserLabel: string | null = null;
  let sessionActorKind: WorkspaceAuditActorKind | null = null;
  try {
    const session = await getCachedActorSession();
    if (session.user) {
      sessionUserId = session.user.id;
      sessionUserLabel = session.user.email ?? null;
      sessionActorKind = actorKindFromAppRole(session.profile?.app_role);
    }
  } catch {
    // Session unavailable — the caller's explicit actor fields still apply.
  }

  let correlationId: string | null = null;
  try {
    correlationId = getRequestCorrelationId();
  } catch {
    correlationId = null;
  }

  return { ip, country, userAgent, correlationId, sessionUserId, sessionUserLabel, sessionActorKind };
}

function assembleRow(
  event: WorkspaceAuditEvent,
  ctx: RequestAuditContext,
): AuditRow | null {
  if (!event.tenantId) return null;

  // The caller's explicit actor wins; `actorUserId: null` means "system event"
  // and suppresses session fallback, while omitting it opts into the session.
  const actorUserId =
    event.actorUserId === undefined ? ctx.sessionUserId : event.actorUserId;
  const sameAsSession = actorUserId !== null && actorUserId === ctx.sessionUserId;
  const actorLabel = event.actorLabel ?? (sameAsSession ? ctx.sessionUserLabel : null);
  const actorKind =
    event.actorKind ?? (sameAsSession ? ctx.sessionActorKind : null) ?? "system";

  return {
    tenant_id: event.tenantId,
    actor_user_id: actorUserId,
    actor_label: truncate(actorLabel, 200),
    actor_kind: actorKind,
    action: event.action,
    category: event.category,
    target_type: event.targetType ?? null,
    target_id: event.targetId ?? null,
    target_label: truncate(event.targetLabel, 200),
    summary: truncate(event.summary, SUMMARY_MAX),
    metadata: event.metadata ?? {},
    ip_address: ctx.ip,
    country: ctx.country,
    user_agent: ctx.userAgent,
    correlation_id: ctx.correlationId,
  };
}

async function insertRow(row: AuditRow): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) {
    // eslint-disable-next-line no-console
    console.error("[workspace-audit] service-role client unavailable; dropping event", {
      action: row.action,
      tenantId: row.tenant_id,
    });
    return;
  }
  const { error } = await admin.from("workspace_audit_events").insert(row);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[workspace-audit] insert failed", {
      action: row.action,
      tenantId: row.tenant_id,
      error: error.message,
    });
  }
}

/**
 * Record an audit event and wait for the write. Prefer
 * {@link scheduleWorkspaceAudit} from server actions / route handlers; use
 * this direct form only from contexts where `after()` is unavailable
 * (cron routes, webhooks).
 */
export async function logWorkspaceAudit(event: WorkspaceAuditEvent): Promise<void> {
  try {
    const row = assembleRow(event, await captureRequestContext());
    if (row) await insertRow(row);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[workspace-audit] unexpected error", { action: event.action, err });
  }
}

/**
 * Fire-and-forget: capture request context NOW, insert after the response
 * has flushed. Call without `await`.
 */
export function scheduleWorkspaceAudit(event: WorkspaceAuditEvent): void {
  scheduleWorkspaceAuditWith(() => event, event.action);
}

/**
 * Like {@link scheduleWorkspaceAudit}, but the event itself is resolved after
 * the response flushes. Use when building the event needs work the caller
 * should not wait on (for example a lookup to resolve the tenant id). Request
 * context is still captured eagerly, so IP / country / actor stay accurate.
 *
 * Returning `null` from `resolve` skips the write.
 */
export function scheduleWorkspaceAuditWith(
  resolve: () =>
    | WorkspaceAuditEvent
    | null
    | Promise<WorkspaceAuditEvent | null>,
  actionHint = "unknown",
): void {
  const onError = (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[workspace-audit] deferred audit failed", { action: actionHint, err });
  };
  try {
    // Start context capture immediately (request scope still alive) …
    const ctxPromise = captureRequestContext();
    // … but let the resolve + insert ride behind the response.
    after(async () => {
      try {
        const [ctx, event] = await Promise.all([ctxPromise, resolve()]);
        if (!event) return;
        const row = assembleRow(event, ctx);
        if (row) await insertRow(row);
      } catch (err) {
        onError(err);
      }
    });
  } catch {
    // `after()` unavailable (non-request context) — fall back to inline.
    void (async () => {
      try {
        const event = await resolve();
        if (event) await logWorkspaceAudit(event);
      } catch (err) {
        onError(err);
      }
    })();
  }
}
