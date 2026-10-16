import "server-only";

/**
 * Auto OG card for a post with no cover / OG image (Posts v1, TUL-1010).
 * 1200×630 `next/og` ImageResponse, same approach as the talent-site card
 * (`lib/talent-site/server/site-og-image.tsx`): post title + site name.
 *
 * Only a post that renders publicly (ok / expired) gets a card; anything else
 * 404s, so the route can't be used to paint arbitrary text on our domains.
 */

import { ImageResponse } from "next/og";

import { getPublicPostBySlug } from "@/lib/cms/posts-public";
import type { PostSiteContext } from "@/lib/cms/posts-public-site";

export async function postOgImageResponse(
  site: PostSiteContext | null,
  locale: string,
  slug: string,
): Promise<Response> {
  if (!site) return new Response("Not found", { status: 404 });
  const state = await getPublicPostBySlug(site.scope, locale, slug).catch(() => null);
  if (!state || (state.state !== "ok" && state.state !== "expired")) {
    return new Response("Not found", { status: 404 });
  }
  const title = state.post.title.trim().slice(0, 140) || site.siteName;
  const res = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#ffffff",
          color: "#141414",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#6b6b6b", letterSpacing: 2, textTransform: "uppercase" }}>
          Blog
        </div>
        <div style={{ display: "flex", fontSize: title.length > 70 ? 56 : 72, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#1f2937" }}>{site.siteName}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  res.headers.set("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return res;
}
