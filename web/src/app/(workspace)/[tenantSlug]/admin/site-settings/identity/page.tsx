import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Tenant-scoped legacy bookmark `/…/admin/site-settings/identity` → workspace Settings. */
export default async function TenantScopedLegacyIdentityRedirect(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await props.params;
  redirect(`/${tenantSlug}/admin/settings`);
}
