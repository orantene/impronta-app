import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";
import { ClientsInitialSeed } from "./ClientsInitialSeed";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentClients } from "@/lib/talent/clients-actions";

export const dynamic = "force-dynamic";

/** Start the list on the server so the client does not fetch after mount. */
async function prefetchClients() {
  try {
    const session = await getCachedActorSession();
    const admin = createServiceRoleClient();
    if (!session.user || !admin) return null;
    const { data } = await admin
      .from("talent_profiles")
      .select("id")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();
    const talentId = (data?.id as string | undefined) ?? null;
    if (!talentId) return null;
    return { talentId, initial: await loadTalentClients(talentId) };
  } catch {
    return null; // the client falls back to its own fetch
  }
}

export default async function PlatformTalentClientsPage() {
  const pre = await prefetchClients();
  return (
    <>
      {pre && <ClientsInitialSeed talentId={pre.talentId} initial={pre.initial} />}
      <TalentPageRouteSyncer page="clients" />
    </>
  );
}
