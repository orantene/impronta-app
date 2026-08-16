"use client";

import { useEffect, useState } from "react";

import { getUnpublishableSkillsForTenant } from "@/lib/server-actions/admin-talent-skills";

/**
 * UnpublishableServicesNotice — stale-draft reconciliation, shown at OPEN time.
 *
 * Services already on this profile that the workspace cannot publish, named the
 * moment the Services panel loads instead of after a save. Before this, the only
 * signal was a red banner AFTER saving that named a service with no way to find
 * which row it meant — the shape of the 2026-08 incident, where one stale entry
 * blocked every save on a profile.
 *
 * Deliberately NOT an error: the services save normally (see
 * `reportProfileShellSaveWarnings`); they just will not appear publicly. The
 * copy has to say that, or an operator reads it as another failure.
 *
 * Own file, className-only: `components/admin/shell/**` freezes NEW inline
 * `style={{…}}` (ratchet/no-new-inline-style) and skill-slot-panel.tsx sits
 * against the 800-line cap, so the markup belongs here rather than inline.
 */
export function UnpublishableServicesNotice({
  talentProfileId,
  enabled,
  t,
}: {
  talentProfileId: string;
  /** Staff-only. Talent editing their own profile don't manage tenant settings. */
  enabled: boolean;
  /** Translator from the panel's `useDashboardText()` copy bundle. */
  t: (key: string) => string;
}) {
  const [items, setItems] = useState<{ term_id: string; label: string }[]>([]);

  useEffect(() => {
    if (!enabled || !talentProfileId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    // Advisory only: the action swallows its own failures, and anything that
    // escapes is discarded here. This notice must never keep Services from
    // rendering.
    void getUnpublishableSkillsForTenant({ talent_profile_id: talentProfileId })
      .then((r) => {
        if (!cancelled) setItems(r.unpublishable);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId, enabled]);

  if (items.length === 0) return null;
  return (
    <div
      data-unpublishable-services-notice
      className="mb-3.5 rounded-[10px] border border-amber-600/25 bg-amber-500/10 px-3 py-2.5 text-xs"
    >
      <div className="font-semibold text-admin-ink">
        {t("Some services here can't be published on this site")}
      </div>
      <div className="mt-0.5 text-[11px] text-admin-ink/60">
        {items.map((i) => i.label).join(" · ")}
        {" — "}
        {t(
          "these stay on the profile and save normally, but won't appear publicly until the category is enabled in Settings → Roster & profile fields → Categories on your site.",
        )}
      </div>
    </div>
  );
}
