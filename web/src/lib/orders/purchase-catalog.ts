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
import { isSellableOnChannel, type PurchaseChannel } from "@/lib/offerings/guest-sellable";
import { variantSellability } from "@/lib/offerings/sellable";
import { resolveOfferingPolicy } from "@/lib/talent/offering-policy-resolver";
import { loadSellingDefaultsByTalent } from "@/lib/talent/offering-policy-server";
import { loadGroupExtras } from "@/lib/orders/purchase-catalog-groups";

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
      rawOfferings: Map<
        string,
        {
          kind: string;
          durationMinutes: number | null;
          talentProfileId: string | null;
          /** `talent_offerings.requires_identity` — the product asking for a name. */
          requiresIdentity: boolean;
          identityReason: string | null;
          /** `talent_offerings.visibility` / `moderation_state`, for the guest-sellable gate. */
          visibility: string | null;
          moderationState: string | null;
        }
      >;
      offerings: Map<string, PricedOffering>;
      variants: Map<string, PricedVariant>;
      addons: Map<string, PricedAddon>;
      /**
       * `talent_offerings.capacity_pool_id` per offering (null = unlimited).
       * D5: the pipeline holds this pool for every line whose caller declared
       * no capacity of its own (purchase-stock.ts). Optional only so hand-built
       * catalogs in tests still type; `loadCatalog` always sets it.
       */
      stockPools?: Map<string, string | null>;
    }
  | { ok: false; error: string };

export async function loadCatalog(admin: SupabaseClient, offeringIds: string[]): Promise<Catalog> {
  const { data: offeringRows, error: offeringErr } = await admin
    .from("talent_offerings")
    .select(
      "id, tenant_id, title, status, price_type, amount_cents, currency, talent_profile_id, " +
        "reserve_mode, deposit_pct, allow_pay_in_person, require_account_to_book, cancellation_hours, " +
        "kind, duration_minutes, requires_identity, identity_reason, visibility, moderation_state, capacity_pool_id",
    )
    .in("id", offeringIds);

  if (offeringErr) {
    logServerError("orders.loadCatalog/offerings", offeringErr);
    return { ok: false, error: "Could not load the items." };
  }

  const [variantResult, addonResult] = await Promise.all([
    admin
      .from("talent_offering_variants")
      .select("id, offering_id, label, amount_cents, min_per_order, max_per_order, is_hidden")
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
    currency: string | null;
    talent_profile_id: string | null;
    reserve_mode: string | null;
    deposit_pct: number | null;
    allow_pay_in_person: boolean | null;
    require_account_to_book: boolean | null;
    cancellation_hours: number | null;
    requires_identity: boolean | null;
    identity_reason: string | null;
    visibility: string | null;
    moderation_state: string | null;
    capacity_pool_id?: string | null;
  };

  const policies = new Map<string, OfferingPolicy>();
  const offerings = new Map<string, PricedOffering>();
  const rawOfferings = new Map<
    string,
    {
      kind: string;
      durationMinutes: number | null;
      talentProfileId: string | null;
      requiresIdentity: boolean;
      identityReason: string | null;
      visibility: string | null;
      moderationState: string | null;
    }
  >();

  const typedRows = (offeringRows ?? []) as unknown as OfferingRow[];
  // Talent defaults (deposit, cancellation) the editor shows as "Uses your
  // default". Read here so the charge follows the same chain as the promise.
  const talentDefaults = await loadSellingDefaultsByTalent(
    admin,
    typedRows.map((r) => r.talent_profile_id).filter((id): id is string => Boolean(id)),
  );
  if (!talentDefaults.ok) {
    return { ok: false, error: "Could not load the booking rules." };
  }

  for (const row of typedRows) {
    const effective = resolveOfferingPolicy(
      {
        reserveMode: row.reserve_mode,
        depositPct: row.deposit_pct,
        cancellationHours: row.cancellation_hours,
      },
      row.talent_profile_id ? (talentDefaults.defaults.get(row.talent_profile_id) ?? {}) : null,
    );
    policies.set(row.id, {
      offeringId: row.id,
      status:
        row.status === "published" || row.status === "draft" || row.status === "archived"
          ? row.status
          : "draft",
      tenantId: row.tenant_id ?? "",
      reserveMode: effective.reserveMode,
      depositPct: effective.depositPct,
      allowPayInPerson: row.allow_pay_in_person === true,
      requireAccountToBook: row.require_account_to_book === true,
      cancellationHours: effective.cancellationHours,
    });

    offerings.set(row.id, {
      offeringId: row.id,
      label: row.title ?? "Item",
      amountCents: row.amount_cents,
      // The offering IS the truth for currency. The tenant key is only the
      // default applied when an offering is created, never a second source
      // consulted at purchase time.
      currency: row.currency,
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
      requiresIdentity: row.requires_identity === true,
      identityReason: row.identity_reason ?? null,
      visibility: row.visibility ?? null,
      moderationState: row.moderation_state ?? null,
    });
  }

  type VariantRow = {
    id: string;
    offering_id: string;
    label: string | null;
    amount_cents: number | null;
    min_per_order?: number | null;
    max_per_order?: number | null;
    is_hidden?: boolean | null;
  };
  type AddonRow = { id: string; offering_id: string; label: string | null; amount_cents: number | null };

  const variants = new Map<string, PricedVariant>();
  for (const row of (variantResult.data ?? []) as unknown as VariantRow[]) {
    variants.set(row.id, {
      variantId: row.id,
      offeringId: row.offering_id,
      label: row.label ?? "",
      amountCents: row.amount_cents,
      minPerOrder: row.min_per_order ?? 1,
      maxPerOrder: row.max_per_order ?? null,
      isHidden: row.is_hidden === true,
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

  // Shared extras (talent_addon_groups) ride the sheet as add-ons with the
  // GROUP id; price them from the group row so they are not refused.
  const groupExtras = await loadGroupExtras(
    admin,
    new Map(typedRows.map((r) => [r.id, r.talent_profile_id] as const)),
  );
  if (!groupExtras.ok) return { ok: false, error: "Could not load the extras." };
  for (const g of groupExtras.addons) addons.set(g.addonId, g);

  const stockPools = new Map(typedRows.map((r) => [r.id, r.capacity_pool_id ?? null] as const));
  return { ok: true, policies, rawOfferings, offerings, variants, addons, stockPools };
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

/**
 * D-10 / D-10a at checkout. The policy gate only reads `status`, so an
 * `agency_only` or `pending` service used to look buyable by id. A guest charge
 * needs published + approved + public (`on_request` is not `public`, so it can
 * never take an instant charge). FAILS CLOSED: a row with no visibility or
 * moderation value is refused. The staff desk (`channel: "staff"`) is exempt.
 */
export function refuseUnsellableOfferings(
  catalog: Extract<Catalog, { ok: true }>,
  offeringIds: readonly string[],
  channel: PurchaseChannel | undefined,
): { ok: true } | { ok: false; reason: PurchaseRefusalReason; offeringId: string; error: string } {
  for (const offeringId of offeringIds) {
    const raw = catalog.rawOfferings.get(offeringId);
    const status = catalog.policies.get(offeringId)?.status;
    const row = raw ? { status, moderation_state: raw.moderationState, visibility: raw.visibility } : null;
    if (!isSellableOnChannel(row, channel)) {
      return { ok: false, reason: "offering_not_published", offeringId, error: "That item is no longer available." };
    }
  }
  return { ok: true };
}

/**
 * D1 addendum: the catalog load runs as the service role, so RLS never hid a
 * hidden / comp tier from checkout. A guest charge for a tier that is
 * `is_hidden` is refused unless the request carries that tier's link unlock
 * (`unlockedVariantIds`, set only by the ticket picker). The staff desk is exempt.
 */
export function refuseHiddenVariants(
  catalog: Extract<Catalog, { ok: true }>,
  lines: ReadonlyArray<{ offeringId: string; variantId?: string | null }>,
  channel: PurchaseChannel | undefined,
  unlockedVariantIds: readonly string[] | undefined,
): { ok: true } | { ok: false; reason: PurchaseRefusalReason; offeringId: string; error: string } {
  const unlocked = new Set((unlockedVariantIds ?? []).map((id) => id.toLowerCase()));
  const context = channel === "staff" ? "pos_desk" : channel === "reservation" ? "reservation" : "guest";
  for (const line of lines) {
    if (!line.variantId) continue;
    const variant = catalog.variants.get(line.variantId);
    if (!variant) continue; // an unknown / foreign variant is refused by pricing, not here
    if (!variantSellability(variant, context, { unlocked: unlocked.has(line.variantId.toLowerCase()) }).ok) {
      return { ok: false, reason: "offering_not_published", offeringId: line.offeringId, error: "That item is no longer available." };
    }
  }
  return { ok: true };
}
