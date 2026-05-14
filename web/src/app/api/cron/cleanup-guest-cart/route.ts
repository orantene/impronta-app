import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Scheduled job: clean up guest cart/favorites older than 30 days.
 *
 * Deletes saved_talent rows where client_user_id IS NULL and created_at < now() - 30 days.
 * These are pre-submit guest favorites and cart items. Pending guest inquiries (which
 * have guest_session_id set in the inquiries table) are not affected — only the
 * saved_talent cleanup happens here.
 *
 * Auth (audit H12): require Authorization header bearer token.
 * Vercel's cron infrastructure sends `Authorization: Bearer ${CRON_SECRET}`
 * automatically when CRON_SECRET is set in project env.
 *
 * Configure in `vercel.json`:
 *
 * ```json
 * {
 *   "crons": [
 *     { "path": "/api/cron/cleanup-guest-cart", "schedule": "0 4 * * *" }
 *   ]
 * }
 * ```
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError(
      "cron/cleanup-guest-cart",
      "CRON_SECRET env var not set; refusing to run",
    );
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    // Delete guest cart/favorites older than 30 days.
    // saved_talent with client_user_id IS NULL are keyed off guest_session_id only.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // First, count how many we're about to delete (for observability).
    const { count: countBefore, error: countError } = await supabase
      .from("saved_talent")
      .select("id", { count: "exact", head: true })
      .eq("client_user_id", null)
      .lt("created_at", thirtyDaysAgo.toISOString());

    if (countError) {
      logServerError("cron/cleanup-guest-cart", countError);
      return NextResponse.json(
        {
          ok: false,
          error: countError.message,
        },
        { status: 500 },
      );
    }

    // Now delete them.
    const { error: deleteError } = await supabase
      .from("saved_talent")
      .delete()
      .eq("client_user_id", null)
      .lt("created_at", thirtyDaysAgo.toISOString());

    if (deleteError) {
      logServerError("cron/cleanup-guest-cart", deleteError);
      return NextResponse.json(
        {
          ok: false,
          error: deleteError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: countBefore ?? 0,
      cleanedAt: new Date().toISOString(),
      thirtyDaysAgoThreshold: thirtyDaysAgo.toISOString(),
    });
  } catch (error) {
    logServerError("cron/cleanup-guest-cart", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
