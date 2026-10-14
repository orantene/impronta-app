"use client";

import { useEffect } from "react";
import { useAdminShellOptional } from "@/components/admin/shell/internal/state";

/** Opens the tier-compare drawer once when /talent/plan mounts (TUL-666). */
export function TalentPlanRouteOpener() {
  const shell = useAdminShellOptional();
  const openDrawer = shell?.openDrawer ?? null;
  useEffect(() => {
    if (openDrawer) openDrawer("talent-tier-compare");
  }, [openDrawer]);
  return null;
}
