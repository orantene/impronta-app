/**
 * store.ts — reading and writing a venue's service windows and rules.
 *
 * All reservation persistence lives here, never in a "use server" file: the
 * tenant-scoping ratchet rejects a raw `.from()` there, and it is right to —
 * one module owning these tables means no caller can reach them another way.
 * Same rule Spaces & Seating follow for `lib/spaces/`.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not read availability. Remaining units come from
 * `capacity_remaining_public`, called directly — it already returns the
 * tightest answer across the whole ancestor chain, so a table inside a
 * bought-out room reports zero without the caller knowing a tree exists.
 * Routing that through Spaces would make them a wrapper, and re-deriving the
 * ancestor rule here would be a second implementation of someone else's
 * invariant, free to drift from it.
 *
 * It also does not create a venue, a space or a group. Those are the Spaces &
 * Seating Manager's, and a `space_groups` row in `sell_mode='band'` is read
 * here only to learn which party sizes a venue can seat.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { parseServiceRules } from "./rules";
import { intOrNull, minutesToTime, rowToException, rowToWindow } from "./rows";
import type { PartyBand } from "./availability";
import type { ServiceRules, ServiceWindow, ServiceWindowException } from "./types";

export type VenueServiceConfig = {
  rules: ServiceRules;
  windows: ServiceWindow[];
  exceptions: ServiceWindowException[];
  bands: PartyBand[];
};

/**
 * Everything the book and the public page need for one venue.
 *
 * A venue with no rules row is not an error: it is a venue that has not turned
 * reservations on, and `parseServiceRules({})` says exactly that with
 * `isActive: false`. The caller shows the setup prompt, not an error page.
 */
export async function loadVenueServiceConfig(
  tenantId: string,
  venueId: string,
  opts: { fromDate?: string; toDate?: string } = {},
): Promise<VenueServiceConfig | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  try {
    const [rulesRes, windowsRes, groupsRes] = await Promise.all([
      sb
        .from("venue_service_rules")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .maybeSingle(),
      sb
        .from("venue_service_windows")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .order("sort_order", { ascending: true }),
      sb
        .from("space_groups")
        .select("id, name, party_min, party_max, kind, sell_mode")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .eq("kind", "party_band")
        .eq("sell_mode", "band"),
    ]);

    if (rulesRes.error) {
      logServerError("reservations.store.loadRules", rulesRes.error);
      return null;
    }
    if (windowsRes.error) {
      logServerError("reservations.store.loadWindows", windowsRes.error);
      return null;
    }
    if (groupsRes.error) {
      logServerError("reservations.store.loadGroups", groupsRes.error);
      return null;
    }

    let exceptions: ServiceWindowException[] = [];
    if (opts.fromDate && opts.toDate) {
      const exRes = await sb
        .from("venue_service_window_exceptions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .gte("on_date", opts.fromDate)
        .lte("on_date", opts.toDate);
      if (exRes.error) {
        // An exception we cannot read is a closure we might miss, so this fails
        // the whole load rather than quietly returning a venue that looks open
        // on a day it is shut.
        logServerError("reservations.store.loadExceptions", exRes.error);
        return null;
      }
      exceptions = (exRes.data ?? [])
        .map(rowToException)
        .filter((e): e is ServiceWindowException => e !== null);
    }

    const bands: PartyBand[] = [];
    for (const g of groupsRes.data ?? []) {
      const poolId = await poolIdForGroup(sb, tenantId, g.id as string);
      // A band with no pool cannot be sold against. Skipping it is correct and
      // visible in the editor; inventing a pool id would offer a table that no
      // reserve could ever claim.
      if (poolId === null) continue;
      bands.push({
        groupId: g.id as string,
        poolId,
        name: (g.name as string) ?? "",
        partyMin: intOrNull(g.party_min) ?? 1,
        partyMax: intOrNull(g.party_max) ?? 1,
      });
    }

    return {
      rules: parseServiceRules(rulesRes.data, venueId),
      windows: (windowsRes.data ?? [])
        .map(rowToWindow)
        .filter((w): w is ServiceWindow => w !== null),
      exceptions,
      bands,
    };
  } catch (err) {
    logServerError("reservations.store.loadVenueServiceConfig", err);
    return null;
  }
}

/** The capacity pool bound to a band group, or null when it has none. */
async function poolIdForGroup(
  sb: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  groupId: string,
): Promise<string | null> {
  if (!sb) return null;
  const { data, error } = await sb
    .from("capacity_pools")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "space_group")
    .eq("subject_id", groupId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    logServerError("reservations.store.poolIdForGroup", error);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

// ─── writes ──────────────────────────────────────────────────────────────────
// Every write takes `tenantId` from the caller's resolved scope, never from
// client input, and every statement carries it — so a workspace can only ever
// change its own venue's rules even if a venue id is guessed.

/** The fields the settings form may set. Absent means "leave it alone". */
export type ServiceRulesPatch = Partial<{
  isActive: boolean;
  partySizeMin: number;
  partySizeMax: number;
  horizonDays: number;
  minNoticeMinutes: number;
  turnTimeBands: Array<{ minParty: number; maxParty: number; turnMinutes: number }>;
  defaultTurnMinutes: number;
  allowPublicUpsize: boolean;
  cardOnFileFromParty: number | null;
  noShowFeeCents: number;
  noShowFeeBasis: "per_person" | "per_party";
  noShowGraceMinutes: number;
  depositFromParty: number | null;
  depositCentsPerPerson: number;
  freeCancelHours: number;
  waitlistEnabled: boolean;
  walkinsEnabled: boolean;
  notesEnabled: boolean;
}>;

const RULES_COLUMN: Record<keyof ServiceRulesPatch, string> = {
  isActive: "is_active",
  partySizeMin: "party_size_min",
  partySizeMax: "party_size_max",
  horizonDays: "horizon_days",
  minNoticeMinutes: "min_notice_minutes",
  turnTimeBands: "turn_time_bands",
  defaultTurnMinutes: "default_turn_minutes",
  allowPublicUpsize: "allow_public_upsize",
  cardOnFileFromParty: "card_on_file_from_party",
  noShowFeeCents: "no_show_fee_cents",
  noShowFeeBasis: "no_show_fee_basis",
  noShowGraceMinutes: "no_show_grace_minutes",
  depositFromParty: "deposit_from_party",
  depositCentsPerPerson: "deposit_cents_per_person",
  freeCancelHours: "free_cancel_hours",
  waitlistEnabled: "waitlist_enabled",
  walkinsEnabled: "walkins_enabled",
  notesEnabled: "notes_enabled",
};

/**
 * Upsert a venue's rules.
 *
 * `undefined` in the patch means "not sent, leave it"; an explicit `null` on a
 * threshold means "never ask" and IS written. Collapsing the two would make it
 * impossible to turn a card-on-file requirement back off.
 */
export async function saveVenueServiceRules(
  tenantId: string,
  venueId: string,
  patch: ServiceRulesPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const row: Record<string, unknown> = { tenant_id: tenantId, venue_id: venueId };
  for (const [key, column] of Object.entries(RULES_COLUMN)) {
    const value = patch[key as keyof ServiceRulesPatch];
    if (value !== undefined) row[column] = value;
  }
  row.updated_at = new Date().toISOString();

  const { error } = await sb
    .from("venue_service_rules")
    .upsert(row, { onConflict: "venue_id" });
  if (error) {
    logServerError("reservations.store.saveVenueServiceRules", error);
    return { ok: false, error: "Could not save the reservation rules." };
  }
  return { ok: true };
}

export type ServiceWindowInput = {
  id?: string;
  key: string;
  label: Record<string, string>;
  localTimeMin: number;
  durationMinutes: number;
  weekdays: number[];
  lastSeatingOffsetMin: number | null;
  seatingStepMinutes: number;
  turnMinutesOverride: number | null;
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
  sortOrder: number;
};

/** Create or update one window. The key is unique per venue. */
export async function saveServiceWindow(
  tenantId: string,
  venueId: string,
  input: ServiceWindowInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    venue_id: venueId,
    key: input.key,
    label: input.label,
    local_time: minutesToTime(input.localTimeMin),
    duration_minutes: input.durationMinutes,
    weekdays: input.weekdays,
    last_seating_offset_min: input.lastSeatingOffsetMin,
    seating_step_minutes: input.seatingStepMinutes,
    turn_minutes_override: input.turnMinutesOverride,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    is_active: input.isActive,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
  if (input.id) row.id = input.id;

  const { data, error } = await sb
    .from("venue_service_windows")
    .upsert(row, { onConflict: "venue_id,key" })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    logServerError("reservations.store.saveServiceWindow", error);
    return { ok: false, error: "Could not save the service window." };
  }
  return { ok: true, id: data.id as string };
}

/**
 * Deactivate a window. NEVER a delete.
 *
 * The same rule Spaces hold for a drained pool: the row is the record of what
 * was offered while it was live, and a reservation taken inside it still points
 * at that time. A dispute is settled with the row.
 */
export async function deactivateServiceWindow(
  tenantId: string,
  venueId: string,
  windowId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };
  const { error } = await sb
    .from("venue_service_windows")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("venue_id", venueId)
    .eq("id", windowId);
  if (error) {
    logServerError("reservations.store.deactivateServiceWindow", error);
    return { ok: false, error: "Could not close the service window." };
  }
  return { ok: true };
}
