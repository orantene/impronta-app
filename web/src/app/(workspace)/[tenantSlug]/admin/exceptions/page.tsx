/**
 * The Exceptions inbox.
 *
 * WHY THIS IS A PAGE AND NOT A LOG. Everything on this screen was already
 * knowable — six tables, six queries, a psql prompt and someone who knows
 * which tables. That is the definition of a thing nobody looks at, and the
 * consequence is not abstract: a mint shortfall means a buyer is standing at a
 * door with a receipt and no ticket, and today the first person to notice is
 * the buyer.
 *
 * ONE QUEUE, SORTED BY HARM. The six sources are merged and ranked by whether
 * they can still hurt someone rather than by which table they came from — see
 * `lib/exceptions/model.ts`, where the ranking lives and is tested.
 *
 * THE SCREEN NEVER RENDERS AN EMPTY QUEUE IT IS NOT SURE ABOUT. When a source
 * fails to read, its name is shown above the list. An exceptions inbox that
 * says "all clear" because a query errored is worse than no inbox: it is the
 * silent-failure class this whole surface exists to end, reproduced in the one
 * place staff will trust.
 */

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadExceptions } from "@/lib/exceptions/read";
import { ExceptionsClient } from "./exceptions-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function ExceptionsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  const session = await getCachedActorSession();
  if (!session.user) notFound();
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const admin = createServiceRoleClient();
  if (!admin) {
    return (
      <ExceptionsClient
        rows={[]}
        summary={{
          total: 0,
          bySeverity: { critical: 0, high: 0, normal: 0 },
          byOwner: { money: 0, door: 0, coordination: 0, operations: 0 },
          resumable: 0,
        }}
        unavailable={["Every source"]}
      />
    );
  }

  const load = await loadExceptions(admin, { tenantId: scope.tenantId, tenantSlug });

  return (
    <ExceptionsClient
      rows={load.rows}
      summary={load.summary}
      unavailable={load.unavailable}
    />
  );
}
