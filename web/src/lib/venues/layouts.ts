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

export type SpaceLayoutRow = {
  id: string;
  locationId: string;
  name: string;
  isActive: boolean;
  canvas: { w: number; h: number };
  version: number;
};

export type SpaceLayoutItemRow = {
  layoutId: string;
  spaceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  shape: string;
};

export type LayoutSpaceRow = {
  id: string;
  code: string | null;
  name: string;
  kind: string;
  partyMax: number;
};

export type ServicePeriodListRow = {
  id: string;
  locationId: string;
  name: string;
  weekdayMask: number;
  startsLocal: string;
  endsLocal: string;
  turnMinutes: number;
  version: number;
};

export type PrepStationRow = {
  id: string;
  locationId: string | null;
  code: string;
  name: string;
  kind: "kitchen" | "bar" | "pickup" | "pass";
  sortOrder: number;
};

export type LayoutsListResult =
  | { ok: true; layouts: SpaceLayoutRow[]; items: SpaceLayoutItemRow[]; spaces: LayoutSpaceRow[] }
  | { ok: false; reason: "unavailable" };

export type PeriodsListResult =
  | { ok: true; periods: ServicePeriodListRow[] }
  | { ok: false; reason: "unavailable" };

export type StationsListResult =
  | { ok: true; stations: PrepStationRow[] }
  | { ok: false; reason: "unavailable" };

function canvasOf(value: unknown): { w: number; h: number } {
  const rec = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const w = Number(rec.w);
  const h = Number(rec.h);
  return { w: Number.isFinite(w) && w > 0 ? w : 1000, h: Number.isFinite(h) && h > 0 ? h : 800 };
}

export async function layoutsList(admin: Pick<VenueAdmin, "from">, input: { tenantId: string }): Promise<LayoutsListResult> {
  try {
    const [layouts, spaces] = await Promise.all([
      admin
        .from("space_layouts")
        .select("id, location_id, name, is_active, canvas, version")
        .eq("tenant_id", input.tenantId)
        .order("name", { ascending: true }),
      admin
        .from("spaces")
        .select("id, code, name, kind, party_max")
        .eq("tenant_id", input.tenantId)
        .in("kind", ["table", "booth", "cabana", "seat"])
        .in("status", ["active", "out_of_service"])
        .order("sort_order", { ascending: true }),
    ]);
    if (layouts.error) {
      logServerError("venues.layoutsList.layouts", layouts.error);
      return { ok: false, reason: "unavailable" };
    }
    if (spaces.error) {
      logServerError("venues.layoutsList.spaces", spaces.error);
      return { ok: false, reason: "unavailable" };
    }
    const layoutIds = ((layouts.data ?? []) as { id: string }[]).map((row) => row.id);
    let itemRows: Record<string, unknown>[] = [];
    if (layoutIds.length > 0) {
      const items = await admin
        .from("space_layout_items")
        .select("layout_id, space_id, x, y, w, h, rotation, shape")
        .in("layout_id", layoutIds);
      if (items.error) {
        logServerError("venues.layoutsList.items", items.error);
        return { ok: false, reason: "unavailable" };
      }
      itemRows = (items.data ?? []) as Record<string, unknown>[];
    }
    return {
      ok: true,
      layouts: ((layouts.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        locationId: String(row.location_id),
        name: String(row.name),
        isActive: Boolean(row.is_active),
        canvas: canvasOf(row.canvas),
        version: Number(row.version ?? 1),
      })),
      items: itemRows.map((row) => ({
        layoutId: String(row.layout_id),
        spaceId: String(row.space_id),
        x: Number(row.x),
        y: Number(row.y),
        w: Number(row.w),
        h: Number(row.h),
        rotation: Number(row.rotation ?? 0),
        shape: String(row.shape ?? "rect"),
      })),
      spaces: ((spaces.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        code: row.code ? String(row.code) : null,
        name: String(row.name),
        kind: String(row.kind),
        partyMax: Number(row.party_max ?? 1),
      })),
    };
  } catch (error) {
    logServerError("venues.layoutsList", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function layoutUpsert(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    id?: string | null;
    locationId: string;
    name: string;
    canvas?: { w: number; h: number };
    items?: Array<{ spaceId: string; x: number; y: number; w: number; h: number; rotation?: number; shape?: string }>;
    expectedVersion?: number | null;
  },
): Promise<VenueWriteResult> {
  if (!input.name.trim()) return { ok: false, reason: "invalid" };
  return call(admin, "layout_upsert", {
    p_tenant_id: input.tenantId,
    p_id: input.id ?? null,
    p_location_id: input.locationId,
    p_name: input.name.trim(),
    p_canvas: input.canvas ?? { w: 1000, h: 800 },
    p_items: (input.items ?? []).map((item) => ({
      space_id: item.spaceId,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      rotation: item.rotation ?? 0,
      shape: item.shape ?? "rect",
    })),
    p_expected_version: input.expectedVersion ?? null,
  });
}

export async function servicePeriodsList(
  admin: Pick<VenueAdmin, "from">,
  input: { tenantId: string },
): Promise<PeriodsListResult> {
  try {
    const { data, error } = await admin
      .from("service_periods")
      .select("id, location_id, name, weekday_mask, starts_local, ends_local, turn_minutes, version")
      .eq("tenant_id", input.tenantId)
      .order("starts_local", { ascending: true });
    if (error) {
      logServerError("venues.servicePeriodsList", error);
      return { ok: false, reason: "unavailable" };
    }
    return {
      ok: true,
      periods: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        locationId: String(row.location_id),
        name: String(row.name),
        weekdayMask: Number(row.weekday_mask),
        startsLocal: String(row.starts_local).slice(0, 5),
        endsLocal: String(row.ends_local).slice(0, 5),
        turnMinutes: Number(row.turn_minutes),
        version: Number(row.version ?? 1),
      })),
    };
  } catch (error) {
    logServerError("venues.servicePeriodsList", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function prepStationsList(admin: Pick<VenueAdmin, "from">, input: { tenantId: string }): Promise<StationsListResult> {
  try {
    const { data, error } = await admin
      .from("prep_stations")
      .select("id, location_id, code, name, kind, sort_order")
      .eq("tenant_id", input.tenantId)
      .order("sort_order", { ascending: true });
    if (error) {
      logServerError("venues.prepStationsList", error);
      return { ok: false, reason: "unavailable" };
    }
    return {
      ok: true,
      stations: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        locationId: row.location_id ? String(row.location_id) : null,
        code: String(row.code),
        name: String(row.name),
        kind: row.kind as PrepStationRow["kind"],
        sortOrder: Number(row.sort_order ?? 0),
      })),
    };
  } catch (error) {
    logServerError("venues.prepStationsList", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function prepStationUpsert(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    id?: string | null;
    locationId?: string | null;
    code: string;
    name: string;
    kind: PrepStationRow["kind"];
    sortOrder?: number;
  },
): Promise<VenueWriteResult> {
  const code = input.code.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(code) || !input.name.trim()) return { ok: false, reason: "invalid" };
  return call(admin, "prep_station_upsert", {
    p_tenant_id: input.tenantId,
    p_id: input.id ?? null,
    p_location_id: input.locationId ?? null,
    p_code: code,
    p_name: input.name.trim(),
    p_kind: input.kind,
    p_sort_order: input.sortOrder ?? 0,
  });
}
