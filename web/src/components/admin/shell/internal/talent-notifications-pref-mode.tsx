"use client";

import React, { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { FONTS } from "./state";

export const NOTIF_DEFAULTS: Record<string, { email: boolean; push: boolean }> = {
  "new-offer":        { email: true,  push: true  },
  "hold-expiring":    { email: true,  push: false },
  "booking-reminder": { email: true,  push: true  },
  "payouts":          { email: false, push: false },
  "weekly-summary":   { email: false, push: false },
};

/**
 * Preferences-only mode of the talent-notifications drawer. Opened from
 * Settings, the drawer shows the alert preferences first and hides the inbox
 * list; state re-syncs each time the drawer opens.
 */
export function useNotificationsPrefMode(open: boolean, fromSettings: boolean) {
  const [prefsMode, setPrefsMode] = useState(fromSettings);
  const [settingsOpen, setSettingsOpen] = useState(fromSettings);
  useEffect(() => {
    if (!open) return;
    setPrefsMode(fromSettings);
    setSettingsOpen(fromSettings);
  }, [open, fromSettings]);
  return { prefsMode, setPrefsMode, settingsOpen, setSettingsOpen };
}

export function SeeAllNotificationsLink({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: "0 0 12px",
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 12.5,
        fontWeight: 500,
      }}
      className="text-admin-ink-muted"
    >
      {t("dashboard.talentNotifications.seeAll")} →
    </button>
  );
}
