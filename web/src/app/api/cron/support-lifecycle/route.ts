/**
 * Cron — support ticket lifecycle (hourly).
 *
 * (a) resolved older than 72h → closed
 * (b) open + waiting_on=requester + idle 5 days + no prior warning → autoclose warning
 * (c) idle 7 days → auto-resolve with metadata.auto_resolved=true
 * (d) open human-handled tickets with no agent reply 4h after escalation → re-alert owner
 * (e) proposed actions past expires_at → expired + notify requester
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { MAX_RE_ALERTS, shouldReAlert, waitedLabel } from "@/lib/support/realert-schedule";
import { supportFrom } from "@/lib/support/support-from";
import { mapTicketRow } from "@/lib/support/support-types";
import { loadTicketById, supportEngine } from "@/lib/support/support-engine";
import { insertEvent } from "@/lib/support/support-engine-db";
import { shouldEmitGuestRequesterMail } from "@/lib/support/guest-notification-audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/support-lifecycle", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  const stats = { closed: 0, warned: 0, autoResolved: 0, reAlerted: 0, expiredFixes: 0 };

  try {
    const { data: staleResolved } = await supportFrom(admin, "support_tickets")
      .select("*")
      .eq("status", "resolved")
      .lt("resolved_at", hoursAgo(72));
    for (const raw of staleResolved ?? []) {
      const ticket = mapTicketRow(raw);
      if (!ticket) continue;
      const r = await supportEngine.changeStatus({
        ticketId: ticket.id,
        status: "closed",
        actorUserId: null,
        actorKind: "system",
        expectedStatus: "resolved",
      });
      if (r.ok) stats.closed += 1;
    }

    const { data: idleWaiting } = await supportFrom(admin, "support_tickets")
      .select("*")
      .eq("status", "open")
      .eq("waiting_on", "requester")
      .lt("last_message_at", hoursAgo(5 * 24));
    for (const raw of idleWaiting ?? []) {
      const ticket = mapTicketRow(raw);
      if (!ticket) continue;
      const { data: prior } = await supportFrom(admin, "support_ticket_events")
        .select("id")
        .eq("ticket_id", ticket.id)
        .eq("event_type", "auto_close_warning")
        .limit(1);
      const idleHours =
        (Date.now() - new Date(ticket.lastMessageAt).getTime()) / 3600000;
      if ((!prior || prior.length === 0) && idleHours >= 5 * 24 && idleHours < 7 * 24) {
        const { data: ev } = await supportFrom(admin, "support_ticket_events")
          .insert({
            ticket_id: ticket.id,
            tenant_id: ticket.tenantId,
            actor_kind: "system",
            event_type: "auto_close_warning",
            new_value: { idleHours },
          })
          .select("id")
          .single();
        const guestMail = shouldEmitGuestRequesterMail({
          surface: ticket.surface,
          requesterUserId: ticket.requesterUserId,
          contactEmail: ticket.contactEmail,
        });
        if (guestMail) {
          const guestEventId = await insertEvent(admin, {
            ticketId: ticket.id,
            tenantId: ticket.tenantId,
            actorKind: "system",
            actorUserId: null,
            eventType: "auto_close_warning",
            newValue: { idleHours, audience: "guest" },
          });
          await dispatchEventNotifications({
            type: "support.ticket.autoclose.guest",
            tenantId: ticket.tenantId,
            eventId: guestEventId ?? crypto.randomUUID(),
            payload: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              subject: ticket.subject,
              surface: ticket.surface,
              contactEmail: ticket.contactEmail,
              contactName: ticket.contactName,
              platformFrom: true,
            },
          }).catch(() => undefined);
        } else {
          await dispatchEventNotifications({
            type: "support.ticket.autoclose",
            tenantId: ticket.tenantId,
            eventId: ev?.id ?? crypto.randomUUID(),
            userId: ticket.requesterUserId,
            payload: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              subject: ticket.subject,
              surface: ticket.surface,
              platformFrom: true,
            },
          }).catch(() => undefined);
        }
        await supportEngine.appendMessage({
          ticketId: ticket.id,
          authorKind: "system",
          authorUserId: null,
          messageKind: "card",
          skipNotify: true,
          body: "Still need help here?",
          cardPayload: { kind: "auto-close", ticketId: ticket.id },
        });
        stats.warned += 1;
      } else if (idleHours >= 7 * 24) {
        await supportFrom(admin, "support_tickets")
          .update({
            status: "resolved",
            waiting_on: null,
            resolved_at: new Date().toISOString(),
            metadata: { ...ticket.metadata, auto_resolved: true },
          })
          .eq("id", ticket.id)
          .eq("status", "open");
        await supportFrom(admin, "support_ticket_events").insert({
          ticket_id: ticket.id,
          tenant_id: ticket.tenantId,
          actor_kind: "system",
          event_type: "auto_closed",
          new_value: { auto_resolved: true },
        });
        stats.autoResolved += 1;
      }
    }

    const { data: staleEscalated } = await supportFrom(admin, "support_tickets")
      .select("*")
      .eq("status", "open")
      .eq("handled_by", "human")
      .not("escalated_at", "is", null)
      .is("first_human_response_at", null)
      .lt("escalated_at", hoursAgo(4));
    for (const raw of staleEscalated ?? []) {
      const ticket = mapTicketRow(raw);
      if (!ticket) continue;

      // How many times we have already chased this one. Without this the loop
      // re-alerted on EVERY hourly run — a fresh event row each time, so a fresh
      // dedupe key, so nothing suppressed it. Production sent 61 identical
      // emails for a single ticket. A channel that repeats hourly teaches the
      // recipient to ignore it, and takes the next real alert down with it.
      // `created_at` rides along because the cadence is spaced from the LAST
      // nudge, not from the escalation: a ticket that was already days old when
      // this rule started applying has passed every threshold at once, and
      // measuring from the escalation would fire the whole allowance in five
      // consecutive hours.
      const { data: priorReAlerts } = await supportFrom(admin, "support_ticket_events")
        .select("id, created_at")
        .eq("ticket_id", ticket.id)
        .eq("event_type", "escalated")
        .contains("new_value", { reAlert: true })
        .order("created_at", { ascending: false });
      const priorRows = (priorReAlerts ?? []) as Array<{ created_at: string | null }>;
      const priorReAlertCount = priorRows.length;
      const lastReAlertAt = priorRows[0]?.created_at ?? null;

      if (
        !ticket.escalatedAt ||
        !shouldReAlert({ escalatedAt: ticket.escalatedAt, priorReAlertCount, lastReAlertAt })
      ) {
        continue;
      }

      const { data: ev } = await supportFrom(admin, "support_ticket_events")
        .insert({
          ticket_id: ticket.id,
          tenant_id: ticket.tenantId,
          actor_kind: "system",
          event_type: "escalated",
          new_value: { reAlert: true },
        })
        .select("id")
        .single();
      await dispatchEventNotifications({
        type: "support.ticket.escalated",
        tenantId: null,
        eventId: ev?.id ?? crypto.randomUUID(),
        payload: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          tenantId: ticket.tenantId,
          requesterUserId: ticket.requesterUserId,
          contactPhone: ticket.contactPhone,
          reason: ticket.escalationReason ?? "user_requested",
          deepLink: `/platform/admin/support?ticket=${ticket.id}`,
          // Context the alert was missing. How long it has waited is the one
          // fact that decides whether you open it now or later, and the nudge
          // number tells you this is a repeat rather than something new.
          waitedLabel: waitedLabel(ticket.escalatedAt),
          reAlertNumber: priorReAlertCount + 1,
          reAlertOf: MAX_RE_ALERTS,
          isReAlert: true,
        },
      }).catch(() => undefined);
      stats.reAlerted += 1;
    }

    const { data: staleProposals } = await supportFrom(admin, "support_proposed_actions")
      .select("id, ticket_id, tenant_id")
      .eq("status", "proposed")
      .lt("expires_at", new Date().toISOString());
    for (const row of staleProposals ?? []) {
      const actionId = String(row.id);
      const { error } = await supportFrom(admin, "support_proposed_actions")
        .update({ status: "expired" })
        .eq("id", actionId)
        .eq("status", "proposed");
      if (error) continue;
      const ticketId = String(row.ticket_id);
      const { data: ev } = await supportFrom(admin, "support_ticket_events")
        .insert({
          ticket_id: ticketId,
          tenant_id: row.tenant_id,
          actor_kind: "system",
          event_type: "proposed_action_expired",
          new_value: { actionId },
        })
        .select("id")
        .single();
      const loaded = await loadTicketById(ticketId, admin);
      await dispatchEventNotifications({
        type: "support.proposed_action.expired",
        tenantId: typeof row.tenant_id === "string" ? row.tenant_id : null,
        eventId: ev?.id ?? crypto.randomUUID(),
        userId: loaded?.requesterUserId ?? null,
        payload: {
          ticketId,
          ticketNumber: loaded?.ticketNumber ?? 0,
          subject: loaded?.subject ?? "",
          surface: loaded?.surface ?? "workspace",
        },
      }).catch(() => undefined);
      stats.expiredFixes += 1;
    }

    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    logServerError("cron/support-lifecycle", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
