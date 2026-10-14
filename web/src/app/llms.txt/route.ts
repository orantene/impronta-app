import { getPublicHostContext } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";

/** Marketing host only (TUL-589); every other host kind gets a plain 404. */
export async function GET(): Promise<Response> {
  const hostContext = await getPublicHostContext();
  if (hostContext.kind !== "marketing") {
    return new Response("Not found", { status: 404 });
  }
  return new Response(buildLlmsTxt(publicRequestSiteBase(hostContext)), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
