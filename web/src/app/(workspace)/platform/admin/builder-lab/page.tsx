// Platform HQ · Builder Lab (entry point for WS5's Platform Builder Lab).
//
// Server Component — platform-admin gated by the (workspace)/platform/admin
// layout (super_admin → 404 otherwise). Resolves the Tulala hub tenant as the
// default builder scope, then mounts the standalone `BuilderLabShell` (a client
// component that needs only props — no AdminShell context). Persistence inside
// the Lab is EPHEMERAL; the only durable output is a `builder_templates` row via
// the WS2 registry actions.

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  BuilderLabHeader,
  BuilderLabNoTenant,
} from "@/components/builder-lab/builder-lab-intro";
import { BuilderLabShell } from "@/components/builder-lab/builder-lab-shell";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PlatformBuilderLabPage() {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();

  // The Builder Lab is a platform authoring tool; scope the editor mount to the
  // Tulala hub tenant (the platform's own workspace). Plan is forced to the
  // highest tier so the operator sees every plan-gated gallery template.
  let tenantId: string | null = null;
  const admin = createServiceRoleClient();
  if (admin) {
    const { data } = await admin
      .from("agencies")
      .select("id")
      .eq("kind", "hub")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    tenantId = data?.id ?? null;
  }

  return (
    <>
      <BuilderLabHeader />
      {tenantId ? (
        <BuilderLabShell tenantId={tenantId} workspacePlan="network" locale="en" />
      ) : (
        <BuilderLabNoTenant />
      )}
    </>
  );
}
