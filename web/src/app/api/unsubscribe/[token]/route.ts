import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { applyCategoryUnsubscribe } from "@/lib/notifications/unsubscribe";

/**
 * RFC 8058 one-click unsubscribe endpoint — the target of the
 * `List-Unsubscribe` header (paired with `List-Unsubscribe-Post:
 * List-Unsubscribe=One-Click`).
 *
 *   POST  — the mail provider (Gmail/Yahoo) hits this directly, no human in
 *           the loop. Apply the unsubscribe immediately and always return 200
 *           so the client marks the action complete. The token is the only
 *           credential, so we run under the service-role client.
 *   GET   — if a human follows the header URL in a browser, bounce them to the
 *           branded confirm page rather than mutating on a bare navigation.
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const cat = new URL(request.url).searchParams.get("cat");

  const admin = createServiceRoleClient();
  if (admin) {
    // Best-effort: a failure still returns 200 (RFC 8058 expects success), and
    // applyCategoryUnsubscribe logs its own errors.
    await applyCategoryUnsubscribe(admin, token, cat);
  }

  return new NextResponse(null, { status: 200 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const { origin, searchParams } = new URL(request.url);
  const cat = searchParams.get("cat") ?? "";
  return NextResponse.redirect(
    `${origin}/unsubscribe/${encodeURIComponent(token)}?cat=${encodeURIComponent(cat)}`,
  );
}
