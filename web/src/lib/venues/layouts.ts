import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { VenueAdmin } from "./locations";

export type VenueWriteResult =
  | { ok: true; id: string; version?: number }
  | {
      ok: false;
      reason: "overlap" | "two_active" | "station_in_use" | "conflict" | "not_found" | "wrong_tenant" | "invalid" | "unavailable";
    };

const REASONS = new Set([
  "overlap",
  "two_active",
  "station_in_use",
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
]);

function mapReply(reply: { ok?: boolean; reason?: string; id?: string; version?: number }): VenueWriteResult {
  if (reply.ok === true && reply.id) return { ok: true, id: reply.id, version: reply.version };
  const reason = reply.reason;
  if (reason && REASONS.has(reason)) {
    return { ok: false, reason: reason as Exclude<VenueWriteResult, { ok: true }>["reason"] };
  }
  return { ok: false, reason: "unavailable" };
}

async function call(admin: VenueAdmin, fn: string, args: Record<string, unknown>): Promise<VenueWriteResult> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    logServerError(`venues.${fn}`, error);
    return { ok: false, reason: "unavailable" };
  }
  return mapReply((data ?? {}) as Parameters<typeof mapReply>[0]);
}

export async function layoutActivate(
  admin: VenueAdmin,
  input: { tenantId: string; layoutId: string; expectedVersion?: number | null },
): Promise<VenueWriteResult> {
  return call(admin, "layout_activate", {
    p_tenant_id: input.tenantId,
    p_layout_id: input.layoutId,
    p_expected_version: input.expectedVersion ?? null,
  });
}

export async function servicePeriodUpsert(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    id?: string | null;
    locationId: string;
    name: string;
    weekdayMask: number;
    startsLocal: string;
    endsLocal: string;
    turnMinutes: number;
    rules?: Record<string, unknown>;
    expectedVersion?: number | null;
  },
): Promise<VenueWriteResult> {
  if (input.weekdayMask < 1 || input.weekdayMask > 127) return { ok: false, reason: "invalid" };
  return call(admin, "service_period_upsert", {
    p_tenant_id: input.tenantId,
    p_id: input.id ?? null,
    p_location_id: input.locationId,
    p_name: input.name.trim(),
    p_weekday_mask: input.weekdayMask,
    p_starts_local: input.startsLocal,
    p_ends_local: input.endsLocal,
    p_turn_minutes: input.turnMinutes,
    p_rules: input.rules ?? {},
    p_expected_version: input.expectedVersion ?? null,
  });
}

export async function prepStationDelete(
  admin: VenueAdmin,
  input: { tenantId: string; id: string },
): Promise<VenueWriteResult> {
  return call(admin, "prep_station_delete", { p_tenant_id: input.tenantId, p_id: input.id });
}
