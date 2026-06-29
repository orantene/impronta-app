import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * channel-performance.ts — the Phase F gate-unblocker.
 *
 * When XTENANT_REHOME flips, a hub that SOURCED a lead loses inbox
 * visibility of it the moment an exclusive agency re-homes it (the inbox
 * loaders filter `inquiries.tenant_id`, and after re-home the inquiry's
 * tenant_id is the managing agency, not the originating hub). This
 * read-only rollup restores the hub's line of sight: it keys off
 * `inquiries.source_workspace_id = tenantId` (the originating channel,
 * which is frozen at creation and survives re-home) rather than the
 * mutable `tenant_id`, so a hub always sees the leads it sourced —
 * regardless of which agency now manages them.
 *
 * Reads via the service-role client (same pattern as the other Discover
 * loaders in `_data-bridge/discover.ts`): the source workspace is, by
 * design, no longer the row's `tenant_id` after re-home, so normal
 * tenant-scoped RLS would hide exactly the rows this report exists to
 * surface. Pure aggregation — NO writes.
 *
 * Stays dark/additive: nothing here is wired into a flag-gated path. It
 * simply reads whatever attribution already exists. Pre-flip, with
 * XTENANT_REHOME off, source_workspace_id == tenant_id for most rows and
 * the numbers degrade gracefully to "leads we sourced for ourselves".
 */

/** One source_channel's lead + conversion tally. */
export type ChannelBreakdownRow = {
  /** The inquiry source_channel value (e.g. "hub_site", "discover_shortlist"). */
  channel: string;
  /** Leads sourced through this channel. */
  leads: number;
  /** Of those leads, how many reached a booked/converted state. */
  conversions: number;
};

export type ChannelPerformance = {
  /** The workspace this report is scoped to (the originating channel). */
  tenantId: string;
  /** Total leads where source_workspace_id = tenantId. */
  totalLeads: number;
  /** Total of those leads in a booked/converted state. */
  totalConversions: number;
  /**
   * SUM(channel_referral_cents) across booking_commission_snapshot rows
   * where channel_referral_party_id = tenantId — money this workspace
   * earned as the ORIGINATING channel on bookings now managed elsewhere.
   * Already net (carved from the managing agency's workspace_fee post-payment).
   */
  referralEarnedCents: number;
  /** Distinct bookings that paid this workspace a channel referral. */
  referralBookingCount: number;
  /** Per-channel breakdown, sorted by leads desc. */
  byChannel: ChannelBreakdownRow[];
};

/**
 * Inquiry statuses that count as "converted to a booking". Mirrors the
 * sibling discover-performance page's notion of conversion and adds the
 * later lifecycle states that also imply a booking exists.
 */
const CONVERTED_STATUSES = new Set<string>([
  "converted",
  "booked",
  "approved",
  "offer_pending",
  "in_progress",
]);

function emptyResult(tenantId: string): ChannelPerformance {
  return {
    tenantId,
    totalLeads: 0,
    totalConversions: 0,
    referralEarnedCents: 0,
    referralBookingCount: 0,
    byChannel: [],
  };
}

/**
 * Aggregate channel performance for the workspace that SOURCED the leads.
 *
 * @param tenantId  The originating workspace/hub id. Matched against
 *                  `inquiries.source_workspace_id` (leads) and
 *                  `booking_commission_snapshot.channel_referral_party_id`
 *                  (referral earnings).
 * @param client    Optional pre-built supabase client. Defaults to the
 *                  service-role client (the Discover-loader pattern — the
 *                  source workspace is no longer the row's tenant_id after
 *                  re-home, so tenant-scoped RLS would hide the rows this
 *                  report exists to surface). Injectable for unit tests.
 */
export async function loadChannelPerformance({
  tenantId,
  client,
}: {
  tenantId: string;
  client?: SupabaseClient;
}): Promise<ChannelPerformance> {
  const admin = client ?? createServiceRoleClient();
  if (!admin) return emptyResult(tenantId);

  // ── 1. Leads this workspace sourced, by channel + conversion state ──────
  // Keyed on source_workspace_id (the frozen originating channel), NOT
  // tenant_id — this is the whole point: post-re-home the managing agency
  // owns tenant_id, but the hub still sourced the lead.
  const { data: leadRows, error: leadErr } = await admin
    .from("inquiries")
    .select("status, source_channel")
    .eq("source_workspace_id", tenantId);

  if (leadErr) {
    logServerError("discover.channelPerformance.leads", leadErr);
    return emptyResult(tenantId);
  }

  const channelMap = new Map<string, { leads: number; conversions: number }>();
  let totalLeads = 0;
  let totalConversions = 0;

  for (const row of (leadRows ?? []) as Array<{
    status: string | null;
    source_channel: string | null;
  }>) {
    totalLeads++;
    const channel = row.source_channel ?? "unknown";
    const converted = row.status != null && CONVERTED_STATUSES.has(row.status);
    if (converted) totalConversions++;
    const cur = channelMap.get(channel) ?? { leads: 0, conversions: 0 };
    cur.leads++;
    if (converted) cur.conversions++;
    channelMap.set(channel, cur);
  }

  const byChannel: ChannelBreakdownRow[] = Array.from(channelMap.entries())
    .map(([channel, v]) => ({ channel, leads: v.leads, conversions: v.conversions }))
    .sort((a, b) => b.leads - a.leads || a.channel.localeCompare(b.channel));

  // ── 2. Referral earned as the originating channel ───────────────────────
  // booking_commission_snapshot rows where THIS workspace is the channel
  // referral party. channel_referral_cents is already the net carved
  // amount (post-payment, from the managing agency's workspace_fee). One
  // row per participant; sum across all of them. The Phase C columns live
  // in a dark migration not yet reflected in database.types.ts, so we read
  // a narrow projection and type it locally.
  const { data: snapRows, error: snapErr } = await admin
    .from("booking_commission_snapshot")
    .select("booking_id, channel_referral_cents, channel_referral_party_id")
    .eq("channel_referral_party_id", tenantId);

  let referralEarnedCents = 0;
  const referralBookingIds = new Set<string>();

  if (snapErr) {
    // Non-fatal: the lead rollup is still useful if the referral columns
    // are absent (e.g. on an environment without the Phase C migration).
    logServerError("discover.channelPerformance.referral", snapErr);
  } else {
    for (const row of (snapRows ?? []) as unknown as Array<{
      booking_id: string | null;
      channel_referral_cents: number | null;
      channel_referral_party_id: string | null;
    }>) {
      const cents = row.channel_referral_cents ?? 0;
      if (cents <= 0) continue;
      referralEarnedCents += cents;
      if (row.booking_id) referralBookingIds.add(row.booking_id);
    }
  }

  return {
    tenantId,
    totalLeads,
    totalConversions,
    referralEarnedCents,
    referralBookingCount: referralBookingIds.size,
    byChannel,
  };
}
