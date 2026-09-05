"use server";

import { guestCookieSigningEnabled } from "@/lib/guest-cookie";
import { guestSupportMayServe } from "@/lib/support/guest-support-serve";
import { resolveClientIp, resolveGuestSessionId } from "@/lib/guest/guest-session";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { notify } from "./support-engine-emit";
import { supportEngine } from "./support-engine";
import { loadOwnedGuestTicket } from "./guest-access";
import {
  checkGuestSupportCreateAbuse,
  checkGuestSupportEmailCapture,
  checkGuestSupportMessageAbuse,
} from "./guest-support-abuse-guard";
import { signGuestResumeToken, verifyGuestResumeToken } from "./guest-resume-token";
import { supportFrom } from "./support-from";
import {
  mapMessageRow,
  mapTicketRow,
  type SupportMessageRow,
  type SupportTicketRow,
} from "./support-types";

export type GuestSupportFail = { ok: false; error: string };
export type GuestSupportOk<T extends object = object> = { ok: true } & T;

async function requireSignedGuest(): Promise<
  | {
      ok: true;
      admin: NonNullable<ReturnType<typeof createServiceRoleClient>>;
      guestSessionId: string;
      userId: string | null;
      email: string | null;
    }
  | GuestSupportFail
> {
  if (!guestSupportMayServe(guestCookieSigningEnabled())) {
    return { ok: false, error: "Support chat is temporarily unavailable." };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Support chat is temporarily unavailable." };
  const guestSessionId = await resolveGuestSessionId();
  if (!guestSessionId) {
    return { ok: false, error: "We couldn't identify your session. Please refresh and try again." };
  }
  const actor = await getCachedActorSession();
  return {
    ok: true,
    admin,
    guestSessionId,
    userId: actor.user?.id ?? null,
    email: actor.user?.email ?? null,
  };
}

async function stampLeadId(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  ticket: SupportTicketRow,
  email: string,
): Promise<void> {
  const { data } = await admin
    .from("saas_marketing_signups")
    .select("id")
    .ilike("email", email.trim())
    .maybeSingle();
  const leadId = typeof data?.id === "string" ? data.id : null;
  if (!leadId) return;
  await supportFrom(admin, "support_tickets")
    .update({
      metadata: { ...ticket.metadata, lead_id: leadId },
    })
    .eq("id", ticket.id);
}

export async function startGuestSupportChatAction(input: {
  body: string;
  originSlug?: string | null;
  locale?: "en" | "es";
  honeypot?: string | null;
}): Promise<GuestSupportOk<{ ticketId: string; ticketNumber: number }> | GuestSupportFail> {
  const body = (input.body ?? "").trim();
  if (!body || body.length > 8000) return { ok: false, error: "Write a short question to start." };

  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const ip = await resolveClientIp();
  const abuse = await checkGuestSupportCreateAbuse({
    honeypot: input.honeypot,
    guestSessionId: ident.guestSessionId,
    ip,
    email: ident.email,
  });
  if (!abuse.ok) return { ok: false, error: abuse.error };

  const flags = await getAiFeatureFlags();
  const aiOn = flags.ai_master_enabled && flags.ai_support_enabled;
  const locale = input.locale === "es" ? "es" : "en";

  const result = await supportEngine.createTicket({
    tenantId: null,
    surface: "guest",
    requester: {
      kind: "guest",
      guestSessionId: ident.guestSessionId,
      userId: ident.userId,
    },
    body,
    originSlug: input.originSlug ?? "/",
    contactEmail: ident.email,
    handledBy: aiOn ? "ai" : "human",
    metadata: { locale },
  });
  if (!result.ok) return result;
  if (ident.email) {
    await stampLeadId(ident.admin, result.data.ticket, ident.email);
  }
  return {
    ok: true,
    ticketId: result.data.ticket.id,
    ticketNumber: result.data.ticket.ticketNumber,
  };
}

export async function sendGuestSupportMessageAction(input: {
  ticketId: string;
  body: string;
  honeypot?: string | null;
}): Promise<GuestSupportOk<{ messageId: string }> | GuestSupportFail> {
  const body = (input.body ?? "").trim();
  if (!body || body.length > 8000) return { ok: false, error: "Message is empty." };
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const ip = await resolveClientIp();
  const abuse = await checkGuestSupportMessageAbuse({
    honeypot: input.honeypot,
    guestSessionId: ident.guestSessionId,
    ip,
  });
  if (!abuse.ok) return { ok: false, error: abuse.error };

  const ticket = await loadOwnedGuestTicket(ident.admin, input.ticketId, {
    guestSessionId: ident.guestSessionId,
    userId: ident.userId,
  });
  if (!ticket) return { ok: false, error: "Thread not found." };

  const sent = await supportEngine.appendMessage({
    ticketId: ticket.id,
    authorKind: "requester",
    authorUserId: ident.userId,
    body,
  });
  if (!sent.ok) return sent;
  return { ok: true, messageId: sent.data.message.id };
}

export async function getGuestSupportThreadAction(input: {
  ticketId: string;
}): Promise<
  GuestSupportOk<{ ticket: SupportTicketRow; messages: SupportMessageRow[] }> | GuestSupportFail
> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const ticket = await loadOwnedGuestTicket(ident.admin, input.ticketId, {
    guestSessionId: ident.guestSessionId,
    userId: ident.userId,
  });
  if (!ticket) return { ok: false, error: "Thread not found." };
  const { data } = await supportFrom(ident.admin, "support_messages")
    .select("*")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  const messages = (data ?? []).map(mapMessageRow).filter(Boolean) as SupportMessageRow[];
  return { ok: true, ticket, messages };
}

export async function listGuestSupportThreadsAction(): Promise<
  GuestSupportOk<{ tickets: SupportTicketRow[] }> | GuestSupportFail
> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const { data } = await supportFrom(ident.admin, "support_tickets")
    .select("*")
    .eq("guest_session_id", ident.guestSessionId)
    .order("last_message_at", { ascending: false })
    .limit(20);
  const tickets = (data ?? []).map(mapTicketRow).filter(Boolean) as SupportTicketRow[];
  return { ok: true, tickets };
}

export async function attachGuestContactAction(input: {
  ticketId: string;
  email: string;
  name?: string | null;
  honeypot?: string | null;
}): Promise<GuestSupportOk<{ resumePath: string }> | GuestSupportFail> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  if (input.honeypot && input.honeypot.trim()) {
    return { ok: false, error: "Could not save your email." };
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email." };
  const capture = await checkGuestSupportEmailCapture(email);
  if (!capture.ok) return { ok: false, error: capture.error };

  const ticket = await loadOwnedGuestTicket(ident.admin, input.ticketId, {
    guestSessionId: ident.guestSessionId,
    userId: ident.userId,
  });
  if (!ticket) return { ok: false, error: "Thread not found." };

  const updated = await supportEngine.updateContact({
    ticketId: ticket.id,
    contactEmail: email,
    contactName: input.name?.trim() || null,
    actorUserId: ident.userId,
  });
  if (!updated.ok) return updated;
  await stampLeadId(ident.admin, updated.data, email);

  const eventId = crypto.randomUUID();
  notify({
    type: "support.guest.contact.confirm",
    tenantId: null,
    eventId,
    payload: {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      surface: "guest",
      contactEmail: email,
      contactName: input.name?.trim() || null,
      platformFrom: true,
    },
  });

  const token = signGuestResumeToken(ticket.id);
  return { ok: true, resumePath: token ? `/contact?t=${encodeURIComponent(token)}` : "/contact" };
}

export async function requestGuestHumanAction(input: {
  ticketId: string;
}): Promise<GuestSupportOk | GuestSupportFail> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const ticket = await loadOwnedGuestTicket(ident.admin, input.ticketId, {
    guestSessionId: ident.guestSessionId,
    userId: ident.userId,
  });
  if (!ticket) return { ok: false, error: "Thread not found." };
  const result = await supportEngine.escalateTicket({
    ticketId: ticket.id,
    reason: "user_requested",
    actorUserId: ident.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function markGuestThreadReadAction(input: {
  ticketId: string;
}): Promise<GuestSupportOk | GuestSupportFail> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const ticket = await loadOwnedGuestTicket(ident.admin, input.ticketId, {
    guestSessionId: ident.guestSessionId,
    userId: ident.userId,
  });
  if (!ticket) return { ok: false, error: "Thread not found." };
  await supportFrom(ident.admin, "support_tickets")
    .update({ guest_last_read_at: new Date().toISOString() })
    .eq("id", ticket.id);
  return { ok: true };
}

export async function resumeGuestThreadAction(input: {
  token: string;
}): Promise<GuestSupportOk<{ ticketId: string }> | GuestSupportFail> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const verified = verifyGuestResumeToken(input.token);
  if (!verified.ok) return { ok: false, error: "That resume link is not valid anymore." };

  const { data } = await supportFrom(ident.admin, "support_tickets")
    .select("*")
    .eq("id", verified.ticketId)
    .maybeSingle();
  const ticket = mapTicketRow(data);
  if (!ticket || ticket.surface !== "guest") {
    return { ok: false, error: "Thread not found." };
  }

  const prior = Array.isArray(ticket.metadata.prior_guest_sessions)
    ? (ticket.metadata.prior_guest_sessions as string[])
    : [];
  if (ticket.guestSessionId && ticket.guestSessionId !== ident.guestSessionId) {
    prior.push(ticket.guestSessionId);
  }
  await supportFrom(ident.admin, "support_tickets")
    .update({
      guest_session_id: ident.guestSessionId,
      metadata: { ...ticket.metadata, prior_guest_sessions: prior },
    })
    .eq("id", ticket.id);
  return { ok: true, ticketId: ticket.id };
}

export async function appendGuestContactCardAction(input: {
  ticketId: string;
}): Promise<GuestSupportOk | GuestSupportFail> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const ticket = await loadOwnedGuestTicket(ident.admin, input.ticketId, {
    guestSessionId: ident.guestSessionId,
    userId: ident.userId,
  });
  if (!ticket) return { ok: false, error: "Thread not found." };
  if (ticket.contactEmail || ident.email) return { ok: true };

  const { data } = await supportFrom(ident.admin, "support_messages")
    .select("card_payload")
    .eq("ticket_id", ticket.id)
    .eq("message_kind", "card");
  const already = ((data ?? []) as Array<{ card_payload?: { kind?: string } | null }>).some((row) => {
    return row.card_payload?.kind === "guest-contact";
  });
  if (already) return { ok: true };

  const card = await supportEngine.appendMessage({
    ticketId: ticket.id,
    authorKind: "system",
    authorUserId: null,
    body: "Leave an email if you want this answer, this thread, or a person to follow up.",
    messageKind: "card",
    cardPayload: { kind: "guest-contact" },
    skipNotify: true,
  });
  if (!card.ok) return card;
  return { ok: true };
}

export async function submitMarketingContactAction(input: {
  name: string;
  email: string;
  topic: string;
  message: string;
  phone?: string | null;
  honeypot?: string | null;
  locale?: "en" | "es";
}): Promise<GuestSupportOk<{ ticketId: string }> | GuestSupportFail> {
  const ident = await requireSignedGuest();
  if (!ident.ok) return ident;
  const ip = await resolveClientIp();
  const email = input.email.trim().toLowerCase();
  const abuse = await checkGuestSupportCreateAbuse({
    honeypot: input.honeypot,
    guestSessionId: ident.guestSessionId,
    ip,
    email,
  });
  if (!abuse.ok) return { ok: false, error: abuse.error };
  if (!input.name.trim() || !email.includes("@") || !input.message.trim()) {
    return { ok: false, error: "Name, email, and a message are required." };
  }

  const result = await supportEngine.createTicket({
    tenantId: null,
    surface: "guest",
    requester: {
      kind: "guest",
      guestSessionId: ident.guestSessionId,
      userId: ident.userId,
    },
    subject: `[guest] ${input.topic.trim() || "Contact form"}`,
    body: input.message.trim(),
    originSlug: "/contact",
    contactEmail: email,
    contactName: input.name.trim(),
    contactPhone: input.phone?.trim() || null,
    handledBy: "human",
    messageOranDirectly: true,
    metadata: { locale: input.locale === "es" ? "es" : "en", source: "contact_form" },
  });
  if (!result.ok) return result;
  await stampLeadId(ident.admin, result.data.ticket, email);

  // Tell the person we have it.
  //
  // This emit did not exist. The form created a ticket, sent the owner five
  // notifications, and sent the person who wrote in NOTHING — verified against
  // production, where no dispatch row has ever existed for a contact-form
  // address. Their whole experience of the page headed "A real person answers"
  // was the word "Sending…" and then silence, with no record they could return
  // to and no way to tell the message had arrived at all.
  //
  // The chat panel's email capture has always emitted this; only the form was
  // missing it, which is why it went unnoticed — the feature looked covered.
  notify({
    type: "support.guest.contact.confirm",
    tenantId: null,
    eventId: crypto.randomUUID(),
    payload: {
      ticketId: result.data.ticket.id,
      ticketNumber: result.data.ticket.ticketNumber,
      subject: input.topic.trim() || input.message.trim().slice(0, 80),
      surface: "guest",
      contactEmail: email,
      contactName: input.name.trim() || null,
      platformFrom: true,
    },
  });

  return { ok: true, ticketId: result.data.ticket.id };
}
