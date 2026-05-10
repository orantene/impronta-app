import { redirectLegacySiteSettingsPageIdToStorefrontEditor } from "@/lib/site-admin/legacy-site-settings-redirect";

export const dynamic = "force-dynamic";

/** Legacy deep link `/admin/site-settings/content/pages/:id` → storefront builder. */
export default async function LegacySiteSettingsContentPageDetailRedirect(props: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await props.params;
  await redirectLegacySiteSettingsPageIdToStorefrontEditor(pageId);
}
