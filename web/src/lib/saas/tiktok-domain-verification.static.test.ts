import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { isPathAllowedForHostKind } from "./surface-allow-list";
import type { HostKind } from "./host-kinds";

/**
 * TikTok URL-prefix domain verification (developer app 7682273019905148948).
 *
 * Two halves that must agree or the verification silently fails: the file in
 * `web/public/` and the allow-list entry that lets the proxy serve it. A rename
 * of either alone leaves a 404 that looks like a TikTok problem. TikTok fetches
 * the path on app.tulala.digital and compares the body to the token in the
 * filename, so the token is asserted in three places at once here.
 */
/**
 * One file per verified URL prefix. `app.tulala.digital` carries the OAuth
 * redirect; the apex carries the Terms and Privacy URLs the submission form
 * demands, and `/legal/*` is marketing-only so it cannot move to the app host.
 */
const PROPERTIES = [
  { prefix: "https://app.tulala.digital/", token: "8WGzEiKg9pe0okRf7eDPP6rPghXjVCJH" },
  { prefix: "https://tulala.digital/", token: "OC3FhK8XbPutKlNiCH3nxdOjnMpxRLjN" },
] as const;

const filenameFor = (token: string) => `tiktok${token}.txt`;

test("each signature file exists in public/ and its body carries the filename's token", () => {
  for (const { prefix, token } of PROPERTIES) {
    const filename = filenameFor(token);
    const body = readFileSync(path.join(process.cwd(), "public", filename), "utf8").trim();
    assert.equal(
      body,
      `tiktok-developers-site-verification=${token}`,
      `${filename} body must match its token (property ${prefix})`,
    );
  }
});

test("the proxy serves each of them on every host kind", () => {
  const kinds: HostKind[] = ["agency", "app", "hub", "marketing"];
  for (const { token } of PROPERTIES) {
    for (const kind of kinds) {
      assert.equal(
        isPathAllowedForHostKind(kind, `/${filenameFor(token)}`),
        true,
        `${filenameFor(token)} must be allowed on ${kind}`,
      );
    }
  }
});

test("the allow-list entries match the files on disk exactly", () => {
  // Guards the rename-one-half defect: entries are exact-matched, so a
  // trailing slash or a case change is a 404 with no other symptom.
  for (const { token } of PROPERTIES) {
    const filename = filenameFor(token);
    assert.equal(isPathAllowedForHostKind("app", `/${filename}/`), false);
    assert.equal(isPathAllowedForHostKind("app", `/${filename.toUpperCase()}`), false);
  }
});
