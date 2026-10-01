import { buildUpstreamFileUrl } from "@/lib/fonts/google-proxy";

export const runtime = "nodejs";

const CACHE = "public, max-age=31536000, immutable";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("p") ?? "";
  const upstream = buildUpstreamFileUrl(path);
  if (!upstream) return new Response("Bad font request", { status: 400 });
  try {
    const res = await fetch(upstream, { next: { revalidate: 31536000 } });
    if (!res.ok || !res.body) return new Response("Upstream error", { status: 502 });
    return new Response(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "font/woff2",
        "cache-control": CACHE,
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return new Response("Upstream error", { status: 502 });
  }
}
