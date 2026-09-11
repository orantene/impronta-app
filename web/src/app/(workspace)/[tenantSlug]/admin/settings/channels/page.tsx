import { notFound } from "next/navigation";

import { ChannelsSettingsClient } from "./ChannelsSettingsClient";
import { isMessagingChannelsEnabled } from "@/lib/channels/flag";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";

export const dynamic = "force-dynamic";

/** EXPERIMENTAL Settings › Channels. Delete this folder with the drawer. */
export default async function ChannelsSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  if (!(await isMessagingChannelsEnabled())) notFound();
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();
  return <ChannelsSettingsClient />;
}
