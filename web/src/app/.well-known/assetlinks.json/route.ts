/**
 * P5 — Mobile app groundwork (see
 * web/docs/auth-shell-domain-architecture-2026-08-07.md §"Mobile readiness").
 *
 * Android Digital Asset Links file. Android uses this to verify an App Link
 * (a normal https:// URL that should open the native app) is authorized by
 * the site that owns the domain. There is NO native app yet — this is a
 * cheap, inert stub so the path exists and serves the exact
 * `application/json` content type Google's verifier expects, none of which
 * needs to wait for app development to start.
 *
 * PLACEHOLDER VALUES — replace both before the app can use App Links:
 *   - "com.tulala.app" → the app's real Android applicationId (package
 *     name), matching build.gradle.
 *   - "SHA256_CERT_FINGERPRINT_PLACEHOLDER" → the release signing
 *     certificate's SHA-256 fingerprint, colon-separated hex
 *     (`keytool -list -v -keystore <release.keystore>`, or read it back
 *     from Play Console → App integrity → App signing key certificate).
 *     A debug-keystore fingerprint will NOT verify in production.
 *
 * Reference: https://developer.android.com/training/app-links/verify-android-applinks
 */
const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      // PLACEHOLDER — real Android applicationId once the app exists.
      package_name: "com.tulala.app",
      sha256_cert_fingerprints: [
        // PLACEHOLDER — real release-signing SHA-256 fingerprint.
        "SHA256_CERT_FINGERPRINT_PLACEHOLDER",
      ],
    },
  },
];

export async function GET() {
  return Response.json(ASSET_LINKS, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  });
}
