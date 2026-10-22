import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { resolveTenantAckLocale } from "@/lib/inquiry/guest-auto-ack";
import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-1606: the ONE short message the client gets when the person on their booking changed
 * (`clientNotice === "person_changed"`, i.e. the dropped person was shown by name).
 *
 * Reuses the inquiry thread's platform system note (`insertSystemMessage`, private thread), not a
 * new channel. The text carries the event title only: no names, price, margin, contact or any
 * other person's data. Idempotent: the note is tagged with a key derived from the operationKey and
 * a retry that finds the key writes nothing. A failure is logged and reported, never thrown.
 */

export type ClientNoticeResult = { sent: true; already: boolean } | { sent: false; reason: "no_inquiry" | "failed" };

export function clientNoticeKey(input: { bookingId: string; operationKey: string }): string {
  return `replace-notice:${input.bookingId}:${input.operationKey.trim()}`;
}

export function personChangedBody(locale: string | null | undefined, eventTitle: string): string {
  const title = eventTitle.trim();
  if ((locale ?? "").toLowerCase().startsWith("es")) {
    return `Un pequeño cambio${title ? ` en ${title}` : " en tu reserva"}: la persona asignada cambió. Todo lo demás sigue igual.`;
  }
  return `A small update${title ? ` on ${title}` : " on your booking"}: the person assigned has changed. Everything else stays the same.`;
}

/**
 * TUL-1606 (QA b11: the note showed as a Priya-authored thread marked "Necesita respuesta"):
 * the note is a SYSTEM line, not a client message. Same shape as the workspace auto-ack:
 * no sender, `message_kind: "system_event"` (the old insertSystemMessage left it at the column
 * default "text", which readers take for a customer line) and `metadata.system_event_type`.
 */
export function noticeMessageRow(args: { inquiryId: string; body: string; key: string }): Record<string, unknown> {
  return {
    inquiry_id: args.inquiryId,
    thread_type: "private",
    sender_user_id: null,
    guest_session_id: null,
    message_kind: "system_event",
    body: args.body,
    metadata: { system_event_type: "roster_talent_swapped", notice_key: args.key },
  };
}

type ThreadState = { conversation_state: string | null; last_customer_message_at: string | null; last_staff_message_at: string | null };
const STATE_COLUMNS = "conversation_state, last_customer_message_at, last_staff_message_at";

/** Which columns a write moved away from `before`; the note must move none of them. */
export function stateDrift(before: ThreadState, after: ThreadState): Partial<ThreadState> {
  const drift: Partial<ThreadState> = {};
  for (const k of ["conversation_state", "last_customer_message_at", "last_staff_message_at"] as const) {
    if (before[k] !== after[k]) drift[k] = before[k];
  }
  return drift;
}

async function readThreadState(admin: SupabaseClient, tenantId: string, inquiryId: string): Promise<ThreadState | null> {
  const { data, error } = await admin.from("inquiries").select(STATE_COLUMNS).eq("id", inquiryId).eq("tenant_id", tenantId).maybeSingle();
  if (error || !data) return null;
  return data as ThreadState;
}

/**
 * Posts the note and guarantees it is neither side's turn: the thread state is read before, and
 * if the insert (a DB trigger on a database that predates the system-line exemption) moved it to
 * "needs reply", the old values are put back.
 */
async function postSystemNotice(admin: SupabaseClient, tenantId: string, args: { inquiryId: string; body: string; key: string }): Promise<void> {
  const before = await readThreadState(admin, tenantId, args.inquiryId);
  const ins = await tenantScopedQuery(admin, "inquiry_messages", tenantId).insert(noticeMessageRow(args));
  if (ins.error) {
    logServerError("projects.clientNotice.insert", ins.error);
    return;
  }
  if (!before) return;
  const after = await readThreadState(admin, tenantId, args.inquiryId);
  if (!after) return;
  const drift = stateDrift(before, after);
  if (Object.keys(drift).length === 0) return;
  const fix = await tenantScopedQuery(admin, "inquiries", tenantId).update(drift).eq("id", args.inquiryId);
  if (fix.error) logServerError("projects.clientNotice.restoreState", fix.error);
}

export type ClientNoticeDeps = {
  post?: (admin: SupabaseClient, args: { inquiryId: string; body: string; key: string }) => Promise<void>;
};

async function alreadySent(admin: SupabaseClient, inquiryId: string, key: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("metadata->>notice_key", key)
    .limit(1);
  if (error) {
    logServerError("projects.clientNotice.dedupe", error);
    return null;
  }
  return ((data ?? []) as unknown[]).length > 0;
}

export async function sendPersonChangedNotice(
  admin: SupabaseClient,
  input: { tenantId: string; bookingId: string; operationKey: string; eventTitle: string },
  deps: ClientNoticeDeps = {},
): Promise<ClientNoticeResult> {
  try {
    const bookingRes = await admin
      .from("agency_bookings")
      .select("source_inquiry_id")
      .eq("id", input.bookingId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (bookingRes.error) {
      logServerError("projects.clientNotice.booking", bookingRes.error);
      return { sent: false, reason: "failed" };
    }
    const inquiryId = (bookingRes.data as { source_inquiry_id?: string | null } | null)?.source_inquiry_id ?? null;
    if (!inquiryId) return { sent: false, reason: "no_inquiry" };

    const key = clientNoticeKey(input);
    const seen = await alreadySent(admin, inquiryId, key);
    if (seen === null) return { sent: false, reason: "failed" };
    if (seen) return { sent: true, already: true };

    const inqRes = await admin
      .from("inquiries")
      .select("client_user_id")
      .eq("id", inquiryId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    const clientUserId = (inqRes.data as { client_user_id?: string | null } | null)?.client_user_id ?? null;
    let locale: string | null = null;
    if (clientUserId) {
      const prof = await admin.from("client_profiles").select("preferred_locale").eq("user_id", clientUserId).maybeSingle();
      locale = (prof.data as { preferred_locale?: string | null } | null)?.preferred_locale ?? null;
    }
    if (!locale) locale = await resolveTenantAckLocale(input.tenantId, { admin });

    const body = personChangedBody(locale, input.eventTitle);
    const post = deps.post ?? ((a, args) => postSystemNotice(a, input.tenantId, args));
    await post(admin, { inquiryId, body, key });
    // insertSystemMessage swallows its own errors, so confirm the note really exists.
    const written = await alreadySent(admin, inquiryId, key);
    return written ? { sent: true, already: false } : { sent: false, reason: "failed" };
  } catch (err) {
    logServerError("projects.clientNotice", err);
    return { sent: false, reason: "failed" };
  }
}
