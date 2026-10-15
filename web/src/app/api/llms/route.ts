import { headers } from "next/headers";
import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { getPublicHostContext } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import { decideLlmsRoute } from "@/lib/seo/talent-llms-txt";
import { loadTalentLlmsTxt } from "@/lib/seo/talent-llms-txt.server";

const HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "public, max-age=3600",
};
const notFound = () => new Response("Not found", { status: 404 });

/** Reached through the `/llms.txt` rewrite in next.config.ts. Marketing host (TUL-589) and published talent-site hosts; every other host 404s. */
export async function GET(): Promise<Response> {
  const hostContext = await getPublicHostContext();
  const h = await headers();
  const decision = decideLlmsRoute({
    kind: hostContext.kind,
    hostContextHeader: h.get(HOST_CONTEXT_HEADER),
    talentProfileHeader: h.get(HOST_TALENT_PROFILE_HEADER),
  });
  if (decision.route === "marketing") {
    return new Response(buildLlmsTxt(publicRequestSiteBase(hostContext)), { headers: HEADERS });
  }
  if (decision.route === "not_found") return notFound();
  const body = await loadTalentLlmsTxt(decision.talentProfileId, publicRequestSiteBase(hostContext));
  return body ? new Response(body, { headers: HEADERS }) : notFound();
}
