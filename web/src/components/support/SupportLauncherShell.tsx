"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { SupportLauncher } from "./SupportLauncher";
import type { SupportContract } from "./support-contract";

export function SupportLauncherShell({ contract }: { contract: SupportContract }) {
  const { state } = useAdminShell();
  return <SupportLauncher contract={contract} drawerOpen={!!state.drawer.drawerId} />;
}
