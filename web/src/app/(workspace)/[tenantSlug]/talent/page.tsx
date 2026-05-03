import { redirect } from "next/navigation";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function TalentRootPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/talent/today`);
}
