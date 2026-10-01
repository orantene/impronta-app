import "server-only";

import { NextResponse } from "next/server";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { decideRebuildAuth, type RebuildAuthDecision } from "./rebuild-entry";

/** Shared auth + admin client + JSON parse for both demo routes. */
export async function runDemoRoute(
  request: Request,
  tag: string,
  handle: (
    admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
    body: unknown,
    auth: Extract<RebuildAuthDecision, { allow: true }>,
  ) => Promise<Response>,
): Promise<Response> {
  const authorization = request.headers.get("authorization");
  let userId: string | null = null;
  let admin = false;
  if (!authorization) {
    const session = await getCachedActorSession();
    userId = session.user?.id ?? null;
    admin = !!session.user && isPlatformAdmin(session.profile);
  }
  const auth = decideRebuildAuth({ secret: process.env.CRON_SECRET, authorization, userId, isAdmin: admin });
  if (!auth.allow) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const db = createServiceRoleClient();
  if (!db) return NextResponse.json({ ok: false, error: "server_configuration" }, { status: 500 });
  try {
    return await handle(db, body, auth);
  } catch (err) {
    logServerError(tag, err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
