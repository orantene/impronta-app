"use server";

/**
 * The public event program — the server action a self-fetching
 * `event_program` island calls (the `ticket_picker` class of block, §7).
 *
 * THE TENANT COMES FROM THE HOST, never from the wire. `getPublicHostContext`
 * reads the tenant the proxy resolved from a verified `agency_domains` row;
 * a request on a host with no tenant (marketing, app, talent site) gets
 * `enabled: false`, and an event id from another tenant is refused by the
 * tenant predicate on the first read. Service role, like the ticket picker,
 * because guests hold no session.
 */

import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { getPublicHostContext } from "@/lib/saas/scope";
import { uuidWire } from "@/lib/events/uuid-wire";
import { loadPublicEventProgram, type PublicEventProgram } from "@/lib/events/schedule/public-loader";

export type { PublicEventProgram, PublicScheduleItem } from "@/lib/events/schedule/public-loader";

const OFF: PublicEventProgram = { enabled: false };

const inputSchema = z.object({
  eventId: uuidWire,
  locale: z.string().max(8).optional(),
});

export async function loadEventProgram(input: { eventId: string; locale?: string }): Promise<PublicEventProgram> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return OFF;
  try {
    const host = await getPublicHostContext();
    const tenantId = host.kind === "agency" || host.kind === "hub" ? host.tenantId : null;
    if (!tenantId || !uuidWire.safeParse(tenantId).success) return OFF;
    const admin = createServiceRoleClient();
    if (!admin) {
      logServerError("events.program.public/admin", "createServiceRoleClient returned null");
      return OFF;
    }
    const locale = (parsed.data.locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
    return await loadPublicEventProgram(admin, { tenantId, eventId: parsed.data.eventId, locale });
  } catch (err) {
    logServerError("events.program.public", err);
    return OFF;
  }
}
