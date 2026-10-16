import "server-only";

/**
 * Platform Admin (super_admin page) read-only view: this month's booking-assistant
 * spend per talent versus the plan cap. Same query shape and 5000-row limit as the
 * per-talent spend loader in turn.server.ts; no writes, no paid calls.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { sumBookingAssistantSpendCents, utcMonthStartIso } from "./spend";
import { bookingAssistantUsage, type BookingAssistantUsage } from "./usage-format";

export type BookingAssistantUsageRow = {
  talentProfileId: string;
  displayName: string;
  planKey: string | null;
  usage: BookingAssistantUsage;
};

type LogRow = { context_jsonb?: { cost_usd?: unknown; talent_profile_id?: unknown } | null };

export async function loadBookingAssistantUsageByTalent(): Promise<BookingAssistantUsageRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("cms_ai_usage_log")
    .select("context_jsonb, ok")
    .eq("ok", true)
    .gte("created_at", utcMonthStartIso(new Date()))
    .contains("context_jsonb", { feature: "booking_assistant" })
    .limit(5000);
  if (error) {
    logServerError("booking-assistant/admin-usage", error);
    return [];
  }
  const byTalent = new Map<string, LogRow[]>();
  for (const row of (data ?? []) as LogRow[]) {
    const id = row.context_jsonb?.talent_profile_id;
    if (typeof id !== "string" || !id) continue;
    const list = byTalent.get(id) ?? [];
    list.push(row);
    byTalent.set(id, list);
  }
  if (byTalent.size === 0) return [];
  const ids = [...byTalent.keys()];
  const { data: profiles, error: profErr } = await admin
    .from("talent_profiles")
    .select("id, display_name, talent_plan_key")
    .in("id", ids);
  if (profErr) logServerError("booking-assistant/admin-usage-profiles", profErr);
  const meta = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name?: string | null; talent_plan_key?: string | null }>).map(
      (p) => [p.id, p],
    ),
  );
  return ids
    .map((id) => {
      const p = meta.get(id);
      const planKey = p?.talent_plan_key ?? null;
      return {
        talentProfileId: id,
        displayName: p?.display_name?.trim() || id.slice(0, 8),
        planKey,
        usage: bookingAssistantUsage(sumBookingAssistantSpendCents(byTalent.get(id) ?? []), planKey),
      };
    })
    .sort((a, b) => b.usage.usedCents - a.usage.usedCents);
}
