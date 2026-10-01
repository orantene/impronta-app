import { buildUpstreamCssUrl, rewriteFontCss } from "@/lib/fonts/google-proxy";

export const runtime = "nodejs";

const CACHE = "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400";
// A modern UA so Google serves woff2 with unicode-range subsets.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET(request: Request) {
  const upstream = buildUpstreamCssUrl(new URL(request.url).search);
  if (!upstream) return new Response("Bad font request", { status: 400 });
  try {
    const res = await fetch(upstream, { headers: { "user-agent": UA }, next: { revalidate: 86400 } });
    if (!res.ok) return new Response("Upstream error", { status: 502 });
    const css = rewriteFontCss(await res.text());
    return new Response(css, {
      headers: { "content-type": "text/css; charset=utf-8", "cache-control": CACHE },
    });
  } catch {
    return new Response("Upstream error", { status: 502 });
  }
}
