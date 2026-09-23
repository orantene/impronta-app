import "server-only";

/**
 * items-catalog.ts — everything sellable in one list, for the Messages v5
 * items picker (L5, board D05). A READER over rows other surfaces write;
 * every source is one the POS or the workspace already reads:
 *
 *   talent   agency_talent_roster + talent_profiles, the same join the New
 *            inquiry sheet's picker runs (`lib/inquiry/new-inquiry-intake-data.ts`);
 *            availability for the thread's date is `loadBusyIntervals`
 *            (`lib/scheduling/load-busy.ts`), the reader the public slots
 *            route and S3's confirm trust.
 *   package  talent_offerings kind package | service | product, the counter's
 *   service  own catalog filter (`admin/pos/counter-catalog.ts`); a counted
 *   menu     stock at zero is "sold out", the counter's own rule.
 *   class    sessions with an offering and no event; seats through
 *            `readSessionSeats` (`lib/scheduling/waitlist-desk.ts`), the one
 *            reader Waitlist and Classes already share.
 *   ticket   sessions with an event; tiers are the event offering's
 *            `talent_offering_variants` (`lib/events/tiers.ts`), seats per
 *            tier pool through the same `readSessionSeats`.
 *   table    the reservation block's own times for the thread's date
 *            (`loadReserveAvailability`), listed so staff see them; no writer
 *            or card kind exists for a table choice (seam, D-MSG-122).
 *
 * Nothing here writes. The thread's date is `inquiries.event_date`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadReserveAvailability } from "@/app/(public)/_reserve/reserve-actions";
import type { CatalogOption, CatalogRow, ItemAvailability, TicketTier } from "@/lib/messages-v5/items-picker";
import { isTalentOwnedConversation, readInquiryTalentContext, talentOfferingCatalogRow } from "@/lib/messages-v5/talent-catalog";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { loadOfferingChildren } from "@/lib/talent/offerings-children";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { loadBusyIntervals } from "@/lib/scheduling/load-busy";
import { clampPublicSlotDays, computePublicSlots, parsePublicSlotFrom, type NoSlotsReason } from "@/lib/scheduling/public-slots";
import { addUtcDays, utcToZonedYmd, zonedLocalToUtc } from "@/lib/scheduling/tz";
import { readSessionSeats, type WaitlistSeats } from "@/lib/scheduling/waitlist-desk";
import { logServerError } from "@/lib/server/safe-error";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import { resolveIndustryPreset } from "@/lib/words/presets";

type Admin = SupabaseClient;

export type ItemsCatalog = {
  readonly rows: CatalogRow[];
  /** The thread's date (`inquiries.event_date`, YYYY-MM-DD) or null. */
  readonly date: string | null;
  readonly timezone: string;
  /** Raw `agencies.settings.industry_preset` for `categoryOrderForPreset`. */
  readonly preset: string | null;
};

const TALENT_CAP = 40;
const SESSION_CAP = 30;
const DEFAULT_PARTY = 2;

function seatsAvailability(seats: WaitlistSeats): { availability: ItemAvailability; left: number | null } {
  if (seats.kind === "counted") return { availability: seats.remaining <= 0 ? { kind: "busy", reason: "full" } : { kind: "free" }, left: seats.remaining };
  return { availability: { kind: "unknown" }, left: null };
}

function dayWindow(date: string, timezone: string): { from: Date; to: Date } | null {
  const from = zonedLocalToUtc(date, 0, timezone);
  const next = addUtcDays(date, 1);
  const to = next ? zonedLocalToUtc(next, 0, timezone) : null;
  if (!from || !to) return null;
  return { from, to };
}

export async function loadItemsCatalog(admin: Admin, input: { tenantId: string; inquiryId: string; now?: Date }): Promise<ItemsCatalog> {
  const now = input.now ?? new Date();
  const [inqRes, tenantRes, tz] = await Promise.all([
    admin.from("inquiries").select("event_date, event_timezone, source_context").eq("id", input.inquiryId).eq("tenant_id", input.tenantId).maybeSingle(),
    admin.from("agencies").select("settings").eq("id", input.tenantId).maybeSingle(),
    resolveTenantTimezone(input.tenantId),
  ]);
  if (inqRes.error) logServerError("messagesV5.itemsCatalog/inquiry", inqRes.error);
  if (tenantRes.error) logServerError("messagesV5.itemsCatalog/tenant", tenantRes.error);
  const inq = (inqRes.data ?? null) as { event_date?: string | null; event_timezone?: string | null; source_context?: unknown } | null;
  const settings = ((tenantRes.data as { settings?: unknown } | null)?.settings ?? null) as { industry_preset?: unknown } | null;
  const presetRaw = typeof settings?.industry_preset === "string" ? settings.industry_preset : null;
  const preset = resolveIndustryPreset(presetRaw);
  const timezone = (typeof inq?.event_timezone === "string" && inq.event_timezone) || tz.timezone;
  const date = typeof inq?.event_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(inq.event_date) ? inq.event_date.slice(0, 10) : null;
  const window = date ? dayWindow(date, timezone) : null;

  const context = readInquiryTalentContext(inq?.source_context);
  const hub = await getPlatformHubTenant();
  const talentOwned = isTalentOwnedConversation({
    hostKind: context.hostKind,
    tenantId: input.tenantId,
    hubTenantId: hub?.tenantId ?? null,
  });
  const talentProfileId = talentOwned && context.talentIds.length === 1 ? context.talentIds[0] : null;

  const [talent, offerings, sessions, tables] = await Promise.all([
    loadTalentRows(admin, input.tenantId, window, now),
    talentProfileId ? loadTalentProfileOfferingRows(admin, input.tenantId, talentProfileId) : loadOfferingRows(admin, input.tenantId),
    loadSessionRows(admin, input.tenantId, now),
    date && preset.features.reservations ? loadTableRows(input.tenantId, date) : Promise.resolve([] as CatalogRow[]),
  ]);

  return { rows: [...talent, ...offerings, ...sessions, ...tables], date, timezone, preset: presetRaw };
}

async function loadTalentRows(admin: Admin, tenantId: string, window: { from: Date; to: Date } | null, now: Date): Promise<CatalogRow[]> {
  const { data, error } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id, talent_profiles!talent_profile_id ( id, profile_code, display_name )")
    .eq("tenant_id", tenantId)
    .neq("status", "removed")
    .order("created_at", { ascending: true })
    .limit(TALENT_CAP);
  if (error) {
    logServerError("messagesV5.itemsCatalog/roster", error);
    return [];
  }
  type Raw = { talent_profile_id: string; talent_profiles: { id: string; profile_code: string | null; display_name: string | null } | { id: string; profile_code: string | null; display_name: string | null }[] | null };
  const people: { id: string; name: string }[] = [];
  for (const raw of (data ?? []) as unknown as Raw[]) {
    const profile = Array.isArray(raw.talent_profiles) ? raw.talent_profiles[0] : raw.talent_profiles;
    if (!profile) continue;
    people.push({ id: profile.id, name: profile.display_name?.trim() || profile.profile_code || "Talent" });
  }
  const busyById = new Map<string, boolean>();
  if (window) {
    await Promise.all(
      people.map(async (p) => {
        try {
          const busy = await loadBusyIntervals({ admin, talentProfileId: p.id, from: window.from, to: window.to, now });
          busyById.set(p.id, busy.length > 0);
        } catch (err) {
          // Fail closed the way the slots route does: an unreadable calendar is not "free".
          logServerError("messagesV5.itemsCatalog/busy", err);
          busyById.set(p.id, true);
        }
      }),
    );
  }
  return people.map((p) => ({
    id: `talent:${p.id}`,
    category: "talent",
    title: p.name,
    sub: null,
    amountCents: null,
    availability: !window ? { kind: "unknown" } : busyById.get(p.id) ? { kind: "busy", reason: "booked" } : { kind: "free" },
    talentProfileId: p.id,
  }));
}

async function loadOfferingRows(admin: Admin, tenantId: string): Promise<CatalogRow[]> {
  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, kind, inventory_qty, capacity_pool_id, duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .in("kind", ["package", "service", "product"])
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("messagesV5.itemsCatalog/offerings", error);
    return [];
  }
  type Row = { id: string; title: string | null; amount_cents: number | null; kind: string; inventory_qty: number | null; capacity_pool_id: string | null; duration_minutes: number | null };
  return ((data ?? []) as Row[]).map((row) => {
    const counted = !!row.capacity_pool_id && typeof row.inventory_qty === "number" && Number.isFinite(row.inventory_qty);
    const soldOut = counted && Math.round(row.inventory_qty as number) <= 0;
    const category = row.kind === "package" ? "package" : row.kind === "service" ? "service" : "menu";
    return {
      id: `${category}:${row.id}`,
      category,
      title: row.title?.trim() || "Item",
      sub: row.duration_minutes && row.duration_minutes > 0 ? `${row.duration_minutes} min` : null,
      amountCents: typeof row.amount_cents === "number" ? row.amount_cents : null,
      availability: soldOut ? { kind: "busy", reason: "sold_out" } : { kind: "free" },
      offeringId: row.id,
      durationMinutes: row.duration_minutes,
    } satisfies CatalogRow;
  });
}

/** Her published services, with the option as a variant and extras as add-ons. */
async function loadTalentProfileOfferingRows(admin: Admin, tenantId: string, talentProfileId: string): Promise<CatalogRow[]> {
  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, currency, kind, inventory_qty, capacity_pool_id, duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"])
    .in("kind", ["package", "service", "product"])
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("messagesV5.itemsCatalog/talentOfferings", error);
    return [];
  }
  type Row = {
    id: string;
    title: string | null;
    amount_cents: number | null;
    currency: string | null;
    kind: string;
    inventory_qty: number | null;
    capacity_pool_id: string | null;
    duration_minutes: number | null;
  };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];
  const children = await loadOfferingChildren(admin, rows.map((row) => row.id));
  return rows.map((row) => {
    const counted = !!row.capacity_pool_id && typeof row.inventory_qty === "number" && Number.isFinite(row.inventory_qty);
    const variants: CatalogOption[] = (children.variants.get(row.id) ?? []).map((v) => ({
      id: v.id,
      label: v.label,
      amountCents: v.amountCents,
    }));
    const addOns: CatalogOption[] = (children.addOns.get(row.id) ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      amountCents: a.amountCents,
    }));
    return talentOfferingCatalogRow({
      id: row.id,
      title: row.title,
      amountCents: typeof row.amount_cents === "number" ? row.amount_cents : null,
      currency: row.currency,
      kind: row.kind,
      durationMinutes: row.duration_minutes,
      soldOut: counted && Math.round(row.inventory_qty as number) <= 0,
      variants,
      addOns,
    });
  });
}

async function loadSessionRows(admin: Admin, tenantId: string, now: Date): Promise<CatalogRow[]> {
  const { data, error } = await admin
    .from("sessions")
    .select("id, title, offering_id, event_id, starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .gte("ends_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(SESSION_CAP);
  if (error) {
    logServerError("messagesV5.itemsCatalog/sessions", error);
    return [];
  }
  type Row = { id: string; title: string | null; offering_id: string | null; event_id: string | null; starts_at: string; ends_at: string };
  const rows = ((data ?? []) as Row[]).filter((r) => !!r.offering_id);
  if (rows.length === 0) return [];
  const sessionIds = rows.map((r) => r.id);
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter((id): id is string => !!id))];
  const eventOfferingIds = [...new Set(rows.filter((r) => r.event_id).map((r) => r.offering_id as string))];

  const [poolsRes, eventsRes, tiersRes] = await Promise.all([
    admin.from("capacity_pools").select("id, subject_id, pool_key, units_total, is_active").eq("tenant_id", tenantId).eq("subject_kind", "session_tier").in("subject_id", sessionIds),
    eventIds.length ? admin.from("events").select("id, title, slug").eq("tenant_id", tenantId).in("id", eventIds) : Promise.resolve({ data: [], error: null }),
    eventOfferingIds.length
      ? admin.from("talent_offering_variants").select("id, offering_id, label, amount_cents, pool_key, is_hidden, sort_order").in("offering_id", eventOfferingIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (poolsRes.error) logServerError("messagesV5.itemsCatalog/pools", poolsRes.error);
  if (eventsRes.error) logServerError("messagesV5.itemsCatalog/events", eventsRes.error);
  if (tiersRes.error) logServerError("messagesV5.itemsCatalog/tiers", tiersRes.error);

  const pools = new Map<string, { id: string; unitsTotal: number }>();
  for (const p of (poolsRes.data ?? []) as { id: string; subject_id: string; pool_key: string; units_total: number | string; is_active: boolean }[]) {
    if (!p.is_active) continue;
    pools.set(`${p.subject_id}:${p.pool_key}`, { id: p.id, unitsTotal: Number(p.units_total) });
  }
  const eventTitle = new Map<string, string>();
  const eventSlug = new Map<string, string>();
  for (const e of (eventsRes.data ?? []) as { id: string; title: string | null; slug: string | null }[]) {
    if (e.title) eventTitle.set(e.id, e.title);
    if (e.slug) eventSlug.set(e.id, e.slug);
  }
  const tiersByOffering = new Map<string, { id: string; label: string; amount_cents: number | null; pool_key: string | null }[]>();
  for (const t of (tiersRes.data ?? []) as { id: string; offering_id: string; label: string; amount_cents: number | null; pool_key: string | null; is_hidden: boolean }[]) {
    if (t.is_hidden) continue;
    const list = tiersByOffering.get(t.offering_id) ?? [];
    list.push(t);
    tiersByOffering.set(t.offering_id, list);
  }

  const out: CatalogRow[] = [];
  for (const s of rows) {
    const session = { id: s.id, title: s.title, starts_at: s.starts_at, ends_at: s.ends_at, status: "scheduled" };
    if (!s.event_id) {
      const seats = await readSessionSeats(admin, pools.get(`${s.id}:default`), session);
      const { availability, left } = seatsAvailability(seats);
      out.push({
        id: `class:${s.id}`,
        category: "class",
        title: s.title?.trim() || "Class",
        sub: left == null ? null : `${left} left`,
        amountCents: null,
        availability,
        offeringId: s.offering_id as string,
        sessionId: s.id,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
      });
      continue;
    }
    const tiers: TicketTier[] = [];
    let anyLeft = false;
    let anyCounted = false;
    for (const t of tiersByOffering.get(s.offering_id as string) ?? []) {
      const seats = await readSessionSeats(admin, pools.get(`${s.id}:${t.pool_key ?? "default"}`), session);
      const { availability, left } = seatsAvailability(seats);
      if (availability.kind === "free") anyLeft = true;
      if (availability.kind !== "unknown") anyCounted = true;
      tiers.push({ variantId: t.id, label: t.label, amountCents: typeof t.amount_cents === "number" ? t.amount_cents : 0, seatsLeft: left });
    }
    out.push({
      id: `ticket:${s.id}`,
      category: "ticket",
      title: eventTitle.get(s.event_id) ?? s.title?.trim() ?? "Event",
      sub: tiers.length ? `${tiers.length} ${tiers.length === 1 ? "tier" : "tiers"}` : null,
      amountCents: tiers.length ? Math.min(...tiers.map((t) => t.amountCents)) : null,
      availability: tiers.length === 0 ? { kind: "busy", reason: "sold_out" } : anyCounted && !anyLeft ? { kind: "busy", reason: "sold_out" } : anyCounted ? { kind: "free" } : { kind: "unknown" },
      offeringId: s.offering_id as string,
      sessionId: s.id,
      eventId: s.event_id,
      eventSlug: eventSlug.get(s.event_id),
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      tiers,
    });
  }
  return out;
}

async function loadTableRows(tenantId: string, date: string): Promise<CatalogRow[]> {
  const availability = await loadReserveAvailability({ tenantId, partySize: DEFAULT_PARTY, onDate: date });
  if (!availability.ok) return [];
  return availability.windows.flatMap((w) =>
    w.slots.map((s) => ({
      id: `table:${s.startsAtIso}`,
      category: "table" as const,
      title: s.label,
      sub: `${utcToZonedYmd(new Date(s.startsAtIso), availability.timezone) ?? date} · ${DEFAULT_PARTY}`,
      amountCents: null,
      availability: { kind: "free" as const },
      startsAt: s.startsAtIso,
      partySize: DEFAULT_PARTY,
    })),
  );
}

/* ------------------------------------------------------------ person slots (D09) ------------------------------------------------------------ */

export type PersonSlots =
  | { ok: true; starts: string[]; timezone: string; reason: NoSlotsReason | "hours_unreadable" | null }
  | { ok: false; reason: "unavailable" | "not_found" };

/**
 * The same projection as `GET /api/public/booking/slots` (hours, busy,
 * `computePublicSlots`) for one person on this workspace's roster, from a
 * date, for `days` days. The caller is staff, so the offering's public
 * visibility is not a gate: a staff member may offer a time for a service
 * the site hides. `durationMinutes` is the offering's when one is named,
 * else the person's slot length.
 */
export async function loadPersonSlots(admin: Admin, input: { tenantId: string; talentProfileId: string; offeringId?: string | null; from?: string | null; days?: number; now?: Date }): Promise<PersonSlots> {
  const onRoster = await admin.from("agency_talent_roster").select("talent_profile_id").eq("tenant_id", input.tenantId).eq("talent_profile_id", input.talentProfileId).neq("status", "removed").limit(1);
  if (onRoster.error) return { ok: false, reason: "unavailable" };
  if ((onRoster.data ?? []).length === 0) return { ok: false, reason: "not_found" };

  const [hoursRes, offeringRes] = await Promise.all([
    admin.from("talent_booking_hours").select("timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days").eq("talent_profile_id", input.talentProfileId).maybeSingle(),
    input.offeringId ? admin.from("talent_offerings").select("duration_minutes").eq("id", input.offeringId).eq("tenant_id", input.tenantId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (hoursRes.error) return { ok: false, reason: "unavailable" };
  const hours = parseBookingHours(hoursRes.data);
  if (!hours) return { ok: true, starts: [], timezone: "UTC", reason: hoursRes.data ? "hours_unreadable" : "no_booking_hours" };

  const now = input.now ?? new Date();
  const from = parsePublicSlotFrom(input.from ?? null, now);
  const days = clampPublicSlotDays(input.days ?? 7);
  const horizon = Math.min(days, hours.horizonDays);
  const startYmd = utcToZonedYmd(from, hours.timezone) ?? from.toISOString().slice(0, 10);
  const endYmd = addUtcDays(startYmd, horizon) ?? startYmd;
  const windowEnd = new Date(`${endYmd}T23:59:59.999Z`);
  const duration = (offeringRes.data as { duration_minutes?: number | null } | null)?.duration_minutes;

  try {
    const busy = await loadBusyIntervals({ admin, talentProfileId: input.talentProfileId, from, to: windowEnd, now });
    const { starts, reason } = computePublicSlots({
      hours,
      durationMinutes: typeof duration === "number" && duration > 0 ? duration : hours.slotMinutes,
      from,
      days: horizon,
      busy,
    });
    return { ok: true, starts, timezone: hours.timezone, reason };
  } catch (err) {
    // Fail closed: a calendar that cannot be read projects no free slot.
    logServerError("messagesV5.itemsCatalog/personSlots", err);
    return { ok: false, reason: "unavailable" };
  }
}
