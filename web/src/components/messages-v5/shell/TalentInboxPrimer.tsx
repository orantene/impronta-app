"use client";

import { primeTalentInbox, type TalentInboxResult } from "./talent-inbox-fetch";

/**
 * Hands the server's first inbox read to the client reader. The inbox page
 * starts `messagingTalentLoadInbox` on the server without awaiting it and
 * streams the promise here; registering it during render (before any effect
 * runs) means the Messages shell's first load awaits that read instead of
 * opening a second request after hydration. Renders nothing.
 */
export function TalentInboxPrimer({ initial }: { initial: Promise<TalentInboxResult> }) {
  primeTalentInbox("all", initial);
  return null;
}
