"use server";

/**
 * admin-product-features.ts — Phase 4 server actions for the
 * `product_features` table.
 *
 * Features don't touch Stripe (only Prices + Products + Coupons do), so
 * these actions are pure DB writes. super_admin-gated; service-role for
 * writes (no public RLS on `product_features`).
 *
 * Lives in its own file to keep `admin-product-pricing.ts` under the
 * 800-line max-lines cap.
 *
 * Eslint note: 5 `.from("product_features")` calls below trip
 * `ratchet/no-untenanted-from`. Same justification as the other
 * `admin-product-*` files — `product_features` is platform-level
 * (no `tenant_id`). Registered in `eslint-suppressions.json`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";

const PRICING_PATH = "/platform/admin/pricing";

// ─── Auth gate (small duplication — kept local for symmetry with the
//     other admin-product-* files) ────────────────────────────────────

async function requirePlatformAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Platform admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

// ─── addFeature ──────────────────────────────────────────────────────────────

const addSchema = z
  .object({
    tierId: pgUuidSchema(),
    label: z.string().min(1).max(120),
    included: z.boolean().default(true),
    highlight: z.boolean().default(false),
    category: z.string().min(1).max(40).nullable().optional(),
    valueText: z.string().max(80).nullable().optional(),
  })
  .strict();

export type AddFeatureInput = z.infer<typeof addSchema>;
export type AddFeatureResult =
  | { ok: true; featureId: string }
  | { ok: false; error: string };

export async function addFeature(raw: AddFeatureInput): Promise<AddFeatureResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-features.add.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Place at the bottom of the tier (or, if a category is given, the
  // bottom of that category). We use max(display_order)+1 to avoid
  // colliding with existing rows.
  const maxQ = admin
    .from("product_features")
    .select("display_order")
    .eq("tier_id", input.tierId);
  const maxRes = input.category
    ? await maxQ.eq("category", input.category)
    : await maxQ;
  if (maxRes.error) {
    logServerError("admin-product-features.add.max", maxRes.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const rows = (maxRes.data ?? []) as { display_order: number }[];
  const nextOrder =
    rows.length === 0
      ? 1
      : Math.max(...rows.map((r) => r.display_order)) + 1;

  const insert = await admin
    .from("product_features")
    .insert({
      tier_id: input.tierId,
      label: input.label,
      included: input.included,
      highlight: input.highlight,
      display_order: nextOrder,
      category: input.category ?? null,
      value_text: input.valueText ?? null,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    logServerError("admin-product-features.add.insert", insert.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(PRICING_PATH);
  revalidatePath("/pricing");
  return { ok: true, featureId: (insert.data as { id: string }).id };
}

// ─── updateFeature ───────────────────────────────────────────────────────────

const updateSchema = z
  .object({
    featureId: pgUuidSchema(),
    label: z.string().min(1).max(120).optional(),
    included: z.boolean().optional(),
    highlight: z.boolean().optional(),
    category: z.string().max(40).nullable().optional(),
    valueText: z.string().max(80).nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.label !== undefined ||
      v.included !== undefined ||
      v.highlight !== undefined ||
      v.category !== undefined ||
      v.valueText !== undefined,
    { message: "No fields to update." },
  );

export type UpdateFeatureInput = z.infer<typeof updateSchema>;
export type UpdateFeatureResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateFeature(
  raw: UpdateFeatureInput,
): Promise<UpdateFeatureResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-features.update.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const updates: Record<string, unknown> = {};
  if (input.label !== undefined)     updates.label = input.label;
  if (input.included !== undefined)  updates.included = input.included;
  if (input.highlight !== undefined) updates.highlight = input.highlight;
  if (input.category !== undefined)  updates.category = input.category;
  if (input.valueText !== undefined) updates.value_text = input.valueText;

  const upd = await admin
    .from("product_features")
    .update(updates)
    .eq("id", input.featureId);
  if (upd.error) {
    logServerError("admin-product-features.update.write", upd.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(PRICING_PATH);
  revalidatePath("/pricing");
  return { ok: true };
}

// ─── archiveFeature ──────────────────────────────────────────────────────────

export type ArchiveFeatureResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Hard-delete: features have no audit trail / billing dependence, so
 * we just DELETE the row. (Prices and Discounts archive because Stripe
 * objects depend on them; features stand alone.)
 */
export async function archiveFeature(raw: {
  featureId: string;
}): Promise<ArchiveFeatureResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = z
    .object({ featureId: pgUuidSchema() })
    .strict()
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-features.archive.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const del = await admin
    .from("product_features")
    .delete()
    .eq("id", parsed.data.featureId);
  if (del.error) {
    logServerError("admin-product-features.archive.delete", del.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(PRICING_PATH);
  revalidatePath("/pricing");
  return { ok: true };
}

// ─── reorderFeatures ─────────────────────────────────────────────────────────
// Bumps a feature's display_order up or down by one within its tier.
// Simple "swap with neighbour" — keeps the rest of the list stable.

const reorderSchema = z
  .object({
    featureId: pgUuidSchema(),
    direction: z.enum(["up", "down"]),
  })
  .strict();

export type ReorderFeatureResult =
  | { ok: true; moved: boolean }
  | { ok: false; error: string };

export async function reorderFeature(
  raw: { featureId: string; direction: "up" | "down" },
): Promise<ReorderFeatureResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = reorderSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { featureId, direction } = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-product-features.reorder.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Load this row + its siblings (same tier+category).
  const load = await admin
    .from("product_features")
    .select("id, tier_id, category, display_order")
    .eq("id", featureId)
    .maybeSingle();
  if (load.error || !load.data) {
    return { ok: false, error: "Feature not found." };
  }
  const me = load.data as {
    id: string;
    tier_id: string;
    category: string | null;
    display_order: number;
  };

  // Siblings sharing tier + category, ordered.
  const sibQ = admin
    .from("product_features")
    .select("id, display_order")
    .eq("tier_id", me.tier_id);
  const sibRes = me.category
    ? await sibQ.eq("category", me.category).order("display_order")
    : await sibQ.is("category", null).order("display_order");
  if (sibRes.error) {
    logServerError("admin-product-features.reorder.siblings", sibRes.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const sibs = (sibRes.data ?? []) as { id: string; display_order: number }[];
  const meIdx = sibs.findIndex((s) => s.id === me.id);
  if (meIdx < 0) {
    return { ok: false, error: "Reorder inconsistency." };
  }

  const neighbourIdx =
    direction === "up" ? meIdx - 1 : meIdx + 1;
  if (neighbourIdx < 0 || neighbourIdx >= sibs.length) {
    return { ok: true, moved: false }; // already at the edge
  }
  const neighbour = sibs[neighbourIdx]!;
  const meRow = sibs[meIdx]!;

  // Swap display_order values.
  const updMe = await admin
    .from("product_features")
    .update({ display_order: neighbour.display_order })
    .eq("id", meRow.id);
  if (updMe.error) {
    logServerError("admin-product-features.reorder.up-me", updMe.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const updNb = await admin
    .from("product_features")
    .update({ display_order: meRow.display_order })
    .eq("id", neighbour.id);
  if (updNb.error) {
    logServerError("admin-product-features.reorder.up-nb", updNb.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(PRICING_PATH);
  revalidatePath("/pricing");
  return { ok: true, moved: true };
}
