// D10 — Generate a public share URL for a shortlist.
//
// POST /api/discover/shortlists/:id/share
//   → 200 { url, expiresAt }
//   → 401 unauthenticated
//   → 403 not your shortlist
//   → 404 shortlist not found
//
// Returns a freshly-minted token URL pointing at /share/shortlist/<token>.
// Tokens are owner-bound (issuerUserId = the calling client) and TTL-revoked
// (no DB rotation column yet — see lib/discover/shortlist-share-token.ts
// for rationale). Each POST mints a new token.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  signShortlistToken,
  buildShortlistShareUrl,
} from "@/lib/discover/shortlist-share-token";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  // Ownership check — only the shortlist owner can issue share links.
  const { data: shortlist, error } = await admin
    .from("client_shortlists")
    .select("id, client_user_id, name")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logServerError("api.discover.shortlists.share", error);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  if (!shortlist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ((shortlist as { client_user_id: string }).client_user_id !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const signed = signShortlistToken({
    shortlistId: id,
    issuerUserId: session.user.id,
  });

  const baseUrl =
    process.env.PITCH_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://tulala.digital";
  const url = buildShortlistShareUrl(signed.token, baseUrl);

  return NextResponse.json({
    url,
    expiresAt: signed.expiresAt.toISOString(),
  });
}
