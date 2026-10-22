import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// TUL-1843 / TUL-1845: an absolute `https://<x>.tulala.digital` URL written as a
// literal sends a staging visitor to PRODUCTION. Build public links with
// lib/brand/public-root-domain (resolvePublicRootOrigin / publicSubdomainHost /
// rehomeUrlToPublicRoot). A file below may keep a literal only for a reason:
// legal/canonical/SEO, documentation examples, outbound user agents, dev harnesses.
const ALLOWED = new Set([
  "src/app/(marketing)/status/page.tsx", // production health probe targets
  "src/app/.well-known/security.txt/route.ts", // canonical security contact
  "src/app/dev/maison-visual/MaisonVisualHarness.tsx", // dev-only harness
  "src/components/admin/shell/internal/state/fixtures.ts", // demo fixtures
  "src/lib/integrations/catalog.ts", // help text examples
  "src/lib/legal/platform-origin.ts", // PROD_PLATFORM_ORIGIN constant
  "src/lib/messages/unfurl.ts", // outbound user agent
  "src/lib/notifications/catalog.ts", // self-test payload default
  "src/lib/site-admin/builder-node/section-embed-presets.ts", // embed examples
  "src/lib/stripe/talent-domain-renewal.ts", // env-first fallback
  "src/lib/stripe/webhook-handler.ts", // env-first fallback
  "src/lib/talent-site/legal-strip.ts", // legal links
  "src/lib/talent/public-profile-href.ts", // CANONICAL_PROFILE_ORIGIN back-compat constant
  "src/lib/tulala/url-import.server.ts", // outbound user agent
]);

const LITERAL = /https?:\/\/(?:\$\{[^}]+\}|[a-z0-9-]+)?\.?(?:[a-z0-9-]+\.)*tulala\.digital/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
}

test("no new absolute tulala.digital URL literals outside the allow-list", () => {
  const files: string[] = [];
  walk(path.join(process.cwd(), "src"), files);
  const offenders: string[] = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
    if (ALLOWED.has(rel)) continue;
    const hit = readFileSync(file, "utf8")
      .split("\n")
      .find((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && LITERAL.test(l));
    if (hit) offenders.push(`${rel}: ${hit.trim().slice(0, 120)}`);
  }
  assert.deepEqual(offenders, [], "build the link from lib/brand/public-root-domain instead");
});

test("every allow-list entry still exists and still needs its exception", () => {
  for (const rel of ALLOWED) {
    const src = readFileSync(path.join(process.cwd(), rel), "utf8");
    assert.ok(LITERAL.test(src), `${rel} no longer has a literal; remove it from ALLOWED`);
  }
});
