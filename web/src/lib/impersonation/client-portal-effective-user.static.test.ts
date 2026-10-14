import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "../quality/supabase-unchecked-read";

/**
 * TUL-611 (guards TUL-255). A client-portal page or `/api/client/*` route that
 * reads `session.user.id` is keying on the ACTOR (staff under impersonation),
 * not the effective client. Any such file must also build the verified read
 * context (`clientPageReadCtx`, `effectiveReadContext`, `resolveClientApiRead`)
 * and read with that context's `userId`.
 */
const SRC = join(WEB_ROOT, "src", "app");
const ROOTS = [
  join(SRC, "api", "client"),
  join(SRC, "(workspace)", "[tenantSlug]", "client"),
  join(SRC, "client"),
];
const CTX_HELPERS = /\b(clientPageReadCtx|effectiveReadContext|resolveClientApiRead)\(/;
const ACTOR_ID = /\b(?:session\??\.user\??\.id|user\.id)\b/;
const TARGETS = /(?:^|\/)(?:page\.tsx|route\.ts)$/;

/** Actor-own by design: the topbar account menu is about the signed-in person. */
const ACTOR_OWN_ALLOW = new Set(["src/app/api/client/account/route.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TARGETS.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

function offenders(): string[] {
  const bad: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = relative(WEB_ROOT, file);
      if (ACTOR_OWN_ALLOW.has(rel)) continue;
      const code = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
      if (ACTOR_ID.test(code) && !CTX_HELPERS.test(code)) bad.push(rel);
    }
  }
  return bad;
}

test("client pages and /api/client routes never key reads on the actor without a verified read context", () => {
  assert.deepEqual(offenders(), [], "these files read session.user.id with no effective-user context");
});

test("the guard sees the portal files (not a silent empty scan)", () => {
  const n = ROOTS.reduce((a, r) => a + walk(r).length, 0);
  assert.ok(n >= 15, `expected to scan the portal, got ${n} files`);
});
