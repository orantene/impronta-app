import { redirect } from "next/navigation";

// Legacy URL-compat redirect. "activity" was merged into settings (WS-8.x).
type PageParams = Promise<{ tenantSlug: string }>;

export default async function TalentActivityRedirect({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/talent/settings`);
}
