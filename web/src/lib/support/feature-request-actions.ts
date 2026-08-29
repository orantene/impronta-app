"use server";

import { z } from "zod";

import { checkSupportTicketCreate } from "@/lib/rate-limit-kv";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { assertHqAccess, resolveSupportRequester } from "./support-access";
import { featureFrom, mapFeatureRequestRow } from "./feature-requests";
import {
  FEATURE_REQUEST_STATUSES,
  type FeatureRequestRow,
} from "./feature-request-types";
import type { SupportSurface } from "./support-types";

type Fail = { ok: false; error: string };

const uuid = z.string().uuid();

const submitSchema = z.object({
  tenantSlug: z.string().min(1).nullable(),
  surface: z.enum(["workspace", "talent", "client"]),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().max(4000).optional(),
  area: z.string().trim().max(80).optional(),
  contactPhone: z.string().trim().max(40).optional(),
});

/**
 * Submit a feature request. Same guard ladder as a ticket: the surface
 * resolver proves who the requester is (and, for clients, that they really
 * belong to the workspace they claim).
 */
export async function submitFeatureRequestAction(
  raw: z.infer<typeof submitSchema>,
): Promise<{ ok: true; requestId: string; requestNumber: number } | Fail> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const requester = await resolveSupportRequester({
    tenantSlug: parsed.data.tenantSlug,
    surface: parsed.data.surface as SupportSurface,
  });
  if (!requester.ok) return requester;

  const limited = await checkSupportTicketCreate(requester.userId);
  if (!limited.ok) return { ok: false, error: "Too many requests. Try again shortly." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };

  const { data, error } = await featureFrom(admin, "support_feature_requests")
    .insert({
      tenant_id: requester.tenantId,
      surface: requester.surface,
      requester_user_id: requester.userId,
      title: parsed.data.title,
      body: parsed.data.body ?? "",
      area: parsed.data.area ?? null,
      contact_phone: parsed.data.contactPhone ?? null,
      contact_email: requester.email,
      status: "new",
      vote_count: 1,
    })
    .select("*")
    .single();
  if (error || !data) {
    logServerError("support.featureRequest.create", error);
    return { ok: false, error: "Could not send your idea." };
  }
  const row = mapFeatureRequestRow(data);
  if (!row) return { ok: false, error: "Could not send your idea." };

  // Seed the creator's vote (the trigger recomputes vote_count from the table).
  await featureFrom(admin, "support_feature_request_votes")
    .insert({ request_id: row.id, user_id: requester.userId });

  await dispatchEventNotifications({
    type: "support.feature_request.created",
    tenantId: null,
    eventId: row.id,
    payload: {
      requestId: row.id,
      requestNumber: row.requestNumber,
      title: row.title,
      body: row.body.slice(0, 300),
      tenantId: row.tenantId,
      requesterUserId: row.requesterUserId,
      contactPhone: row.contactPhone,
      adminPath: `/platform/admin/support?view=ideas&request=${row.id}`,
      platformFrom: true,
    },
  }).catch(() => undefined);

  return { ok: true, requestId: row.id, requestNumber: row.requestNumber };
}

/** Upvote (or un-vote) an existing request — one row per user, trigger-counted. */
export async function toggleFeatureRequestVoteAction(raw: {
  requestId: string;
}): Promise<{ ok: true; voted: boolean } | Fail> {
  const parsed = z.object({ requestId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { requireSession } = await import("@/lib/server/action-guards");
  const session = await requireSession();
  if (!session.ok) return session;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: existing } = await featureFrom(admin, "support_feature_request_votes")
    .select("request_id")
    .eq("request_id", parsed.data.requestId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (existing) {
    await featureFrom(admin, "support_feature_request_votes")
      .delete()
      .eq("request_id", parsed.data.requestId)
      .eq("user_id", session.user.id);
    return { ok: true, voted: false };
  }
  const { error } = await featureFrom(admin, "support_feature_request_votes")
    .insert({ request_id: parsed.data.requestId, user_id: session.user.id });
  if (error) return { ok: false, error: "Could not record your vote." };
  return { ok: true, voted: true };
}

/** HQ: move a request through its lifecycle and record the owner's notes. */
export async function hqUpdateFeatureRequestAction(raw: {
  requestId: string;
  status?: string;
  ownerNote?: string;
  shippedRef?: string;
  priority?: string;
  notifyRequester?: boolean;
}): Promise<{ ok: true } | Fail> {
  const parsed = z
    .object({
      requestId: uuid,
      status: z.enum(FEATURE_REQUEST_STATUSES).optional(),
      ownerNote: z.string().trim().max(2000).optional(),
      shippedRef: z
        .string()
        .trim()
        .max(800)
        .refine((u) => !u || /^https?:\/\//i.test(u), "http(s) links only")
        .optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      notifyRequester: z.boolean().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };

  const patch: Record<string, unknown> = {};
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.ownerNote !== undefined) patch.owner_note = parsed.data.ownerNote;
  if (parsed.data.shippedRef !== undefined) patch.shipped_ref = parsed.data.shippedRef;
  if (parsed.data.priority) patch.priority = parsed.data.priority;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data, error } = await featureFrom(admin, "support_feature_requests")
    .update(patch)
    .eq("id", parsed.data.requestId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    logServerError("support.featureRequest.update", error);
    return { ok: false, error: "Could not update the request." };
  }

  const { logPlatformAdminAction } = await import("@/lib/platform/audit");
  await logPlatformAdminAction({
    actorUserId: hq.userId,
    targetKind: "workspace",
    targetId: parsed.data.requestId,
    action: "support.feature_request.updated",
    after: patch,
    supportMode: "read_only",
  });

  const row: FeatureRequestRow | null = mapFeatureRequestRow(data);
  if (parsed.data.notifyRequester && row) {
    await dispatchEventNotifications({
      type: "support.feature_request.updated",
      tenantId: row.tenantId,
      eventId: crypto.randomUUID(),
      userId: row.requesterUserId,
      payload: {
        requestId: row.id,
        requestNumber: row.requestNumber,
        title: row.title,
        status: row.status,
        ownerNote: row.ownerNote ?? "",
        surface: row.surface,
        platformFrom: true,
      },
    }).catch(() => undefined);
  }

  return { ok: true };
}
