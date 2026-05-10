import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Tenant-scoped legacy bookmark `/…/admin/site-settings/design` → workspace Website. */
export default async function TenantScopedLegacyDesignRedirect(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await props.params;
  redirect(`/${tenantSlug}/admin/website`);
}
