import { TalentInboxPrimer } from "@/components/messages-v5/shell/TalentInboxPrimer";
import type { TalentInboxResult } from "@/components/messages-v5/shell/talent-inbox-fetch";
import { messagingTalentLoadInbox } from "@/lib/server-actions/messaging-talent";

import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

export default function PlatformTalentInboxPage() {
  // Server-start the first inbox read (same reader and session guard as
  // GET /api/talent/inbox). Not awaited: the shell paints at once and its
  // first load streams in with this promise instead of a second request.
  const initial: Promise<TalentInboxResult> = messagingTalentLoadInbox({ locationSlug: "all", filter: "all" }).catch(
    () => ({ ok: false as const, reason: "unavailable" as const }),
  );
  return (
    <>
      <TalentInboxPrimer initial={initial} />
      <TalentPageRouteSyncer page="messages" />
    </>
  );
}
