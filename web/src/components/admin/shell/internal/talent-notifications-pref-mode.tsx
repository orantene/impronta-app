"use client";

import React, { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";

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
      className="cursor-pointer border-0 bg-transparent px-0 pb-3 pt-0 text-[12.5px] font-medium text-admin-ink-muted"
    >
      {t("dashboard.talentNotifications.seeAll")} →
    </button>
  );
}
