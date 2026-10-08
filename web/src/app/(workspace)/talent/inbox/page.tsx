import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

// The list is read by the Messages shell through GET /api/talent/inbox, the
// SAME read Today and the bell use. A server-started first read used to be
// streamed in here as a promise (#2574); on production it painted an empty
// list while the counts (read over GET) said 2. One reader, one rule.
export default function PlatformTalentInboxPage() {
  return <TalentPageRouteSyncer page="messages" />;
}
