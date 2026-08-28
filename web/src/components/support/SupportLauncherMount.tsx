import { loadSupportContract } from "./load-support-contract";
import { SupportLauncher } from "./SupportLauncher";

export async function SupportLauncherMount(props: {
  surface: "workspace" | "talent" | "client";
  tenantSlug: string | null;
  tenantId?: string | null;
  canSeeWorkspaceTickets?: boolean;
  originSlug?: string | null;
}) {
  const contract = await loadSupportContract(props);
  if (!contract) return null;
  return <SupportLauncher contract={contract} />;
}
