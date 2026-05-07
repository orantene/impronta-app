import { redirect } from "next/navigation";

// Phase 3.12.2 — The prototype talent shell handles inquiry thread selection
// via click-driven state (not URL routing). Deep links to /talent/inbox/[id]
// redirect to the inbox list where the user can select the thread.
// Full URL-deep-link support is Phase 4+ work.

type PageParams = Promise<{ tenantSlug: string; id: string }>;

export default async function TalentInquiryThreadRedirect({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/talent/inbox`);
}
