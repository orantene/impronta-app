"use client";

/**
 * LineServicePicker (S14/S15, hardened W2-1) — lazy-loads the selected talent's
 * services and lets the coordinator prefill an offer line from a priced service
 * (name → label, pricingType → pricing_unit, amount → unit price).
 *
 * WHY THE W2-1 REWRITE: the old picker `.catch`-swallowed every load failure and
 * fell back to generic templates with NO signal. During the 2026-07-11 audit an
 * expired session made More's five published services vanish behind the default
 * templates — "no services" and "couldn't load services" looked identical, which
 * for a coordinator mean opposite things. Now the four states are distinct:
 *   loading   → "Loading services…"
 *   error     → "Couldn't load services · Retry" (NEVER silent defaults)
 *   empty     → generic templates + a caption saying so
 *   loaded    → the talent's real services FIRST (with prices), templates last
 *
 * className-only (no inline style) so it stays clear of the admin-shell ratchet.
 */

import { useCallback, useEffect, useState } from "react";
import { loadTalentServicesMenu } from "@/lib/talent/services-menu-actions";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { offeringIsOfferPriceable } from "@/lib/talent/offerings-offer";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { isServiceOfferPriceable } from "@/lib/talent/services-menu-offer";
import { SERVICE_PRICING_LABELS, type ServiceMenuItem, type ServicePricingType } from "@/lib/talent/services-menu-types";
import { useT } from "@/i18n/use-t";

/**
 * DEFAULT rate templates: every talent is offer-able even with zero configured
 * services. Picking one prefills label + unit with NO price — the coordinator
 * types the number. Used for the genuinely-empty state, and offered under a
 * "generic templates" group when real services exist.
 */
const DEFAULT_RATE_TEMPLATES: ServiceMenuItem[] = (
  [
    { id: "default-hourly", name: "Hourly booking", pricingType: "hour" },
    { id: "default-half-day", name: "Half-day booking", pricingType: "half_day" },
    { id: "default-day", name: "Day rate", pricingType: "day" },
    { id: "default-event", name: "Event booking", pricingType: "event" },
    { id: "default-package", name: "Custom package", pricingType: "flat_package" },
  ] as { id: string; name: string; pricingType: ServicePricingType }[]
).map((t) => ({
  id: t.id,
  name: t.name,
  description: null,
  pricingType: t.pricingType,
  amountCents: null,
  currency: "USD",
  taxonomyTermIds: null,
  addOns: [],
  tiers: [],
  isActive: true,
  visibility: "public" as const,
  sortOrder: 0,
  isInstantBook: false,
  childServiceIds: null,
}));

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; services: ServiceMenuItem[] }; // services = real (may be empty)

export function LineServicePicker({
  talentProfileId,
  onPick,
}: {
  talentProfileId: string;
  onPick: (svc: ServiceMenuItem) => void;
}) {
  const t = useT();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });
    // Offerings (the Services storefront) are the primary source; the legacy
    // services menu is a fallback. Both adapted into the ServiceMenuItem shape
    // so onPick/machinery need no changes (offering id → source_service_id).
    Promise.all([
      loadTalentOfferingsForEditor(talentProfileId).catch(() => ({ ok: false as const, error: "load_error" })),
      loadTalentServicesMenu(talentProfileId).catch(() => ({ ok: false as const, error: "load_error" })),
    ]).then(([off, menu]) => {
      if (cancelled) return;
      // BOTH sources failed → error state (do NOT masquerade as "no services").
      if (!off.ok && !menu.ok) {
        setState({ status: "error" });
        return;
      }
      const offeringItems: ServiceMenuItem[] = off.ok
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
      setState({ status: "ready", services: [...offeringItems, ...menuItems] });
    });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  useEffect(() => load(), [load]);

  if (state.status === "loading") {
    return (
      <span className="text-admin-10h text-admin-ink-muted">
        {t("dashboard.adminTabs.lineup.svcLoading")}
      </span>
    );
  }

  if (state.status === "error") {
    // Loud, retryable — the coordinator must never be silently handed defaults
    // for a talent that actually has services.
    return (
      <span className="flex items-center gap-1.5 text-admin-10h text-admin-coral-deep">
        {t("dashboard.adminTabs.lineup.svcLoadError")}
        <button type="button" onClick={() => load()} className="font-semibold underline underline-offset-2">
          {t("dashboard.adminTabs.lineup.retry")}
        </button>
      </span>
    );
  }

  const real = state.services.filter((it) => it.isActive && isServiceOfferPriceable(it));
  const hasReal = real.length > 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-admin-10h font-bold uppercase tracking-wide text-admin-ink-muted whitespace-nowrap">
        {t("dashboard.adminTabs.lineup.fromMenu")}
      </span>
      <select
        defaultValue=""
        onChange={(e) => {
          const pick = [...real, ...DEFAULT_RATE_TEMPLATES].find((it) => it.id === e.target.value);
          if (pick) onPick(pick);
          e.currentTarget.value = "";
        }}
        className="min-w-0 flex-1 rounded border border-admin-border bg-white px-1.5 py-1 text-[11px] text-admin-ink"
      >
        <option value="">
          {hasReal
            ? t("dashboard.adminTabs.lineup.svcPrefill")
            : t("dashboard.adminTabs.lineup.svcNoneUseTemplate")}
        </option>
        {hasReal ? (
          <optgroup label={t("dashboard.adminTabs.lineup.svcThisTalent")}>
            {real.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} · {SERVICE_PRICING_LABELS[it.pricingType]}
                {it.amountCents != null ? ` · ${(it.amountCents / 100).toLocaleString()} ${it.currency}` : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label={t("dashboard.adminTabs.lineup.svcGenericTemplates")}>
          {DEFAULT_RATE_TEMPLATES.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name} · {SERVICE_PRICING_LABELS[it.pricingType]}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
