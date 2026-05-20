import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/action-guards";
import { getResolverMetricsSnapshot } from "@/lib/server-actions/admin-taxonomy";

/**
 * GET /platform/admin/operations/engine
 * Super-admin diagnostic endpoint — returns the in-process resolver metrics
 * snapshot. Counters reset on process restart; not durable.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }
  return NextResponse.json(await getResolverMetricsSnapshot());
}
