import { redirect } from "next/navigation";

// Legacy URL-compat redirect. "reach" was split into agencies + public-page (WS-8.2).
type PageParams = Promise<{ tenantSlug: string }>;

export default async function TalentReachRedirect({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/talent/agencies`);
}
