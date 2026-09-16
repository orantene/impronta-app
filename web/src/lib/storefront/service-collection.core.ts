/**
 * service_collection — the engine seam (read only). The /book page's own
 * bookable list (`loadPublicBookableOfferings`, booking mode resolved per
 * host) plus the lowest option price, so a card can say "from $".
 */

import type { BookableOffering } from "./appointment-picker.core";
import type { StorefrontAdmin } from "./admin";
import type { ServiceCard, ServiceCollectionData, ServiceCollectionProps } from "./service-collection.types";

export type ServiceCollectionDeps = {
  admin: StorefrontAdmin;
  locale: "en" | "es";
  loadOfferings: (tenantId: string, locale: string) => Promise<BookableOffering[]>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readServiceCollectionCore(
  deps: ServiceCollectionDeps,
  tenantId: string,
  props: ServiceCollectionProps,
): Promise<{ ok: true; data: ServiceCollectionData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  try {
    const wanted = Array.isArray(props.serviceIds) ? new Set(props.serviceIds) : null;
    const offerings = (await deps.loadOfferings(tenantId, deps.locale)).filter(
      (o) => o.kind !== "product" && (wanted ? wanted.has(o.id) : true),
    );
    const lowest = new Map<string, number>();
    if (offerings.length > 0) {
      const { data, error } = await deps.admin
        .from("talent_offering_variants")
        .select("offering_id, amount_cents")
        .in("offering_id", offerings.map((o) => o.id));
      // A failed options read would print the base price as "from": refuse instead.
      if (error) return { ok: false, reason: "unavailable" };
      for (const v of (data ?? []) as Array<{ offering_id: string; amount_cents: number | null }>) {
        if (v.amount_cents == null) continue;
        const cur = lowest.get(v.offering_id);
        if (cur == null || v.amount_cents < cur) lowest.set(v.offering_id, v.amount_cents);
      }
    }
    const services: ServiceCard[] = offerings.map((o) => {
      const option = lowest.get(o.id);
      const base = o.amountCents;
      const fromCents = base == null ? option ?? null : option == null ? base : Math.min(base, option);
      return {
        id: o.id,
        title: o.title,
        description: o.description,
        durationMinutes: o.durationMinutes,
        fromCents: props.showFromPrice === false ? null : fromCents,
        currency: o.currency || "USD",
        priceDisplay: o.priceDisplay,
        bookingMode: o.bookingMode,
        personId: o.talentProfileId,
        category: o.category,
        seatsLabel: o.seatsLabel,
      };
    });
    return { ok: true, data: { services, layout: props.layout ?? "cards" } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
