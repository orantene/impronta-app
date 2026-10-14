import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { emitNotification } from "@/lib/notifications/emit";
import { loadUsage } from "@/lib/promos/repo";
import { loadPromoResults } from "@/lib/promos/results/load.server";
import { planPromoNotifications, type PromoNotifyInput } from "@/lib/promos/notify/plan";

/**
 * Scheduled job: talent promo notifications (design L10): 2 left, sold out,
 * expires tomorrow, spot back. Bundles 3+ per person into one row.
 *
 * Safe to run hourly: every row has a deterministic origin_event_id and
 * emitNotification is unique on (origin_event_id, user_id).
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/promo-notifications
 *
 * Wanted in `vercel.json` (NOT added here): { "path": "/api/cron/promo-notifications", "schedule": "0 * * * *" }
 */
export const dynamic = "force-dynamic";

type LivePromoRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  label: string | null;
  code: string | null;
  max_redemptions: number | null;
  ends_at: string | null;
  starts_at: string | null;
  created_at: string;
  currency: string | null;
};

const RELEASE_LOOKBACK_MS = 2 * 3_600_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/promo-notifications", "CRON_SECRET env var not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const now = new Date();
  try {
    // Capped promos that are live. Sold-out promos stay live (is_active) until archived.
    const { data, error } = await admin
      .from("tenant_promo_codes")
      .select("id, tenant_id, name, label, code, max_redemptions, ends_at, starts_at, created_at, currency")
      .eq("is_active", true)
      .eq("is_draft", false)
      .eq("is_paused", false)
      .is("archived_at", null)
      .not("max_redemptions", "is", null);
    if (error) {
      logServerError("cron/promo-notifications.promos", error);
      return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
    }
    const promos = ((data ?? []) as unknown as LivePromoRow[]).filter(
      (p) => !p.ends_at || new Date(p.ends_at).getTime() > now.getTime() - 86_400_000,
    );
    if (promos.length === 0) return NextResponse.json({ ok: true, scanned: 0, emitted: 0 });

    const ids = promos.map((p) => p.id);
    const usage = await loadUsage(admin, ids, null, now);
    const bundle = await loadPromoResults(admin, promos.map((p) => ({ id: p.id, max_uses: p.max_redemptions, starts_at: p.starts_at, created_at: p.created_at })), now);
    if (!usage || !bundle) return NextResponse.json({ error: "Sweep failed" }, { status: 500 });

    const since = new Date(now.getTime() - RELEASE_LOOKBACK_MS).toISOString();
    const { data: rel } = await admin
      .from("tenant_promo_redemptions")
      .select("promo_code_id, voided_at, hold_expires_at, status")
      .in("promo_code_id", ids)
      .in("status", ["voided", "released"]);
    const released = new Map<string, string>();
    for (const r of (rel ?? []) as { promo_code_id: string; voided_at: string | null; hold_expires_at: string | null }[]) {
      const at = r.voided_at ?? r.hold_expires_at;
      if (!at || at < since) continue;
      const prev = released.get(r.promo_code_id);
      if (!prev || at > prev) released.set(r.promo_code_id, at);
    }

    const tenantIds = [...new Set(promos.map((p) => p.tenant_id))];
    const { data: mem } = await admin
      .from("agency_memberships")
      .select("tenant_id, profile_id")
      .in("tenant_id", tenantIds)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);
    const recipients = new Map<string, string[]>();
    for (const m of (mem ?? []) as { tenant_id: string; profile_id: string | null }[]) {
      if (m.profile_id) recipients.set(m.tenant_id, [...(recipients.get(m.tenant_id) ?? []), m.profile_id]);
    }

    const inputs: PromoNotifyInput[] = promos.map((p) => {
      const r = bundle.results[p.id];
      return {
        promoId: p.id,
        tenantId: p.tenant_id,
        name: p.name ?? p.label ?? p.code ?? "Promo",
        maxUses: p.max_redemptions,
        used: usage[p.id]?.used ?? 0,
        endsAtIso: p.ends_at,
        lastSpotReleasedAtIso: released.get(p.id) ?? null,
        result: r ? { bookings: r.bookings, earnedCents: r.earnedCents, currency: (p.currency ?? "MXN").toUpperCase() } : null,
        recipientUserIds: recipients.get(p.tenant_id) ?? [],
        isLive: !p.ends_at || new Date(p.ends_at).getTime() > now.getTime(),
      };
    });

    const planned = planPromoNotifications(inputs, now, "es");
    for (const n of planned) {
      await emitNotification({
        userId: n.userId,
        tenantId: n.tenantId,
        kind: n.kind,
        surface: "talent",
        title: n.title,
        body: n.body,
        originEventId: n.originEventId,
        originKind: n.originKind,
        targetPayload: n.targetPayload,
      });
    }
    return NextResponse.json({ ok: true, scanned: promos.length, emitted: planned.length });
  } catch (err) {
    logServerError("cron/promo-notifications", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
