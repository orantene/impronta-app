import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

export default function TalentInboxPage() {
  // Phase 3.12.2: admin shell renders the full talent inbox via
  // TalentShellClient. This syncer ensures the shell starts on
  // the "messages" page when navigating directly to /talent/inbox.
  return <TalentPageRouteSyncer page="messages" />;
}
