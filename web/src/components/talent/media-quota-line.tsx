"use client";

/**
 * media-quota-line.tsx — "42 of 150 photos used on your plan." (B13)
 *
 * WHY THIS EXISTS. The talent photo cap was invisible everywhere until it
 * refused an upload: no surface showed a fraction, and the single 80% warning
 * in the builder picker fired only AFTER a successful upload. A limit you meet
 * only at the moment it stops you reads as a bug, not as a plan.
 *
 * Three mount points, one sentence:
 *   • the builder media picker, from the quota the library payload already
 *     returns (pass `quota` — no fetch);
 *   • the talent's own Photos & video section (pass `talentProfileId`);
 *   • the workspace Media header when staff filter to one talent (pass
 *     `talentProfileId` + `talentName`, which switches the copy to third
 *     person). Staff are the other party who hits this cap — on someone
 *     else's behalf, when they bulk-assign — and they only ever saw it as a
 *     refusal.
 *
 * ONE COUNT PER MOUNT. The fetching form asks `?quotaOnly=1`, which skips the
 * library read and the usability RPC behind the same auth gate. Nothing here
 * is ever per tile.
 *
 * Lives outside `components/admin/shell/**` (frozen against new inline styles)
 * like the other media-ownership panels. Tailwind admin-* tokens only.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  formatMediaQuotaLine,
  mediaQuotaToneClass,
  type MediaQuotaSnapshot,
} from "@/lib/media/quota-line";

export function TalentMediaQuotaLine({
  talentProfileId,
  talentName,
  quota: providedQuota,
  className,
}: {
  /** Omit when passing `quota` — the component then never fetches. */
  talentProfileId?: string;
  /** Pass to read someone else's quota in the third person. */
  talentName?: string | null;
  /** A snapshot the caller already loaded. Takes precedence over fetching. */
  quota?: MediaQuotaSnapshot | null;
  className?: string;
}) {
  const t = useT();
  const [fetched, setFetched] = useState<MediaQuotaSnapshot | null>(null);
  const shouldFetch = providedQuota === undefined && !!talentProfileId;

  useEffect(() => {
    if (!shouldFetch || !talentProfileId) return;
    let cancelled = false;
    setFetched(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/talent/media/library?talentProfileId=${encodeURIComponent(
            talentProfileId,
          )}&quotaOnly=1`,
          { cache: "no-store" },
        );
        const body = await res.json();
        if (cancelled || !res.ok || !body?.ok) return;
        setFetched((body.quota as MediaQuotaSnapshot | null) ?? null);
      } catch {
        // A quota we cannot read renders as nothing. Never a guessed number:
        // "0 of 150" in front of a talent with 90 photos is worse than silence.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, talentProfileId]);

  const line = formatMediaQuotaLine(t, shouldFetch ? fetched : providedQuota, talentName);
  if (!line) return null;

  return (
    <div
      className={`text-[11.5px] leading-snug ${mediaQuotaToneClass(line.tone)} ${className ?? ""}`}
    >
      {line.text}
    </div>
  );
}
