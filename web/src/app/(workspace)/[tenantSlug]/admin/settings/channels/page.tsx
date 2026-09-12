import { notFound } from "next/navigation";

import { ChannelsSettingsClient } from "./ChannelsSettingsClient";
import { isMessagingChannelsEnabledForTenant } from "@/lib/channels/flag";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";

export const dynamic = "force-dynamic";

/** EXPERIMENTAL Settings › Channels. Delete this folder with the drawer. */
export default async function ChannelsSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();
  if (!(await isMessagingChannelsEnabledForTenant({ tenantId: scope.tenantId, tenantSlug }))) notFound();
  return <ChannelsSettingsClient />;
}
