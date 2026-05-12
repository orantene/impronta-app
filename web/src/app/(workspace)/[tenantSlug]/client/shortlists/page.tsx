import { redirect } from "next/navigation";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function ClientShortlistsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/client/discover`);
}
