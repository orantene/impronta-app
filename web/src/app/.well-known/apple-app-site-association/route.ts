/**
 * P5 — Mobile app groundwork (see
 * web/docs/auth-shell-domain-architecture-2026-08-07.md §"Mobile readiness").
 *
 * Apple Universal Links association file. iOS uses this to decide whether a
 * link to this host should open the native app instead of Safari. There is
 * NO native app yet — this is a cheap, inert stub so the path exists, is
 * reachable over HTTPS with no auth/redirect in the way (Apple's fetcher
 * follows redirects but will not authenticate), and serves the exact
 * `application/json` content type Apple requires — none of which needs to
 * wait for app development to start.
 *
 * PLACEHOLDER VALUES — replace both before the app can use Universal Links:
 *   - "TEAMID" → your Apple Developer Team ID (10 chars, Membership page on
 *     developer.apple.com).
 *   - "com.tulala.app" → the app's real bundle identifier.
 *   - "appIDs" is deprecated in favor of "appID" as of iOS 13+, but Apple's
 *     validator still accepts either key; keep both until the app ships so
 *     older iOS versions and the online AASA validator both pass.
 *
 * Also required when the app exists:
 *   - Host this file on whichever host the Universal Link domain actually
 *     is (likely app.tulala.digital or tulala.digital — confirm with the
 *     iOS entitlements file's `com.apple.developer.associated-domains`).
 *   - Add the matching `applinks:<host>` entry to the app's entitlements.
 *   - Populate "paths" with the real deep-link routes (e.g. claim/invite
 *     links) instead of the permissive "*" below.
 *
 * Reference: https://developer.apple.com/documentation/xcode/supporting-associated-domains
 */
const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    apps: [] as string[],
    details: [
      {
        // PLACEHOLDER — "TEAMID.com.tulala.app" once the app exists.
        appID: "TEAMID.com.tulala.app",
        appIDs: ["TEAMID.com.tulala.app"],
        // PLACEHOLDER — narrow to real deep-link paths (e.g. claim/invite
        // links) before shipping. "*" is a stub, not a final config.
        paths: ["*"],
      },
    ],
  },
};

export async function GET() {
  return Response.json(APPLE_APP_SITE_ASSOCIATION, {
    headers: {
      "content-type": "application/json",
      // Apple's fetcher does not use caching, but a short TTL avoids stale
      // placeholder values lingering behind any CDN layer once real values
      // land.
      "cache-control": "public, max-age=300",
    },
  });
}
