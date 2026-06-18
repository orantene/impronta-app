/**
 * rollout.ts — WS-D D3 staged template rollout (PURE).
 *
 * A super-admin can publish a `builder_templates` row to only a FRACTION of
 * agencies (a canary), or to an explicit allow / deny list, before ramping to
 * 100%. The live "+" gallery shows a published template to a tenant only when
 * `templateRolloutAllowed(row, tenantId)` returns true.
 *
 * This module is PURE (no I/O, no "use server", no Supabase) so it can be unit
 * tested in the node runner and called from both the gallery merge gate and any
 * future preview. The decision order is FROZEN, and `deterministicBucket` uses a
 * FROZEN FNV-1a hash so a refactor can never silently re-bucket live tenants —
 * see rollout.test.ts for the golden values that pin the algorithm.
 *
 * Decision order (first match wins):
 *   1. tenantId == null            ⇒ true   (platform / Lab authors + any
 *                                             context without a tenant ALWAYS
 *                                             see everything — never hide from
 *                                             authors).
 *   2. tenant ∈ tenant_denylist    ⇒ false  (deny beats allow + the bucket).
 *   3. tenant ∈ tenant_allowlist   ⇒ true   (bypass the % bucket).
 *   4. else                        ⇒ deterministicBucket(tenantId, row.id)
 *                                       < rollout_percentage.
 *
 * `rollout_percentage` null/undefined ⇒ treated as 100 (fully rolled out) for
 * back-compat with rows that predate the column.
 */

/** The minimal rollout-relevant shape of a `builder_templates` row. */
export interface TemplateRolloutFields {
  id: string;
  rollout_percentage?: number | null;
  tenant_allowlist?: string[] | null;
  tenant_denylist?: string[] | null;
}

/**
 * FNV-1a (32-bit) hash of `input`. FROZEN — do not change the seed, the prime,
 * or the byte iteration: it determines which tenants are in the canary bucket,
 * and a change would silently re-bucket every tenant on every partially-rolled
 * template. Pinned by golden values in rollout.test.ts.
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5; // 2166136261 — FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (FNV prime), via shifts to stay inside 32 bits.
    hash =
      (hash +
        ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>>
      0;
  }
  return hash >>> 0;
}

/**
 * Deterministic bucket ∈ [0, 100) for a (tenantId, rowId) pair. Stable across
 * processes and deploys — the same tenant always lands in the same bucket for a
 * given template, so ramping the percentage only ever ADDS tenants (it never
 * shuffles who is already in). FROZEN algorithm — see fnv1a32.
 */
export function deterministicBucket(tenantId: string, rowId: string): number {
  return fnv1a32(`${tenantId}:${rowId}`) % 100;
}

/**
 * Deterministic position ∈ [0, 1) for a (seed, salt) pair — the SAME frozen
 * FNV-1a hash as {@link deterministicBucket}, just at full 2^32 resolution
 * instead of folded to 100 integer buckets. Used by the A/B engine's weighted
 * multi-arm split, where coarse 100-buckets would quantize a weight like 33.3%.
 *
 * Crucially CONSISTENT with `deterministicBucket`: since both derive from the
 * same `fnv1a32(`${a}:${b}`)`, `deterministicPosition(s, salt) < 0.5` iff
 * `deterministicBucket(s, salt) < 50` is NOT guaranteed (the fold loses low
 * bits), so the A/B engine pins its 2-arm-even path on `deterministicBucket`
 * (unchanged) and only uses this finer position for the WEIGHTED / N>2 path.
 * FROZEN algorithm — see fnv1a32.
 */
export function deterministicPosition(seed: string, salt: string): number {
  // Divide by 2^32 so the result is in [0, 1). The hash is already an unsigned
  // 32-bit int, so the max value (2^32 - 1) maps to just under 1.
  return fnv1a32(`${seed}:${salt}`) / 0x100000000;
}

/**
 * Whether the given tenant may see this template under its staged-rollout rule.
 * PURE. See the module header for the frozen decision order.
 */
export function templateRolloutAllowed(
  row: TemplateRolloutFields,
  tenantId: string | null | undefined,
): boolean {
  // 1. No tenant context (platform / Lab authors) ⇒ never hide.
  if (tenantId == null) return true;

  // 2. Denylist beats everything else.
  if (row.tenant_denylist && row.tenant_denylist.includes(tenantId)) {
    return false;
  }

  // 3. Allowlist bypasses the percentage bucket.
  if (row.tenant_allowlist && row.tenant_allowlist.includes(tenantId)) {
    return true;
  }

  // 4. Percentage bucket. Null/undefined ⇒ 100 (fully rolled out, back-compat).
  const percentage = row.rollout_percentage ?? 100;
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  return deterministicBucket(tenantId, row.id) < percentage;
}
