"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { PromosDrawer } from "./PromosDrawer";

/** Shell wiring: drawer id "promos" opens the active-promos drawer. */
export function PromosDrawerHost() {
  const { state, closeDrawer } = useAdminShell();
  return <PromosDrawer open={state.drawer.drawerId === "promos"} onClose={closeDrawer} />;
}
