import { redirectLegacySiteSettingsPageIdToStorefrontEditor } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Tenant-scoped legacy `/…/site-settings/content/pages/:id` → storefront builder. */
export default async function TenantScopedLegacyContentPageDetailRedirect(props: {
  params: Promise<{ tenantSlug: string; pageId: string }>;
}) {
  const { pageId } = await props.params;
  await redirectLegacySiteSettingsPageIdToStorefrontEditor(pageId);
}
