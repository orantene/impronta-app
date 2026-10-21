/**
 * `/indexnow-key.txt` (TUL-589, S slice) — IndexNow's ownership-verification
 * file. Served on every host (agency, talent site, marketing): IndexNow
 * checks `keyLocation` against whichever host a submitted URL belongs to, so
 * the same key must answer on all of them. One platform-wide key, matching
 * `INDEXNOW_KEY_LOCATION_PATH` in `@/lib/seo/indexnow`.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const key = process.env.INDEXNOW_API_KEY;
  // Unconfigured: nothing to verify, and pingIndexNow() no-ops anyway (see
  // indexNowPingAllowed) — an empty 200 would just be a confusing stray file.
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
