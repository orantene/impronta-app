"use client";

import { useCallback, useEffect, useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { fetchTalentPersonalSiteDashboardStateAction } from "@/lib/talent-site/server/actions";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";
import { TalentSiteDashboardClient } from "./TalentSiteDashboardClient";

const FONT = '"Inter", system-ui, sans-serif';

/**
 * Renders the personal-site dashboard inside the talent shell main area
 * (tab "My pages" / public-page). Loads state via server action so we do not
 * need a canonical /talent/site route that bypasses AdminShellRoot.
 */
export function TalentSiteDashboardPanel() {
  const { state: shellState } = useAdminShell();
  const [state, setState] = useState<TalentSiteDashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    void reload();
  }, [reload, shellState.talentTier]);

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: FONT, fontSize: 13, color: "rgba(11,11,13,0.55)" }}>
        Loading personal site…
      </div>
    );
  }

  if (error || !state) {
    return (
      <div style={{ padding: 24, fontFamily: FONT, fontSize: 13 }}>
        <p>{error ?? "Unable to load personal site."}</p>
      </div>
    );
  }

  return <TalentSiteDashboardClient initialState={state} onReload={reload} />;
}
