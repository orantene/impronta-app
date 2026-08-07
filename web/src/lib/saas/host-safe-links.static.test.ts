import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static guard for the class of bug behind #1041: a link or redirect to a
 * path the serving host 404s.
 *
 * These files render on, or send mail from, surfaces that do NOT serve
 * workspace paths (`/admin`, `/client`, `/talent`, `/onboarding/*`). Each has
 * to route those targets through the host-safe helper, or build them from the
 * app host. A grep guard is crude, but it fails loudly when someone adds the
 * next relative dashboard link, which is exactly how this kept recurring.
 */
const ROOT = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

test("headers that render on marketing or hub route account links through the host-safe helper", () => {
  for (const file of [
    // /t/* is allow-listed on marketing + hub, and this header is mounted there.
    "components/public-header.tsx",
    // The published CMS shell renders this on hub hosts.
    "components/site-shell/HeaderAuthArea.tsx",
  ]) {
    const source = read(file);
    assert.match(
      source,
      /hostSafeDestination/,
      `${file} builds workspace hrefs and must host-check them`,
    );
  }
});

test("the auth popup destination is host-checked before it reaches the opener", () => {
  const callback = read("app/auth/callback/route.ts");
  assert.match(
    callback,
    /createPopupResponse\([\s\S]{0,200}hostSafeRedirectDestination/,
    "the popup branch must not post a bare relative workspace path back",
  );
});

test("dashboard links in email are built from the app host, not the marketing apex", () => {
  const templates = read("lib/email/templates.ts");
  const offenders = [...templates.matchAll(/\$\{siteUrl\(\)\}(\/[a-z-]+)/g)]
    .map((m) => m[1])
    .filter((path) =>
      ["/admin", "/client", "/talent", "/onboarding", "/platform"].includes(path),
    );
  assert.deepEqual(
    offenders,
    [],
    "workspace paths 404 on the marketing apex; use appUrl()",
  );
});
