import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { sendEmailResult } from "@/lib/email";
import { openVisit } from "@/lib/visits/commands";
import type { VenueAdmin } from "./locations";

export type PartyWaitlistResult =
  | {
      ok: true;
      id: string;
      version?: number;
      position?: number;
      visitId?: string | null;
      partySize?: number;
      channel?: "email" | "none";
      already?: boolean;
    }
  | {
      ok: false;
      reason:
        | "already_seated"
        | "space_occupied"
        | "expired"
        | "conflict"
        | "not_found"
        | "wrong_tenant"
        | "invalid"
        | "unavailable";
    };

const REASONS = new Set([
  "already_seated",
  "space_occupied",
  "expired",
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
]);

function mapReply(reply: {
  ok?: boolean;
  reason?: string;
  id?: string;
  version?: number;
  position?: number;
  visit_id?: string;
  party_size?: number;
  already?: boolean;
}): PartyWaitlistResult {
  if (reply.ok === true && reply.id) {
    return {
      ok: true,
      id: reply.id,
      version: reply.version,
      position: reply.position,
      visitId: reply.visit_id ?? null,
      partySize: reply.party_size,
      already: reply.already,
    };
  }
  const reason = reply.reason;
  if (reason && REASONS.has(reason)) {
    return { ok: false, reason: reason as Exclude<PartyWaitlistResult, { ok: true }>["reason"] };
  }
  return { ok: false, reason: "unavailable" };
}

async function call(admin: VenueAdmin, fn: string, args: Record<string, unknown>): Promise<PartyWaitlistResult> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    logServerError(`venues.${fn}`, error);
    return { ok: false, reason: "unavailable" };
  }
  return mapReply((data ?? {}) as Parameters<typeof mapReply>[0]);
}

export async function partyWaitlistJoin(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    locationId?: string | null;
    zoneId?: string | null;
    partySize: number;
    holderName: string;
    holderPhone?: string | null;
    holderEmail?: string | null;
    note?: string | null;
    quotedMinutes?: number | null;
  },
): Promise<PartyWaitlistResult> {
  if (input.partySize < 1 || !input.holderName.trim()) return { ok: false, reason: "invalid" };
  return call(admin, "party_waitlist_join", {
    p_tenant_id: input.tenantId,
    p_location_id: input.locationId ?? null,
    p_zone_id: input.zoneId ?? null,
    p_party_size: input.partySize,
    p_holder_name: input.holderName.trim(),
    p_holder_phone: input.holderPhone ?? null,
    p_holder_email: input.holderEmail ?? null,
    p_note: input.note ?? null,
    p_quoted_minutes: input.quotedMinutes ?? null,
  });
}

export async function partyWaitlistNotify(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    id: string;
    ttlSeconds?: number;
    expectedVersion?: number | null;
    holderEmail?: string | null;
    holderPhone?: string | null;
  },
): Promise<PartyWaitlistResult> {
  const claimed = await call(admin, "party_waitlist_notify", {
    p_tenant_id: input.tenantId,
    p_id: input.id,
    p_ttl_seconds: input.ttlSeconds ?? 300,
    p_expected_version: input.expectedVersion ?? null,
  });
  if (!claimed.ok) return claimed;

  let channel: "email" | "none" = "none";
  const email = input.holderEmail?.trim();
  if (email) {
    const sent = await sendEmailResult({
      to: email,
      subject: "Your table is ready",
      html: "<p>Your table is ready. Please come to the host stand.</p>",
    });
    if (sent.status === "sent") channel = "email";
  }
  // Phone / WhatsApp have no guest transactional sender. Never pretend.
  return { ...claimed, channel };
}

export async function partyWaitlistSeat(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    id: string;
    spaceId: string;
    actorUserId: string;
    operationKey: string;
    expectedVersion?: number | null;
  },
): Promise<PartyWaitlistResult> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  const claimed = await call(admin, "party_waitlist_seat", {
    p_tenant_id: input.tenantId,
    p_id: input.id,
    p_space_id: input.spaceId,
    p_operation_key: input.operationKey.trim(),
    p_expected_version: input.expectedVersion ?? null,
  });
  if (!claimed.ok) return claimed;
  if (claimed.already && claimed.visitId) return claimed;

  // D-172: the RPC answers with the size only; the party's name and contact
  // are on its row. They travel to the table as an admission (below), the
  // same row a seated reservation carries, or the floor reads the table as a
  // nameless walk-in.
  const party = await readParty(admin, input.tenantId, input.id);
  const partySize = party?.partySize ?? claimed.partySize;

  const opened = await openVisit(admin, {
    tenantId: input.tenantId,
    spaceId: input.spaceId,
    actorUserId: input.actorUserId,
    partySize,
  });
  if (!opened.ok) {
    await call(admin, "party_waitlist_unclaim", { p_tenant_id: input.tenantId, p_id: input.id });
    if (opened.reason === "already_open") return { ok: false, reason: "space_occupied" };
    return { ok: false, reason: opened.reason === "invalid" ? "invalid" : "unavailable" };
  }

  const attached = await call(admin, "party_waitlist_attach_visit", {
    p_tenant_id: input.tenantId,
    p_id: input.id,
    p_visit_id: opened.visit.id,
  });
  if (!attached.ok) return attached;

  // The seated party's record on the table: holder, size, space, seated now
  // (admitted in full, as `check_in` stamps a reservation that arrived), so
  // the Live Floor and the host stand read "<name> · <n>" on the table. No
  // order line and no allocation: a waiting party bought nothing. Written
  // AFTER the visit is attached: the table is correct even if this row is
  // not, and the visit is the fact the room runs on.
  if (party) {
    const now = new Date().toISOString();
    const { error: admissionError } = await admin.from("admissions").insert({
      tenant_id: input.tenantId,
      space_id: input.spaceId,
      holder_name: party.holderName,
      holder_email: party.holderEmail,
      party_size: partySize,
      admitted_count: partySize,
      starts_at: now,
      seated_at: now,
      status: "valid",
    });
    if (admissionError) logServerError("venues.partyWaitlistSeat.admission", admissionError);
  }
  return { ok: true, id: input.id, visitId: opened.visit.id, version: claimed.version, partySize };
}

async function readParty(
  admin: VenueAdmin,
  tenantId: string,
  id: string,
): Promise<{ holderName: string; holderEmail: string | null; holderPhone: string | null; partySize: number } | null> {
  const { data, error } = await admin
    .from("party_waitlist")
    .select("holder_name, holder_email, holder_phone, party_size")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("venues.partyWaitlistSeat.party", error);
    return null;
  }
  const row = data as { holder_name?: unknown; holder_email?: unknown; holder_phone?: unknown; party_size?: unknown } | null;
  if (!row) return null;
  const holderName = typeof row.holder_name === "string" ? row.holder_name.trim() : "";
  const size = Number(row.party_size);
  return {
    holderName: holderName || "Walk-in",
    holderEmail: typeof row.holder_email === "string" && row.holder_email.trim() ? row.holder_email.trim() : null,
    holderPhone: typeof row.holder_phone === "string" && row.holder_phone.trim() ? row.holder_phone.trim() : null,
    partySize: Number.isFinite(size) && size >= 1 ? Math.trunc(size) : 1,
  };
}

export async function partyWaitlistLeave(
  admin: VenueAdmin,
  input: { tenantId: string; id: string; expectedVersion?: number | null },
): Promise<PartyWaitlistResult> {
  return call(admin, "party_waitlist_leave", {
    p_tenant_id: input.tenantId,
    p_id: input.id,
    p_expected_version: input.expectedVersion ?? null,
  });
}

export type PartyWaitlistRow = {
  id: string;
  holderName: string;
  partySize: number;
  holderPhone: string | null;
  holderEmail: string | null;
  quotedMinutes: number | null;
  status: "waiting" | "notified";
  joinedAtIso: string;
  notifiedAtIso: string | null;
  notifyExpiresAtIso: string | null;
  position: number;
  version: number;
};

export async function partyWaitlistList(
  admin: Pick<VenueAdmin, "from">,
  input: { tenantId: string },
): Promise<{ ok: true; rows: PartyWaitlistRow[] } | { ok: false; reason: "unavailable" }> {
  try {
    const read = await admin
      .from("party_waitlist")
      .select(
        "id, holder_name, party_size, holder_phone, holder_email, quoted_minutes, status, joined_at, notified_at, notify_expires_at, position, version",
      )
      .eq("tenant_id", input.tenantId)
      .in("status", ["waiting", "notified"])
      .order("position", { ascending: true });
    if (read.error) {
      logServerError("venues.partyWaitlistList", read.error);
      return { ok: false, reason: "unavailable" };
    }
    return {
      ok: true,
      rows: ((read.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        holderName: String(row.holder_name ?? ""),
        partySize: Number(row.party_size ?? 1),
        holderPhone: row.holder_phone ? String(row.holder_phone) : null,
        holderEmail: row.holder_email ? String(row.holder_email) : null,
        quotedMinutes: row.quoted_minutes == null ? null : Number(row.quoted_minutes),
        status: row.status === "notified" ? "notified" : "waiting",
        joinedAtIso: String(row.joined_at ?? ""),
        notifiedAtIso: row.notified_at ? String(row.notified_at) : null,
        notifyExpiresAtIso: row.notify_expires_at ? String(row.notify_expires_at) : null,
        position: Number(row.position ?? 0),
        version: Number(row.version ?? 1),
      })),
    };
  } catch (error) {
    logServerError("venues.partyWaitlistList", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function reapPartyWaitlist(admin: VenueAdmin): Promise<{ ok: true; expired: number } | { ok: false }> {
  if (typeof admin.rpc !== "function") return { ok: false };
  const { data, error } = await admin.rpc("party_waitlist_reap", {});
  if (error) {
    logServerError("venues.party_waitlist_reap", error);
    return { ok: false };
  }
  const expired = Number((data as { expired?: number } | null)?.expired ?? 0);
  return { ok: true, expired };
}
