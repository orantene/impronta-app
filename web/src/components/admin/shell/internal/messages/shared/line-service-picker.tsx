"use client";

/**
 * LineServicePicker (S14/S15) — lazy-loads the selected talent's services menu
 * and lets the coordinator prefill an offer line from one of the talent's priced
 * services (name → label, pricingType → pricing_unit, amount → unit price).
 * Custom / quote-only services are excluded (not offer-priceable). Renders
 * nothing when the talent has no priced services. Read-only convenience — the
 * coordinator can still edit every field afterward.
 *
 * className-only (no inline style) so it stays clear of the admin-shell
 * no-new-inline-style ratchet.
 */

import { useEffect, useState } from "react";
import { loadTalentServicesMenu } from "@/lib/talent/services-menu-actions";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { offeringIsOfferPriceable } from "@/lib/talent/offerings-offer";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { isServiceOfferPriceable } from "@/lib/talent/services-menu-offer";
import { SERVICE_PRICING_LABELS, type ServiceMenuItem } from "@/lib/talent/services-menu-types";

export function LineServicePicker({
  talentProfileId,
  onPick,
}: {
  talentProfileId: string;
  onPick: (svc: ServiceMenuItem) => void;
}) {
  const [items, setItems] = useState<ServiceMenuItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems(null);
    // Offerings (the Services storefront) are the primary source; the legacy
    // services menu remains as a fallback. Offerings are adapted into the
    // ServiceMenuItem shape so onPick/machinery need no changes — the offering
    // id lands in source_service_id exactly like a menu id did.
    Promise.all([
      loadTalentOfferingsForEditor(talentProfileId).catch(() => ({ ok: false as const, error: "" })),
      loadTalentServicesMenu(talentProfileId).catch(() => ({ ok: false as const, error: "" })),
    ])
      .then(([off, menu]) => {
        if (cancelled) return;
        const offeringItems: ServiceMenuItem[] =
          off.ok
            ? off.items
                .filter((o: TalentOffering) => o.status === "published" && offeringIsOfferPriceable(o))
                .map((o: TalentOffering) => ({
                  id: o.id,
                  name: o.title,
                  description: o.description,
                  pricingType: o.priceType,
                  amountCents: o.amountCents,
                  currency: o.currency,
                  taxonomyTermIds: null,
                  addOns: [],
                  tiers: [],
                  isActive: true,
                  visibility: "public" as const,
                  sortOrder: o.sortOrder,
                  isInstantBook: o.bookingMode === "instant",
                  childServiceIds: null,
                }))
            : [];
        const menuItems = menu.ok ? menu.items : [];
        setItems([...offeringItems, ...menuItems]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  const priceable = (items ?? []).filter((it) => it.isActive && isServiceOfferPriceable(it));

  if (loading) {
    return <span className="text-admin-10h text-admin-ink-muted">Loading services…</span>;
  }
  if (priceable.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-admin-10h font-bold uppercase tracking-wide text-admin-ink-muted whitespace-nowrap">
        From menu
      </span>
      <select
        defaultValue=""
        onChange={(e) => {
          const svc = priceable.find((it) => it.id === e.target.value);
          if (svc) onPick(svc);
          e.currentTarget.value = "";
        }}
        className="min-w-0 flex-1 rounded border border-admin-border bg-white px-1.5 py-1 text-[11px] text-admin-ink"
      >
        <option value="">— prefill from a service —</option>
        {priceable.map((it) => (
          <option key={it.id} value={it.id}>
            {it.name} · {SERVICE_PRICING_LABELS[it.pricingType]}
            {it.amountCents != null
              ? ` · ${(it.amountCents / 100).toLocaleString()} ${it.currency}`
              : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
