import "server-only";

/**
 * counter-catalog.ts — the counter's catalog and line facts, read on the
 * server for `page.tsx`.
 *
 * WHAT THE TILE BADGES ARE MADE OF (`POSCounter`: `Options`, `3 left`,
 * `Sold out`, `Pick session`), every one a fact the engine already keeps:
 *
 *   options      — `talent_offering_variants` rows of the offering. The
 *                  chooser lists them; the chosen one rides the line as
 *                  `variant_id` and `addLine` prices it (`lib/pos/draft.ts`).
 *   stock        — `talent_offerings.inventory_qty`, the AVAILABLE-units
 *                  mirror the capacity engine maintains (`set_offering_stock`),
 *                  honoured only when `capacity_pool_id` is set: a quantity
 *                  with no pool is a stale mirror from before the stock
 *                  migration and means unlimited, the storefront's own rule.
 *   sessions     — upcoming `sessions` of the offering (C19), unchanged.
 *
 * AND THE BASKET'S LINE FACTS: the variant's label as the line's second line,
 * and `Held until hh:mm` from the live hold on the line
 * (`capacity_allocations`, the same rows `hold-capacity.ts` reads before it
 * holds again). A hold that has lapsed or been released draws nothing; the
 * engine's refusal on charge is what tells the cashier the place is gone.
 *
 * Nothing here writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import type { PosCatalogItem, PosCatalogOption, PosCatalogStock } from "./counter-model";

type Admin = Pick<SupabaseClient, "from">;

type OfferingRow = {
  id: string;
  title: string | null;
  amount_cents: number | null;
  kind: string | null;
  inventory_qty: number | null;
  capacity_pool_id: string | null;
};

type VariantRow = { id: string; offering_id: string; label: string | null; amount_cents: number | null };

type SessionRow = { id: string; offering_id: string | null; title: string | null; starts_at: string };

const SESSIONS_PER_OFFERING = 8;

function stockOf(row: OfferingRow): PosCatalogStock {
  if (!row.capacity_pool_id) return { kind: "unlimited" };
  const qty = row.inventory_qty;
  if (typeof qty !== "number" || !Number.isFinite(qty)) return { kind: "unlimited" };
  return { kind: "counted", available: Math.max(0, Math.round(qty)) };
}

export type CounterCatalog = {
  readonly items: PosCatalogItem[];
  /** Upcoming sessions per offering id, for the basket's session labels. */
  readonly sessionsByOffering: ReadonlyMap<string, readonly { id: string; title: string; startsAt: string }[]>;
};

export async function loadCounterCatalog(admin: Admin, input: { tenantId: string; nowIso: string }): Promise<CounterCatalog> {
  const [catalog, upcoming] = await Promise.all([
    admin
      .from("talent_offerings")
      .select("id, title, amount_cents, kind, inventory_qty, capacity_pool_id")
      .eq("tenant_id", input.tenantId)
      .eq("owner_kind", "workspace")
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    admin
      .from("sessions")
      .select("id, offering_id, title, starts_at")
      .eq("tenant_id", input.tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", input.nowIso)
      .order("starts_at", { ascending: true })
      .limit(80),
  ]);
  if (catalog.error) logServerError("pos.page.catalog", catalog.error);
  if (upcoming.error) logServerError("pos.page.sessions", upcoming.error);

  const rows = (catalog.data ?? []) as OfferingRow[];
  const ids = rows.map((row) => row.id);

  // Variants are children of the offering (no tenant column of their own);
  // the parent set above is tenant-scoped, so the `in` keeps them so too.
  const variants =
    ids.length > 0
      ? await admin
          .from("talent_offering_variants")
          .select("id, offering_id, label, amount_cents")
          .in("offering_id", ids)
          .order("sort_order", { ascending: true })
      : { data: [] as VariantRow[], error: null };
  if (variants.error) logServerError("pos.page.variants", variants.error);
  const optionsByOffering = new Map<string, PosCatalogOption[]>();
  for (const row of (variants.data ?? []) as VariantRow[]) {
    const list = optionsByOffering.get(row.offering_id) ?? [];
    list.push({ id: row.id, label: row.label?.trim() || row.id.slice(0, 8), amountCents: row.amount_cents ?? null });
    optionsByOffering.set(row.offering_id, list);
  }

  const sessionsByOffering = new Map<string, Array<{ id: string; title: string; startsAt: string }>>();
  for (const row of (upcoming.data ?? []) as SessionRow[]) {
    if (!row.offering_id) continue;
    const list = sessionsByOffering.get(row.offering_id) ?? [];
    if (list.length >= SESSIONS_PER_OFFERING) continue;
    list.push({ id: row.id, title: row.title?.trim() || row.starts_at, startsAt: row.starts_at });
    sessionsByOffering.set(row.offering_id, list);
  }

  const items: PosCatalogItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title ?? row.id.slice(0, 8),
    amountCents: row.amount_cents ?? 0,
    kind: row.kind ?? "service",
    sessions: sessionsByOffering.get(row.id) ?? [],
    options: optionsByOffering.get(row.id),
    stock: stockOf(row),
  }));
  return { items, sessionsByOffering };
}

export type CounterLineFacts = {
  /** Variant label per `variant_id` on the sale's lines. */
  readonly variantLabels: ReadonlyMap<string, string>;
  /** Live hold expiry (ISO) per `order_line_id`; absent when nothing is held. */
  readonly heldUntilByLine: ReadonlyMap<string, string>;
};

export async function loadCounterLineFacts(
  admin: Admin,
  input: { tenantId: string; lineIds: readonly string[]; variantIds: readonly string[]; nowIso: string },
): Promise<CounterLineFacts> {
  const [holds, variants] = await Promise.all([
    input.lineIds.length > 0
      ? admin
          .from("capacity_allocations")
          .select("order_line_id, expires_at")
          .eq("tenant_id", input.tenantId)
          .eq("state", "hold")
          .gt("expires_at", input.nowIso)
          .in("order_line_id", input.lineIds)
      : Promise.resolve({ data: [] as Array<{ order_line_id: string | null; expires_at: string | null }>, error: null }),
    input.variantIds.length > 0
      ? admin.from("talent_offering_variants").select("id, label").in("id", input.variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; label: string | null }>, error: null }),
  ]);
  if (holds.error) logServerError("pos.page.holds", holds.error);
  if (variants.error) logServerError("pos.page.lineVariants", variants.error);

  const heldUntilByLine = new Map<string, string>();
  for (const row of (holds.data ?? []) as Array<{ order_line_id: string | null; expires_at: string | null }>) {
    if (!row.order_line_id || !row.expires_at) continue;
    // Several holds on one line (a split across pools): the EARLIEST expiry
    // is the one that matters to the cashier.
    const current = heldUntilByLine.get(row.order_line_id);
    if (!current || row.expires_at < current) heldUntilByLine.set(row.order_line_id, row.expires_at);
  }
  const variantLabels = new Map<string, string>();
  for (const row of (variants.data ?? []) as Array<{ id: string; label: string | null }>) {
    if (row.label?.trim()) variantLabels.set(row.id, row.label.trim());
  }
  return { variantLabels, heldUntilByLine };
}
