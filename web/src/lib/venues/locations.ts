import "server-only";

import { logServerError } from "@/lib/server/safe-error";

export type VenueAdmin = {
  // Tests inject a fake PostgREST builder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

export type VenueLocationRow = {
  id: string;
  slug: string;
  name: string;
  venueId: string | null;
  timezone: string;
  address: Record<string, unknown>;
  isDefault: boolean;
  sortOrder: number;
  status: "active" | "closed";
  version: number;
};

export type VenueZoneRow = {
  id: string;
  locationId: string;
  name: string;
  kind: "floor" | "bar" | "terrace" | "room" | "counter";
  surchargeBps: number;
  sortOrder: number;
  version: number;
};

export type LocationWriteResult =
  | { ok: true; id: string; slug?: string; version: number; isDefault?: boolean }
  | {
      ok: false;
      reason:
        | "duplicate_slug"
        | "last_location"
        | "has_spaces"
        | "conflict"
        | "not_found"
        | "wrong_tenant"
        | "invalid"
        | "unavailable";
    };

const WRITE_REASONS = new Set([
  "duplicate_slug",
  "last_location",
  "has_spaces",
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
]);

function mapWrite(reply: {
  ok?: boolean;
  reason?: string;
  id?: string;
  slug?: string;
  version?: number;
  is_default?: boolean;
}): LocationWriteResult {
  if (reply.ok === true && reply.id) {
    return {
      ok: true,
      id: reply.id,
      slug: reply.slug,
      version: typeof reply.version === "number" ? reply.version : 1,
      isDefault: reply.is_default,
    };
  }
  const reason = reply.reason;
  if (reason && WRITE_REASONS.has(reason)) {
    return { ok: false, reason: reason as Exclude<LocationWriteResult, { ok: true }>["reason"] };
  }
  return { ok: false, reason: "unavailable" };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function locationsList(
  admin: VenueAdmin,
  input: { tenantId: string },
): Promise<{ ok: true; locations: VenueLocationRow[]; zones: VenueZoneRow[] } | { ok: false; reason: "unavailable" }> {
  try {
    const [locs, zones] = await Promise.all([
      admin
        .from("venue_locations")
        .select("id, slug, name, venue_id, timezone, address, is_default, sort_order, status, version")
        .eq("tenant_id", input.tenantId)
        .order("sort_order", { ascending: true }),
      admin
        .from("venue_location_zones")
        .select("id, location_id, name, kind, surcharge_bps, sort_order, version")
        .eq("tenant_id", input.tenantId)
        .order("sort_order", { ascending: true }),
    ]);
    if (locs.error) {
      logServerError("venues.locationsList.locations", locs.error);
      return { ok: false, reason: "unavailable" };
    }
    if (zones.error) {
      logServerError("venues.locationsList.zones", zones.error);
      return { ok: false, reason: "unavailable" };
    }
    return {
      ok: true,
      locations: ((locs.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        venueId: row.venue_id ? String(row.venue_id) : null,
        timezone: String(row.timezone),
        address: asRecord(row.address),
        isDefault: Boolean(row.is_default),
        sortOrder: Number(row.sort_order ?? 0),
        status: row.status === "closed" ? "closed" : "active",
        version: Number(row.version ?? 1),
      })),
      zones: ((zones.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        locationId: String(row.location_id),
        name: String(row.name),
        kind: row.kind as VenueZoneRow["kind"],
        surchargeBps: Number(row.surcharge_bps ?? 0),
        sortOrder: Number(row.sort_order ?? 0),
        version: Number(row.version ?? 1),
      })),
    };
  } catch (error) {
    logServerError("venues.locationsList", error);
    return { ok: false, reason: "unavailable" };
  }
}

async function callWrite(
  admin: VenueAdmin,
  fn: string,
  args: Record<string, unknown>,
): Promise<LocationWriteResult> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    logServerError(`venues.${fn}`, error);
    return { ok: false, reason: "unavailable" };
  }
  return mapWrite((data ?? {}) as Parameters<typeof mapWrite>[0]);
}

export async function locationUpsert(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    id?: string | null;
    slug: string;
    name: string;
    venueId?: string | null;
    timezone: string;
    address?: Record<string, unknown>;
    isDefault?: boolean;
    sortOrder?: number;
    status?: "active" | "closed";
    expectedVersion?: number | null;
  },
): Promise<LocationWriteResult> {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(slug)) return { ok: false, reason: "invalid" };
  if (!input.name.trim() || !input.timezone.trim()) return { ok: false, reason: "invalid" };
  return callWrite(admin, "venue_location_upsert", {
    p_tenant_id: input.tenantId,
    p_id: input.id ?? null,
    p_slug: slug,
    p_name: input.name.trim(),
    p_venue_id: input.venueId ?? null,
    p_timezone: input.timezone.trim(),
    p_address: input.address ?? {},
    p_is_default: input.isDefault ?? false,
    p_sort_order: input.sortOrder ?? 0,
    p_status: input.status ?? "active",
    p_expected_version: input.expectedVersion ?? null,
  });
}

export async function locationSetDefault(
  admin: VenueAdmin,
  input: { tenantId: string; id: string; expectedVersion?: number | null },
): Promise<LocationWriteResult> {
  return callWrite(admin, "venue_location_set_default", {
    p_tenant_id: input.tenantId,
    p_id: input.id,
    p_expected_version: input.expectedVersion ?? null,
  });
}

export async function zoneUpsert(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    id?: string | null;
    locationId: string;
    name: string;
    kind: VenueZoneRow["kind"];
    surchargeBps?: number;
    sortOrder?: number;
    expectedVersion?: number | null;
  },
): Promise<LocationWriteResult> {
  if (!input.name.trim()) return { ok: false, reason: "invalid" };
  return callWrite(admin, "venue_location_zone_upsert", {
    p_tenant_id: input.tenantId,
    p_id: input.id ?? null,
    p_location_id: input.locationId,
    p_name: input.name.trim(),
    p_kind: input.kind,
    p_surcharge_bps: input.surchargeBps ?? 0,
    p_sort_order: input.sortOrder ?? 0,
    p_expected_version: input.expectedVersion ?? null,
  });
}

export async function zoneDelete(
  admin: VenueAdmin,
  input: { tenantId: string; id: string; expectedVersion?: number | null },
): Promise<LocationWriteResult> {
  return callWrite(admin, "venue_location_zone_delete", {
    p_tenant_id: input.tenantId,
    p_id: input.id,
    p_expected_version: input.expectedVersion ?? null,
  });
}
