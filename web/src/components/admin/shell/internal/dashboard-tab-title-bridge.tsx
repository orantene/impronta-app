"use client";

/**
 * Browser tab title bridge for the admin/talent dashboard shell.
 *
 * Extracted from admin-shell-client so the shell stays under its size ratchet
 * (TUL-146 / C1-09). Was bare "Tulala" on every talent page; now e.g.
 * "Perfil · Tulala" / "(3) Mensajes · Tulala".
 */

import { useEffect } from "react";

import { useDashboardText } from "./dashboard-i18n";
import { dashboardTabTitle } from "./dashboard-tab-title";
import {
  PAGE_META,
  TALENT_PAGE_META,
  useAdminShell,
} from "./state";

export function TabTitleBridge() {
  const { state, bridgeTalentUnread, totalUnread } = useAdminShell();
  const copy = useDashboardText();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const unread =
      state.surface === "talent"
        ? (bridgeTalentUnread ?? 0)
        : state.surface === "workspace"
          ? totalUnread
          : 0;
    let pageLabel = "";
    if (state.surface === "talent") {
      const meta = TALENT_PAGE_META[state.talentPage];
      pageLabel = meta ? copy.t(meta.label) : "";
    } else if (state.surface === "workspace") {
      const meta = PAGE_META[state.page];
      pageLabel = meta ? copy.t(meta.label) : "";
    }
    document.title = dashboardTabTitle({ pageLabel, unread });
    return () => {
      document.title = "Tulala";
    };
  }, [
    state.surface,
    state.talentPage,
    state.page,
    bridgeTalentUnread,
    totalUnread,
    copy.locale,
    copy.t,
  ]);

  return null;
}
