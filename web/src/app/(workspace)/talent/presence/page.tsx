import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

/** Alias of My presence. The three tabs live on the public-page screen. */
export default function PlatformTalentPresencePage() {
  return <TalentPageRouteSyncer page="public-page" />;
}
