import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { VenueAdmin } from "./locations";

export type DeviceReason =
  | "unknown_device"
  | "not_replayable"
  | "stale_app"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "invalid"
  | "unavailable";

const REASONS = new Set<DeviceReason>([
  "unknown_device",
  "not_replayable",
  "stale_app",
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
]);

function mapReason(reason: string | undefined): DeviceReason {
  if (reason && REASONS.has(reason as DeviceReason)) return reason as DeviceReason;
  return "unavailable";
}

async function call(
  admin: VenueAdmin,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; reason: DeviceReason }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    logServerError(`venues.${fn}`, error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as Record<string, unknown>;
  if (reply.ok === true) return { ok: true, payload: reply };
  return { ok: false, reason: mapReason(typeof reply.reason === "string" ? reply.reason : undefined) };
}

export type PosDeviceRow = {
  id: string;
  name: string;
  kind: string;
  lastSeenAt: string | null;
  status: string;
};

export async function posDevicesList(
  admin: Pick<VenueAdmin, "from">,
  input: { tenantId: string },
): Promise<{ ok: true; devices: PosDeviceRow[] } | { ok: false; reason: "unavailable" }> {
  try {
    const { data, error } = await admin
      .from("pos_devices")
      .select("id, name, kind, last_seen_at, status")
      .eq("tenant_id", input.tenantId)
      .order("name", { ascending: true });
    if (error) {
      logServerError("venues.posDevicesList", error);
      return { ok: false, reason: "unavailable" };
    }
    return {
      ok: true,
      devices: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        kind: String(row.kind),
        lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
        status: String(row.status ?? "active"),
      })),
    };
  } catch (error) {
    logServerError("venues.posDevicesList", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function posDeviceRegister(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    deviceKey: string;
    name: string;
    kind: "tablet" | "phone" | "display" | "printer" | "reader";
    locationId?: string | null;
    registeredBy: string;
  },
) {
  if (input.deviceKey.trim().length < 8 || input.name.trim().length < 1) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const r = await call(admin, "pos_device_register", {
    p_tenant_id: input.tenantId,
    p_device_key: input.deviceKey.trim(),
    p_name: input.name.trim(),
    p_kind: input.kind,
    p_location_id: input.locationId ?? null,
    p_registered_by: input.registeredBy,
  });
  if (!r.ok) return r;
  return { ok: true as const, id: String(r.payload.id ?? ""), version: Number(r.payload.version) || 1 };
}

export async function posDeviceHeartbeat(
  admin: VenueAdmin,
  input: { tenantId: string; deviceKey: string; appVersion?: string | null },
) {
  if (input.deviceKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "pos_device_heartbeat", {
    p_tenant_id: input.tenantId,
    p_device_key: input.deviceKey.trim(),
    p_app_version: input.appVersion ?? null,
  });
  if (!r.ok) return r;
  return { ok: true as const, id: String(r.payload.id ?? "") };
}

export async function posDeviceUpdate(
  admin: VenueAdmin,
  input: { tenantId: string; id: string; settings: Record<string, unknown>; expectedVersion?: number },
) {
  const r = await call(admin, "pos_device_update", {
    p_tenant_id: input.tenantId,
    p_id: input.id,
    p_settings: input.settings,
    p_expected_version: input.expectedVersion ?? null,
  });
  if (!r.ok) return r;
  return { ok: true as const, id: String(r.payload.id ?? input.id), version: Number(r.payload.version) || undefined };
}

export async function posOutboxApply(
  admin: VenueAdmin,
  input: { tenantId: string; deviceId: string; operationKey: string; command: Record<string, unknown> },
) {
  if (input.operationKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "pos_outbox_apply", {
    p_tenant_id: input.tenantId,
    p_device_id: input.deviceId,
    p_operation_key: input.operationKey.trim(),
    p_command: input.command,
  });
  if (!r.ok) return r;
  return { ok: true as const, id: String(r.payload.id ?? ""), already: r.payload.already === true };
}
