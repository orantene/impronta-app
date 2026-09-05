import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { CapacityRefusalReason } from "@/lib/capacity/types";
import type { OfferingPolicy } from "@/lib/orders/purchase-policy";
import type {
  PricedOffering,
  PricedVariant,
  PricedAddon,
} from "@/lib/orders/purchase-pricing";
import type { PurchaseRefusalReason } from "@/lib/orders/purchase";

/**
 * Catalog reads and refusal mapping for the purchase pipeline.
 *
 * Split out of `purchase.ts` when that file crossed the 800-line cap. The cut
 * is along a real seam rather than at a line number: everything here READS the
 * catalog or TRANSLATES an engine's refusal into something a buyer can act on,
 * and none of it decides anything about the purchase. `purchase.ts` keeps the
 * orchestration and the compensation ledger.
 */

export type Catalog =
  | {
      ok: true;
      policies: Map<string, OfferingPolicy>;
      /** Columns only the slot gate needs, kept off the priced shape. */
      rawOfferings: Map<string, { kind: string; durationMinutes: number | null; talentProfileId: string | null }>;
      offerings: Map<string, PricedOffering>;
      variants: Map<string, PricedVariant>;
      addons: Map<string, PricedAddon>;
    }
  | { ok: false; error: string };

export async function loadCatalog(admin: SupabaseClient, offeringIds: string[]): Promise<Catalog> {
  const { data: offeringRows, error: offeringErr } = await admin
    .from("talent_offerings")
    .select(
      "id, tenant_id, title, status, price_type, amount_cents, talent_profile_id, " +
        "reserve_mode, deposit_pct, allow_pay_in_person, require_account_to_book, cancellation_hours, " +
        "kind, duration_minutes",
    )
    .in("id", offeringIds);

  if (offeringErr) {
    logServerError("orders.loadCatalog/offerings", offeringErr);
    return { ok: false, error: "Could not load the items." };
  }

  const [variantResult, addonResult] = await Promise.all([
    admin
      .from("talent_offering_variants")
      .select("id, offering_id, label, amount_cents")
      .in("offering_id", offeringIds),
    admin
      .from("talent_offering_addons")
      .select("id, offering_id, label, amount_cents")
      .in("offering_id", offeringIds),
  ]);

  if (variantResult.error) {
    logServerError("orders.loadCatalog/variants", variantResult.error);
    return { ok: false, error: "Could not load the options." };
  }
  if (addonResult.error) {
    logServerError("orders.loadCatalog/addons", addonResult.error);
    return { ok: false, error: "Could not load the extras." };
  }

  type OfferingRow = {
    id: string;
    tenant_id: string | null;
    title: string | null;
    status: string | null;
    price_type: string | null;
    amount_cents: number | null;
    talent_profile_id: string | null;
    reserve_mode: string | null;
    deposit_pct: number | null;
    allow_pay_in_person: boolean | null;
    require_account_to_book: boolean | null;
    cancellation_hours: number | null;
  };

  const policies = new Map<string, OfferingPolicy>();
  const offerings = new Map<string, PricedOffering>();
  const rawOfferings = new Map<
    string,
    { kind: string; durationMinutes: number | null; talentProfileId: string | null }
  >();

  for (const row of (offeringRows ?? []) as unknown as OfferingRow[]) {
    policies.set(row.id, {
      offeringId: row.id,
      status:
        row.status === "published" || row.status === "draft" || row.status === "archived"
          ? row.status
          : "draft",
      tenantId: row.tenant_id ?? "",
      reserveMode:
        row.reserve_mode === "deposit" || row.reserve_mode === "free" ? row.reserve_mode : "full",
      depositPct:
        typeof row.deposit_pct === "number" && row.deposit_pct > 0 && row.deposit_pct < 100
          ? Math.round(row.deposit_pct)
          : null,
      allowPayInPerson: row.allow_pay_in_person === true,
      requireAccountToBook: row.require_account_to_book === true,
      cancellationHours:
        typeof row.cancellation_hours === "number" && row.cancellation_hours >= 0
          ? row.cancellation_hours
          : null,
    });

    offerings.set(row.id, {
      offeringId: row.id,
      label: row.title ?? "Item",
      amountCents: row.amount_cents,
      priceType: row.price_type ?? "fixed",
      talentProfileId: row.talent_profile_id,
      ownerTenantId: row.talent_profile_id ? null : row.tenant_id,
      talentCostCents: row.talent_profile_id ? (row.amount_cents ?? 0) : 0,
    });

    rawOfferings.set(row.id, {
      kind: (row as unknown as { kind?: string | null }).kind ?? "service",
      durationMinutes:
        (row as unknown as { duration_minutes?: number | null }).duration_minutes ?? null,
      talentProfileId: row.talent_profile_id,
    });
  }

  type VariantRow = { id: string; offering_id: string; label: string | null; amount_cents: number | null };
  type AddonRow = { id: string; offering_id: string; label: string | null; amount_cents: number | null };

  const variants = new Map<string, PricedVariant>();
  for (const row of (variantResult.data ?? []) as unknown as VariantRow[]) {
    variants.set(row.id, {
      variantId: row.id,
      offeringId: row.offering_id,
      label: row.label ?? "",
      amountCents: row.amount_cents,
    });
  }

  const addons = new Map<string, PricedAddon>();
  for (const row of (addonResult.data ?? []) as unknown as AddonRow[]) {
    if (typeof row.amount_cents !== "number" || row.amount_cents < 0) continue;
    addons.set(row.id, {
      addonId: row.id,
      offeringId: row.offering_id,
      label: row.label ?? "",
      amountCents: row.amount_cents,
    });
  }

  return { ok: true, policies, rawOfferings, offerings, variants, addons };
}

/**
 * Capacity refusal → what the buyer is told.
 *
 * Three classes, and collapsing them is a real bug the Capacity Engine Manager
 * found in production: an outage was reaching customers as "this does not
 * exist". A person told a thing is gone leaves; a person told to try again
 * tries again.
 *
 *   sold_out / ancestor_full / pool_not_found / pool_inactive
 *       → genuinely not available. `ancestor_full` means a parent is booked out
 *         (the room is bought out, so its tables are gone), which is a sold-out
 *         state however it reads internally.
 *
 *   unavailable
 *       → the engine could not be REACHED. Not a refusal at all, and the one
 *         outcome a buyer can act on.
 *
 *   invalid_units / invalid_window / invalid_ttl / empty_batch
 *       → CALLER BUGS. A well-formed pipeline cannot produce them, so they must
 *         alert rather than render. Showing a customer "invalid window" tells
 *         them nothing and tells us nothing either.
 */
export function mapCapacityRefusal(reason: CapacityRefusalReason): PurchaseRefusalReason {
  switch (reason) {
    case "sold_out":
    case "ancestor_full":
    case "pool_not_found":
    case "pool_inactive":
      return "sold_out";
    case "unavailable":
      return "capacity_unavailable";
    case "invalid_units":
    case "invalid_window":
    case "invalid_ttl":
    case "empty_batch":
      logServerError(
        "orders.createPurchase/capacity-caller-bug",
        `capacity refused with ${reason} — a well-formed pipeline cannot produce this`,
      );
      return "engine_error";
    default: {
      // Exhaustiveness: a reason added upstream must not silently become
      // "sold out". This fails the typecheck instead.
      const unhandled: never = reason;
      logServerError("orders.createPurchase/capacity-unknown", `unhandled reason ${String(unhandled)}`);
      return "engine_error";
    }
  }
}

/**
 * The capacity pool an offering draws from.
 *
 * ABSENCE IS NOT A VALUE, and this function exists in this shape because I got
 * that wrong first. The original returned `string | null` and resolved a READ
 * ERROR to null — which I labelled "fail closed". It is the opposite. `null`
 * here means UNLIMITED, so a transient database error during a sold-out event
 * would have produced unlimited sales: the exact defect this phase spent its
 * life closing, arriving through a failed read instead of a missing predicate.
 *
 * The caller could not tell "this offering genuinely has no cap" from "I could
 * not find out", and the collapsed answer was the one that sells.
 *
 * So the result is a discriminated union. A read failure is `ok: false` and the
 * purchase REFUSES — a failed read is a retry, and an oversold event is a person
 * turned away at a door. Corrected on the Director's ruling.
 */
export type OfferingPoolLookup =
  | { ok: true; poolId: string | null }
  | { ok: false };

export async function loadOfferingCapacityPoolId(
  admin: SupabaseClient,
  offeringId: string,
): Promise<OfferingPoolLookup> {
  const { data, error } = await admin
    .from("talent_offerings")
    .select("capacity_pool_id")
    .eq("id", offeringId)
    .maybeSingle();

  if (error) {
    logServerError("orders.loadOfferingCapacityPoolId", error);
    return { ok: false };
  }
  return {
    ok: true,
    poolId: (data as { capacity_pool_id?: string | null } | null)?.capacity_pool_id ?? null,
  };
}
