import { PublicPageBootstrapSeed } from "@/components/talent/site/PublicPageBootstrapSeed";
import { loadPublicPageBootstrap } from "@/lib/talent-site/server/public-page-bootstrap.server";
import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

export default async function PlatformTalentSitePage() {
  // First-paint data loads here, in parallel, so the client mounts with it
  // instead of queueing server actions (a waterfall).
  const bundle = await loadPublicPageBootstrap();
  return (
    <>
      <PublicPageBootstrapSeed bundle={bundle} />
      <TalentPageRouteSyncer page="public-page" />
    </>
  );
}
