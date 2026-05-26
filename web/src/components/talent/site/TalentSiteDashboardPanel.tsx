"use client";

import { useCallback, useEffect, useState } from "react";

import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { fetchTalentPersonalSiteDashboardStateAction } from "@/lib/talent-site/server/actions";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";
import { TalentSiteDashboardClient } from "./TalentSiteDashboardClient";
import { useTalentSiteDashboardInitialLoad } from "./TalentSiteDashboardProvider";

/**
 * Renders the personal-site dashboard inside the talent shell main area
 * (tab "My pages" / public-page). Loads state via server action so we do not
 * need a canonical /talent/site route that bypasses AdminShellRoot.
 */
type PanelProps = {
  locale?: "en" | "es";
};

export function TalentSiteDashboardPanel({ locale = "en" }: PanelProps) {
  const { state: shellState } = useAdminShell();
  const initialLoad = useTalentSiteDashboardInitialLoad();
  const [state, setState] = useState<TalentSiteDashboardState | null>(() =>
    initialLoad?.ok ? initialLoad.state : null,
  );
  const [error, setError] = useState<string | null>(() =>
    initialLoad && !initialLoad.ok ? initialLoad.error : null,
  );
  const [loading, setLoading] = useState(() => initialLoad == null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const loaded = await fetchTalentPersonalSiteDashboardStateAction();
    if (!loaded.ok) {
      setError(loaded.error);
      setState(null);
    } else {
      setState(loaded.state);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialLoad == null) {
      void reload();
    }
  }, [initialLoad, reload, shellState.talentTier]);

  useEffect(() => {
    if (initialLoad == null) return;
    if (initialLoad.ok) {
      setState(initialLoad.state);
      setError(null);
    } else {
      setState(null);
      setError(initialLoad.error);
    }
    setLoading(false);
  }, [initialLoad]);

  if (loading) {
    return (
      <div
        style={{
          padding: "14px 16px",
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.inkMuted,
        }}
      >
        Loading personal site…
      </div>
    );
  }

  if (error || !state) {
    return (
      <div
        style={{
          padding: "14px 16px",
          background: COLORS.criticalSoft,
          border: `1px solid rgba(176,48,58,0.18)`,
          borderRadius: 12,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.criticalDeep,
        }}
      >
        {error ?? "Unable to load personal site."}
      </div>
    );
  }

  return <TalentSiteDashboardClient initialState={state} onReload={reload} locale={locale} />;
}
