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

export type NoReceiverLane = { ok: true; lane: "mx" | null } | { ok: false };

const NOT_APPLICABLE: NoReceiverLane = { ok: true, lane: null };

export async function resolveNoReceiverTalentLane(
  sb: SupabaseClient,
  orderId: string | null | undefined,
  opts: { mxConfigured?: boolean } = {},
): Promise<NoReceiverLane> {
  if (!(opts.mxConfigured ?? !!process.env.STRIPE_MX_SECRET_KEY)) return NOT_APPLICABLE;
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
  // Zero or several talents: no single seller of record, keep the workspace lane.
  if (talents.size !== 1) return NOT_APPLICABLE;
  const [talentId] = [...talents];
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
