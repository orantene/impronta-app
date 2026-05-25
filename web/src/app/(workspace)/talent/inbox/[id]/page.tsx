import { PinThenRedirect } from "../../../[tenantSlug]/talent/inbox/[id]/_pin-then-redirect";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

export default async function PlatformTalentInboxThreadPage({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;
  return (
    <PinThenRedirect conversationId={id} platformTalentRoutes />
  );
}
