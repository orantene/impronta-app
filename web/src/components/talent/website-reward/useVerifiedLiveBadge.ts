"use client";

/**
 * TUL-818 · one source of truth for every "your website is live" line.
 *
 * The top pill reads the verified state (published row AND the address answered
 * with the talent's page). Today's quality card and the profile card read the
 * published flag alone, so they said "live" while the pill said "checking".
 * This hook gives them the same answer. Pure resolver below, hook on top.
 */

import { useEffect, useState } from "react";

import { loadMySiteLiveVerifiedAction } from "@/lib/talent-site/server/site-live-verified";
import { liveBadgeState, type LiveBadgeState } from "@/lib/onboarding/live-badge";

/**
 * `verified`: undefined = the check has not answered yet · true = address answered ·
 * false = published but not answering · null = no personal site row to check
 * (workspace site, no session): nothing to contradict, so the published flag stands.
 */
export function resolveVerifiedLiveBadge(input: { published: boolean; verified: boolean | null | undefined }): LiveBadgeState {
  if (!input.published) return "not_live";
  if (input.verified === null) return "live";
  return liveBadgeState({ published: true, verified: input.verified === undefined ? null : input.verified });
}

export function useVerifiedLiveBadge(published: boolean): LiveBadgeState {
  const [verified, setVerified] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    if (!published) return;
    let gone = false;
    loadMySiteLiveVerifiedAction()
      .then((v) => {
        if (!gone) setVerified(v);
      })
      .catch(() => {
        if (!gone) setVerified(false);
      });
    return () => {
      gone = true;
    };
  }, [published]);
  return resolveVerifiedLiveBadge({ published, verified });
}
