"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

/**
 * TalentServicesNudge — "Add your first service" onboarding card (Lane E).
 *
 * Shown on the talent Today page ONLY when the talent has zero offerings
 * (drafts included). One tap routes to the Services tab. Renders
 * nothing while loading, on auth failure, or once the talent has any offering,
 * so it can never become wallpaper. Session-dismissible.
 *
 * Lives under components/talent/services (not admin/shell) so it may use the
 * same inline-styled aesthetic as TalentOfferingsManager.
 */

import { useEffect, useState } from "react";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";

const C = {
  ink: "#14161d",
  inkMuted: "rgba(20,22,29,0.62)",
  border: "rgba(47,109,106,0.28)",
  ground: "rgba(47,109,106,0.06)",
  accent: "#2f6d6a",
};
const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";

export function TalentServicesNudge({
  talentId,
  onAddService,
}: {
  talentId: string;
  onAddService: () => void;
}) {
  const [empty, setEmpty] = useState(false);
  const copy = useDashboardText();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    loadTalentOfferingsForEditor(talentId).then((res) => {
      if (live && res.ok && res.items.length === 0) setEmpty(true);
    });
    return () => {
      live = false;
    };
  }, [talentId]);

  if (!empty || dismissed) return null;

  return (
    <section
      data-talent-services-nudge
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        border: `1px solid ${C.border}`,
        background: C.ground,
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 14,
        fontFamily: FONT,
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 260px" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>
          {copy.t("Add your first service")}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.inkMuted, lineHeight: 1.45 }}>
          {copy.t("Put your menu on your page: clients can ask about a service or book it directly. It takes about a minute per service.")}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={onAddService}
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            padding: "9px 16px",
            borderRadius: 9,
            border: "none",
            background: C.accent,
            color: "#fff",
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {copy.t("Set up services")}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={copy.t("Dismiss")}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 10px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: C.inkMuted,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {copy.t("Later")}
        </button>
      </div>
    </section>
  );
}
