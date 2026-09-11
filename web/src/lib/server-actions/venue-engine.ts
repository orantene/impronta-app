"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import {
  locationSetDefault as setDefaultLocation,
  locationUpsert as upsertLocation,
  locationsList as listLocations,
  zoneDelete as deleteZone,
  zoneUpsert as upsertZone,
} from "@/lib/venues/locations";
import {
  partyWaitlistJoin as joinPartyWaitlist,
  partyWaitlistLeave as leavePartyWaitlist,
  partyWaitlistNotify as notifyPartyWaitlist,
  partyWaitlistSeat as seatPartyWaitlist,
} from "@/lib/venues/party-waitlist";

const uuid = z.string().uuid();
const slug = z.string().trim().min(1).max(63);
const zoneKind = z.enum(["floor", "bar", "terrace", "room", "counter"]);

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "unavailable" as const };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

export async function locationsList() {
  const g = await staff();
  if (!g.ok) return g;
  return listLocations(g.admin, { tenantId: g.tenantId });
}

export async function locationUpsert(input: {
  id?: string;
  slug: string;
  name: string;
  venueId?: string | null;
  timezone: string;
  address?: Record<string, unknown>;
  isDefault?: boolean;
  sortOrder?: number;
  status?: "active" | "closed";
  expectedVersion?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      id: uuid.optional(),
      slug,
      name: z.string().trim().min(1).max(120),
      venueId: uuid.nullable().optional(),
      timezone: z.string().trim().min(1).max(64),
      address: z.record(z.string(), z.unknown()).optional(),
      isDefault: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      status: z.enum(["active", "closed"]).optional(),
      expectedVersion: z.number().int().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return upsertLocation(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function locationSetDefault(input: { id: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ id: uuid, expectedVersion: z.number().int().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return setDefaultLocation(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function zoneUpsert(input: {
  id?: string;
  locationId: string;
  name: string;
  kind: "floor" | "bar" | "terrace" | "room" | "counter";
  surchargeBps?: number;
  sortOrder?: number;
  expectedVersion?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      id: uuid.optional(),
      locationId: uuid,
      name: z.string().trim().min(1).max(80),
      kind: zoneKind,
      surchargeBps: z.number().int().min(0).max(10000).optional(),
      sortOrder: z.number().int().optional(),
      expectedVersion: z.number().int().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return upsertZone(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function zoneDelete(input: { id: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ id: uuid, expectedVersion: z.number().int().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return deleteZone(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function partyWaitlistJoin(input: {
  locationId?: string | null;
  zoneId?: string | null;
  partySize: number;
  holderName: string;
  holderPhone?: string | null;
  holderEmail?: string | null;
  note?: string | null;
  quotedMinutes?: number | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      locationId: uuid.nullable().optional(),
      zoneId: uuid.nullable().optional(),
      partySize: z.number().int().min(1).max(200),
      holderName: z.string().trim().min(1).max(120),
      holderPhone: z.string().trim().max(40).nullable().optional(),
      holderEmail: z.string().email().nullable().optional(),
      note: z.string().trim().max(400).nullable().optional(),
      quotedMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return joinPartyWaitlist(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function partyWaitlistNotify(input: {
  id: string;
  ttlSeconds?: number;
  expectedVersion?: number;
  holderEmail?: string | null;
  holderPhone?: string | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      id: uuid,
      ttlSeconds: z.number().int().min(30).max(3600).optional(),
      expectedVersion: z.number().int().optional(),
      holderEmail: z.string().email().nullable().optional(),
      holderPhone: z.string().trim().max(40).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return notifyPartyWaitlist(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function partyWaitlistSeat(input: {
  id: string;
  spaceId: string;
  operationKey: string;
  expectedVersion?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      id: uuid,
      spaceId: uuid,
      operationKey: z.string().trim().min(8).max(80),
      expectedVersion: z.number().int().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return seatPartyWaitlist(g.admin, { tenantId: g.tenantId, actorUserId: g.userId, ...parsed.data });
}

export async function partyWaitlistLeave(input: { id: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ id: uuid, expectedVersion: z.number().int().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return leavePartyWaitlist(g.admin, { tenantId: g.tenantId, ...parsed.data });
}
