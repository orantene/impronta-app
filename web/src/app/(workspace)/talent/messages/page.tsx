import { permanentRedirect } from "next/navigation";

import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

/**
 * /talent/messages is a URL-compat alias. The ONE canonical route for the
 * chat-first inquiry surface is /talent/inbox (it is what the shell segment
 * map, the rail and every deep link use). The query string survives, so
 * `?inquiry=<uuid>` links keep opening their conversation.
 */
export default async function TalentMessagesAlias({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(`/talent/inbox${buildQuerySuffix(await searchParams)}`);
}
