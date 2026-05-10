import { redirectLegacySiteSettingsPageIdToStorefrontEditor } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy page row URL → storefront builder for that `cms_pages` row. */
export default async function LegacySiteSettingsPageDetailRedirect(props: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await props.params;
  await redirectLegacySiteSettingsPageIdToStorefrontEditor(pageId);
}
