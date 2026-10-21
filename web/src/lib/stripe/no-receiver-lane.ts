/**
 * no-receiver-lane.ts - TUL-703. A guest-paid transaction can have NO payout
 * receiver (storefront / instant-book before the talent connects a payout
 * account). The seller of record is then the order line's Profesional, not the
 * workspace. When that talent's default currency is MXN, the charge belongs on
 * the Mexico platform, but ONLY when STRIPE_MX_SECRET_KEY is configured. The
 * workspace lane is never flipped. Every platform decision point (the currency
 * guard and `resolveSellerPlatformForTransaction`) calls this one function, so
 * the guard, the Stripe client, the `stripe_platform` stamp and webhook
 * routing cannot disagree.
 *
 * Accepted risk: if that seller later onboards Connect on the US platform, the
 * funds sit on mx and `decideLegPlatform` HOLDS the payout (never a
 * cross-platform transfer). Ops re-routes by hand.
 * Fails CLOSED on any read error (`ok: false`). No Stripe call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrencyCode } from "@/lib/inquiry/offer-currency";
import { stripeEnv } from "@/lib/stripe/env-keys";

export type NoReceiverLane = { ok: true; lane: "mx" | null } | { ok: false };

const NOT_APPLICABLE: NoReceiverLane = { ok: true, lane: null };

export async function resolveNoReceiverTalentLane(
  sb: SupabaseClient,
  orderId: string | null | undefined,
  opts: { mxConfigured?: boolean; /** TUL-1407: the transaction's workspace; used when the order has no talent line. */ tenantId?: string | null } = {},
): Promise<NoReceiverLane> {
  if (!(opts.mxConfigured ?? !!stripeEnv("STRIPE_MX_SECRET_KEY"))) return NOT_APPLICABLE;
  if (!orderId) return NOT_APPLICABLE;
  // Keyed by the transaction's own order_id, not tenant-scoped: a variable table
  // name keeps the untenanted-from rule quiet (as seller-currency-guard does).
  const linesTable: "order_lines" | "agencies" = "order_lines";
  const { data: lines, error: linesErr } = await sb.from(linesTable).select("talent_profile_id").eq("order_id", orderId);
  if (linesErr) return { ok: false };
  const talents = new Set(
    (Array.isArray(lines) ? (lines as Array<{ talent_profile_id?: string | null }>) : [])
      .map((l) => l.talent_profile_id)
      .filter((id): id is string => !!id),
  );
  // Several talents: no single seller of record, keep the workspace lane.
  if (talents.size > 1) return NOT_APPLICABLE;
  let talentId: string | null = talents.size === 1 ? [...talents][0] : null;
  // TUL-1407: no talent line (a seat / session-picker order) in a talent-owned workspace: the sole owner is the seller.
  if (!talentId && opts.tenantId) {
    const owner = await loadSoloOwnerTalentId(sb, opts.tenantId);
    if (!owner.ok) return { ok: false };
    talentId = owner.talentId;
  }
  if (!talentId) return NOT_APPLICABLE;
  const { data, error } = await sb
    .from("talent_profiles")
    .select("default_currency, stripe_account_id, stripe_account_platform")
    .eq("id", talentId)
    .maybeSingle();
  if (error) return { ok: false };
  if (!data) return NOT_APPLICABLE;
  const t = data as { default_currency?: unknown; stripe_account_id?: string | null; stripe_account_platform?: string | null };
  if (normalizeCurrencyCode(t.default_currency) !== "MXN") return NOT_APPLICABLE;
  // Already connected on the US platform: do not strand the funds on mx.
  if (t.stripe_account_id && t.stripe_account_platform !== "mx") return NOT_APPLICABLE;
  return { ok: true, lane: "mx" };
}

type SoloOwner = { ok: true; talentId: string | null } | { ok: false };

/**
 * A `workspace_type='talent'` workspace with exactly ONE active owner whose person talent profile is the seller.
 * Multi-owner, non-talent or owner-without-profile workspaces return `talentId: null` (current refusal stays).
 * A read error is `ok: false` (fail closed).
 */
async function loadSoloOwnerTalentId(sb: SupabaseClient, tenantId: string): Promise<SoloOwner> {
  const { data: ag, error: agErr } = await sb.from("agencies").select("workspace_type").eq("id", tenantId).maybeSingle();
  if (agErr) return { ok: false };
  if ((ag as { workspace_type?: string } | null)?.workspace_type !== "talent") return { ok: true, talentId: null };
  const { data: owners, error: ownersErr } = await sb
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownersErr) return { ok: false };
  const ids = Array.isArray(owners) ? (owners as Array<{ profile_id?: string | null }>) : [];
  if (ids.length !== 1 || !ids[0].profile_id) return { ok: true, talentId: null };
  const { data: tp, error: tpErr } = await sb
    .from("talent_profiles")
    .select("id")
    .eq("user_id", ids[0].profile_id)
    .eq("profile_kind", "person")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (tpErr) return { ok: false };
  return { ok: true, talentId: (tp as { id?: string } | null)?.id ?? null };
}
