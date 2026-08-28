import { loadSupportContract } from "./load-support-contract";
import { SupportLauncherShell } from "./SupportLauncherShell";

export async function SupportLauncherShellMount(props: {
  surface: "workspace" | "talent" | "client";
  tenantSlug: string | null;
  tenantId?: string | null;
  canSeeWorkspaceTickets?: boolean;
  originSlug?: string | null;
}) {
  const contract = await loadSupportContract({ ...props, observeShellDrawers: true });
  if (!contract) return null;
  return <SupportLauncherShell contract={contract} />;
}
