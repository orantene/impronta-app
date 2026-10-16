import { NextResponse, type NextRequest } from "next/server";

import { memorySlidingWindow } from "@/lib/rate-limit-kv-tulala";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  PROMO_COOKIE, PROMO_SESSION_COOKIE, PROMO_VIA_COOKIE, promoCookieOptions, sessionHash,
} from "@/lib/promos/share/cookies";
import { handlePromoEvent, type PromoEventDeps } from "@/lib/promos/share/events";
import { promoLinkSecret, verifyPersonalToken } from "@/lib/promos/share/token";

/**
 * POST /api/promos/event  { promoId, kind: view | link_open | share, via?, t? }
 *
 * The only writer of promo_events (service role). Rate limited per cookie
 * session + IP. A `link_open` also pins the promo for 7 days in an httpOnly
 * cookie (promo id only) and records the first-touch source tag.
 */

// In-memory per instance: caps a scripted client; the table is advisory analytics, not money.
const limiter = memorySlidingWindow(30, 60_000);

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const existingSid = req.cookies.get(PROMO_SESSION_COOKIE)?.value;
  const sid = existingSid && existingSid.length <= 64 ? existingSid : crypto.randomUUID();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;

  const deps: PromoEventDeps = {
    async loadPromo(promoId) {
      const { data, error } = await admin
        .from("tenant_promo_codes")
        .select("id, tenant_id, is_draft, archived_at, audience, customer_id")
        .eq("id", promoId)
        .maybeSingle();
      if (error) { logServerError("promos.share/event-load", error); return null; }
      if (!data) return null;
      const r = data as {
        id: string; tenant_id: string; is_draft: boolean | null; archived_at: string | null;
        audience: string | null; customer_id: string | null;
      };
      return {
        id: r.id, tenant_id: r.tenant_id, is_draft: !!r.is_draft, archived_at: r.archived_at,
        personal: r.audience === "one_client" || !!r.customer_id,
      };
    },
    verifyToken: (token, promoId) => verifyPersonalToken(token, promoLinkSecret(), promoId),
    async allow(key) {
      try { return (await limiter.limit(key)).success; } catch { return true; }
    },
    async insert(row) {
      const { error } = await admin.from("promo_events").insert(row);
      if (error) { logServerError("promos.share/event-insert", error); return false; }
      return true;
    },
  };

  const out = await handlePromoEvent(deps, {
    promoId: body.promoId, kind: body.kind, via: body.via, token: body.t,
    sessionHash: sessionHash(sid), ip,
  });
  if (!out.ok) return NextResponse.json({ ok: false }, { status: out.status });

  const res = NextResponse.json({ ok: true });
  if (!existingSid) res.cookies.set(PROMO_SESSION_COOKIE, sid, promoCookieOptions);
  if (out.applyCookie) {
    res.cookies.set(PROMO_COOKIE, out.promoId, promoCookieOptions);
    // First touch wins: only set the source when none is stored yet.
    if (out.via && !req.cookies.get(PROMO_VIA_COOKIE)?.value) {
      res.cookies.set(PROMO_VIA_COOKIE, out.via, promoCookieOptions);
    }
  }
  return res;
}
