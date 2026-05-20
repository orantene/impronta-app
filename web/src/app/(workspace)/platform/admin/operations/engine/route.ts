import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/action-guards";
import { getResolverMetricsSnapshot } from "@/lib/server-actions/admin-taxonomy";

/**
 * GET /platform/admin/operations/engine
 * Super-admin diagnostic endpoint — returns the in-process resolver metrics
 * snapshot. Counters reset on process restart; not durable.
 *
 * `requireAdmin` from action-guards checks `app_role === 'super_admin'` —
 * same scope as `isPlatformAdmin`, just a different module. Both work; the
 * catalog export routes use isPlatformAdmin for consistency with their
 * shared `getCachedActorSession` flow.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }
  const snapshot = await getResolverMetricsSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      // Metrics are volatile (mutate on every resolver call). Never cache.
      "Cache-Control": "no-store",
    },
  });
}
