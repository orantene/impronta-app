import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

// Promos (TUL-936): the page body lives in the shell router (talent.tsx,
// case "promos") like every other talent surface.
export default function PlatformTalentPromosPage() {
  return <TalentPageRouteSyncer page="promos" />;
}
