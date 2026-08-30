"use server";

import { z } from "zod";

import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import {
  checkSupportMessageSend,
  checkSupportTicketCreate,
} from "@/lib/rate-limit-kv";
import { resolveSupportRequester, assertTicketAccess } from "./support-access";
import { supportEngine } from "./support-engine";
import type { SupportCallbackPref, SupportSurface } from "./support-types";

const uuid = z.string().uuid();

// Server-side mirror of the collector's caps: the snapshot is client-sent
// telemetry, so every bound the collector applies client-side is re-enforced
// here (arbitrary blobs must never reach the platform-only diagnostics row).
const diagnosticsSchema = z
  .object({
    appVersion: z.string().max(80),
    route: z.string().max(300),
    url: z.string().max(600),
    viewport: z.object({ w: z.number(), h: z.number(), dpr: z.number() }).strip(),
    userAgent: z.string().max(400),
    locale: z.string().max(40),
    timezone: z.string().max(80),
    online: z.boolean(),
    consoleEvents: z
      .array(
        z
          .object({ level: z.string().max(10), message: z.string().max(500), ts: z.number() })
          .strip(),
      )
      .max(50),
    networkFailures: z
      .array(
        z
          .object({
            method: z.string().max(10),
            pathOnly: z.string().max(300),
            status: z.number().nullable(),
            durationMs: z.number(),
            ts: z.number(),
          })
          .strip(),
      )
      .max(25),
    routeHistory: z
      .array(z.object({ path: z.string().max(300), ts: z.number() }).strip())
      .max(20),
    sentryLastEventId: z.string().max(80).nullable(),
    collectedAt: z.string().max(40),
  })
  .strip();

const createSchema = z.object({
  tenantSlug: z.string().min(1).nullable(),
  surface: z.enum(["workspace", "talent", "client"]),
  body: z.string().trim().min(1).max(8000),
  subject: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  originSlug: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  callbackRequested: z.boolean().optional(),
  callbackPref: z.enum(["anytime", "morning", "afternoon", "evening"]).optional(),
  messageOranDirectly: z.boolean().optional(),
  // .catch: diagnostics are best-effort — a malformed snapshot is dropped,
  // never allowed to fail the ticket creation itself.
  diagnostics: diagnosticsSchema.optional().catch(undefined),
});

export type SupportActionOk<T extends object = object> = { ok: true } & T;
export type SupportActionFail = { ok: false; error: string };

async function rateLimited(
  check: Promise<{ ok: true } | { ok: false; code: string; retryAfterMs: number }>,
): Promise<SupportActionFail | null> {
  const r = await check;
  if (r.ok) return null;
  return { ok: false, error: "Too many requests. Try again shortly." };
}

export async function createSupportTicketAction(
  // diagnostics arrives untyped from the client; the zod schema (with .catch)
  // narrows or drops it at runtime.
  raw: Omit<z.infer<typeof createSchema>, "diagnostics"> & { diagnostics?: unknown },
): Promise<SupportActionOk<{ ticketId: string; ticketNumber: number }> | SupportActionFail> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const requester = await resolveSupportRequester({
    tenantSlug: parsed.data.tenantSlug,
    surface: parsed.data.surface as SupportSurface,
  });
  if (!requester.ok) return requester;

  const limited = await rateLimited(checkSupportTicketCreate(requester.userId));
  if (limited) return limited;

  const flags = await getAiFeatureFlags();
  const aiOn = flags.ai_master_enabled && flags.ai_support_enabled;

  const result = await supportEngine.createTicket({
    tenantId: requester.tenantId,
    surface: requester.surface,
    requester: { kind: "user", userId: requester.userId },
    talentProfileId: requester.talentProfileId,
    clientProfileId: requester.clientProfileId,
    subject: parsed.data.subject,
    body: parsed.data.body,
    category: parsed.data.category,
    originSlug: parsed.data.originSlug,
    contactEmail: requester.email,
    contactPhone: parsed.data.contactPhone,
    callbackRequested: parsed.data.callbackRequested,
    callbackPref: parsed.data.callbackPref as SupportCallbackPref | undefined,
    handledBy: aiOn ? "ai" : "human",
    messageOranDirectly: parsed.data.messageOranDirectly,
  });
  if (!result.ok) return result;
  if (parsed.data.diagnostics && typeof parsed.data.diagnostics === "object") {
    try {
      const { enrichDiagnosticsSnapshot, persistDiagnostics } = await import("./diagnostics/enrich");
      const snap = parsed.data.diagnostics as import("./diagnostics/collector").DiagnosticsSnapshot;
      const enriched = await enrichDiagnosticsSnapshot(snap, result.data.ticket);
      await persistDiagnostics(result.data.ticket, enriched);
    } catch {
      /* diagnostics are best-effort; never fail ticket create */
    }
  }
  return {
    ok: true,
    ticketId: result.data.ticket.id,
    ticketNumber: result.data.ticket.ticketNumber,
  };
}

export async function sendSupportMessageAction(raw: {
  ticketId: string;
  body: string;
}): Promise<SupportActionOk<{ messageId: string }> | SupportActionFail> {
  const parsed = z
    .object({ ticketId: uuid, body: z.string().trim().min(1).max(8000) })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const session = await resolveUserId();
  if (!session.ok) return session;

  const limited = await rateLimited(checkSupportMessageSend(session.userId));
  if (limited) return limited;

  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;

  const result = await supportEngine.appendMessage({
    ticketId: parsed.data.ticketId,
    authorKind: "requester",
    authorUserId: session.userId,
    body: parsed.data.body,
  });
  if (!result.ok) return result;
  return { ok: true, messageId: result.data.message.id };
}

export async function markSupportTicketReadAction(raw: {
  ticketId: string;
}): Promise<SupportActionOk | SupportActionFail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await resolveUserId();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;
  const result = await supportEngine.markRead({
    ticketId: parsed.data.ticketId,
    userId: session.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function requestHumanAction(raw: {
  ticketId: string;
}): Promise<SupportActionOk | SupportActionFail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await resolveUserId();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;
  const result = await supportEngine.escalateTicket({
    ticketId: parsed.data.ticketId,
    reason: "user_requested",
    actorUserId: session.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function rateSupportTicketAction(raw: {
  ticketId: string;
  rating: number;
  comment?: string;
}): Promise<SupportActionOk | SupportActionFail> {
  const parsed = z
    .object({
      ticketId: uuid,
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await resolveUserId();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;
  const result = await supportEngine.rateTicket({
    ticketId: parsed.data.ticketId,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    actorUserId: session.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function resolveSupportTicketAction(raw: {
  ticketId: string;
}): Promise<SupportActionOk | SupportActionFail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await resolveUserId();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;
  const result = await supportEngine.changeStatus({
    ticketId: parsed.data.ticketId,
    status: "resolved",
    actorUserId: session.userId,
    actorKind: "requester",
    expectedStatus: "open",
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function keepTicketOpenAction(raw: {
  ticketId: string;
}): Promise<SupportActionOk | SupportActionFail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await resolveUserId();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;
  const result = await supportEngine.keepTicketOpen({
    ticketId: parsed.data.ticketId,
    actorUserId: session.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function closeSupportTicketAction(raw: {
  ticketId: string;
}): Promise<SupportActionOk | SupportActionFail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await resolveUserId();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;
  const result = await supportEngine.changeStatus({
    ticketId: parsed.data.ticketId,
    status: "closed",
    actorUserId: session.userId,
    actorKind: "requester",
    expectedStatus: access.ticket.status,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function updateTicketContactAction(raw: {
  ticketId: string;
  contactPhone?: string;
  callbackRequested?: boolean;
  callbackPref?: SupportCallbackPref;
}): Promise<SupportActionOk | SupportActionFail> {
  const parsed = z
    .object({
      ticketId: uuid,
      contactPhone: z.string().trim().max(40).optional(),
      callbackRequested: z.boolean().optional(),
      callbackPref: z.enum(["anytime", "morning", "afternoon", "evening"]).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await resolveUserId();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.userId);
  if (!access.ok) return access;
  const result = await supportEngine.updateContact({
    ticketId: parsed.data.ticketId,
    contactPhone: parsed.data.contactPhone,
    callbackRequested: parsed.data.callbackRequested,
    callbackPref: parsed.data.callbackPref,
    actorUserId: session.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

async function resolveUserId(): Promise<{ ok: true; userId: string } | SupportActionFail> {
  const { requireSession } = await import("@/lib/server/action-guards");
  const session = await requireSession();
  if (!session.ok) return session;
  return { ok: true, userId: session.user.id };
}
