"use client";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { SupportLauncher } from "./SupportLauncher";
import { SupportRecorderProvider } from "@/lib/support/replay/SupportRecorderProvider";
import type { SupportContract } from "./support-contract";

export function SupportLauncherShell({ contract }: { contract: SupportContract }) {
  const { state } = useAdminShell();
  return (
    <SupportRecorderProvider enabled={contract.replayBufferEnabled}>
      <SupportLauncher contract={contract} drawerOpen={!!state.drawer.drawerId} />
    </SupportRecorderProvider>
  );
}
