import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TenantScopedLegacyContentRedirectsRedirect(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await props.params;
  redirect(`/${tenantSlug}/admin/website`);
}
