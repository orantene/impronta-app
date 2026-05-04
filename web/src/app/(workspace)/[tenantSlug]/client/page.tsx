// Phase 3.10 — /client redirect to /client/today
import { redirect } from "next/navigation";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function ClientIndexPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/client/today`);
}
