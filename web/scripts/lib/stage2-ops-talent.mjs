/**
 * Seed-owned fixture talents (TAL-962xx) and their services. A fixture talent is a NEW row; the seed never updates a
 * pre-existing talent. TAL-93900 (the hub talent) only ever receives additive rows flagged `touchesExisting`.
 */
import { MON_SAT_9_18 } from "./failed-cards-ops.mjs";
import { J, insert, s2Id } from "./stage2-ops.mjs";

/** A published, publicly visible roster talent (+ optional login) with booking hours. Not a test-flagged account, so public loaders show it. */
export function talentOps(fx, key, spec, at) {
  const tid = s2Id(`talent:${key}`);
  const ops = [
    insert(fx, "public.talent_profiles", `talent:${key}`, {
      id: tid, user_id: spec.userKey ? s2Id(`user:${spec.userKey}`) : null, profile_code: spec.code, public_slug_part: spec.code, display_name: spec.display,
      first_name: spec.display.split(" ")[0], profile_kind: "person", short_bio: spec.tagline, preferred_locale: spec.locale ?? "es",
      default_currency: spec.currency ?? "MXN", talent_plan_key: "talent_portfolio", workflow_status: "published", visibility: "public",
      is_publicly_hidden: false, is_test_account: false, is_demo: false, created_by_agency_id: spec.ws, booking_terms: J({ directBookingOptIn: true }),
      updated_at: at.toISOString(),
    }),
    insert(fx, "public.agency_talent_roster", `roster:${key}`, {
      id: s2Id(`roster:${key}`), tenant_id: spec.ws, talent_profile_id: tid, source_type: "agency_created", status: "active", agency_visibility: "site_visible",
      talent_site_hidden: false, direct_booking_enabled: true, is_primary: true,
    }),
  ];
  if (spec.tz) {
    ops.push(insert(fx, "public.talent_booking_hours", `hours:${key}`, {
      talent_profile_id: tid, tenant_id: spec.ws, timezone: spec.tz, weekly: J(MON_SAT_9_18), exceptions: J([]), slot_minutes: 30,
      buffer_before_min: 0, buffer_after_min: 0, min_notice_min: 60, horizon_days: 60,
    }, ["talent_profile_id"]));
  }
  return { ops, tid };
}

/**
 * A talent-owned catalog row (owner_kind 'talent'). `tenantId` is the workspace (or the hub tenant for TAL-93900).
 * spec: title, titleEn, description, descriptionEn, cents, minutes, kind, category, status, bookingMode, currency, touchesExisting,
 * priceDisplay ("exact" default | "from" = the "Desde" price: a CHECK requires booking_mode request for anything but exact).
 */
export function talentServiceOp(fx, key, talentId, tenantId, spec) {
  const op = insert(fx, "public.talent_offerings", `offering:${key}`, {
    id: s2Id(`offering:${key}`), talent_profile_id: talentId, tenant_id: tenantId, owner_kind: "talent", kind: spec.kind ?? "service",
    title: spec.title, description: spec.description, price_type: "flat_package", price_display: spec.priceDisplay ?? "exact", amount_cents: spec.cents,
    currency: spec.currency ?? "MXN", booking_mode: spec.bookingMode ?? "instant", allow_pay_in_person: true, duration_minutes: spec.minutes ?? null,
    category: spec.category ?? "Servicios", status: spec.status ?? "published", visibility: "public", moderation_state: "approved", is_featured: false,
    sort_order: spec.sort ?? 0, attributes: J({ where: ["client"] }), title_i18n: J({ es: spec.title, en: spec.titleEn }),
    description_i18n: J({ es: spec.description, en: spec.descriptionEn }), reserve_mode: "full", cancellation_hours: 24,
  });
  if (spec.touchesExisting) op.touchesExisting = spec.touchesExisting;
  return op;
}
