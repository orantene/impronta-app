/**
 * video-embed-preflight.ts — refuse to seed a video that cannot be embedded.
 *
 * A YouTube video can be public and still be un-embeddable: the uploader can
 * turn embedding off, and a private or region-restricted video behaves the same
 * way. The page then renders an iframe that says "This video is unavailable"
 * ACROSS THE HERO — and because the iframe paints over the container, it hides
 * the poster image that was supposed to be the fallback. The hero goes from a
 * photograph to a near-black band with an error in it.
 *
 * That is exactly what happened when Impronta's own footage went onto the live
 * homepage: the tree was valid, the embed was built correctly, every test
 * passed, and the page was broken for anyone who loaded it. Nothing in the
 * pipeline could tell, because "is this video embeddable" is a fact about
 * YouTube's settings, not about our data.
 *
 * So the seeder asks. `oembed` answers 200 for an embeddable video and 403 when
 * embedding is off — one request per distinct video, before any write.
 */

/** A YouTube video id, or null if the URL is not one we recognise. */
export function youtubeIdFromUrl(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Every distinct YouTube URL a tree asks to embed. */
export function collectVideoUrls(tree: unknown): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((v) => walk(v));
    if (!value || typeof value !== "object") {
      if (key === "src" && typeof value === "string" && youtubeIdFromUrl(value)) {
        found.add(value);
      }
      return;
    }
    const node = value as Record<string, unknown>;
    // Only look inside a backgroundMedia block: `src` elsewhere is an image.
    if (node.source === "youtube" && typeof node.src === "string") {
      found.add(node.src);
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, k);
  };
  walk(tree);
  return [...found];
}

export interface VideoEmbedCheck {
  url: string;
  id: string | null;
  embeddable: boolean;
  status: number | null;
}

/**
 * Ask YouTube whether each video may be embedded.
 *
 * A NETWORK FAILURE IS NOT A REJECTION. If the check itself cannot run (no
 * connectivity, YouTube down) the video passes: blocking a seed because a
 * third-party API was unreachable would be a worse failure than the one this
 * guards against, and the operator can see the reported status either way.
 */
export async function checkVideoEmbeddable(url: string): Promise<VideoEmbedCheck> {
  const id = youtubeIdFromUrl(url);
  if (!id) return { url, id: null, embeddable: false, status: null };
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${id}`,
  )}&format=json`;
  try {
    const res = await fetch(endpoint, { method: "GET" });
    return { url, id, embeddable: res.ok, status: res.status };
  } catch {
    return { url, id, embeddable: true, status: null };
  }
}

/** The ones that would render an error banner across the page. */
export async function findUnembeddableVideos(tree: unknown): Promise<VideoEmbedCheck[]> {
  const urls = collectVideoUrls(tree);
  if (urls.length === 0) return [];
  const checks = await Promise.all(urls.map((url) => checkVideoEmbeddable(url)));
  return checks.filter((check) => !check.embeddable);
}

/** Human-readable, with the fix rather than just the complaint. */
export function describeUnembeddable(checks: readonly VideoEmbedCheck[]): string {
  return checks
    .map((check) => {
      if (!check.id) return `  ${check.url} — not a YouTube URL this renderer understands`;
      return [
        `  ${check.url}`,
        `    YouTube says ${check.status ?? "?"} — embedding is off for this video.`,
        `    Fix: YouTube Studio → the video → Edit → Show more → check "Allow embedding".`,
        `    A private or unlisted video with embedding off behaves the same way.`,
      ].join("\n");
    })
    .join("\n");
}
