import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { docsHostResponse, docsRewritePath } from "../saas/docs-host-redirect";
import { developerDocsEnabled } from "./flag";
import { DOC_ENDPOINTS, DOC_PAGES } from "./outline";

const SRC = join(__dirname, "../..");

test("flag is off by default and on only for true or 1", () => {
  assert.equal(developerDocsEnabled({}), false);
  assert.equal(developerDocsEnabled({ DEVELOPER_DOCS_ENABLED: "false" }), false);
  assert.equal(developerDocsEnabled({ DEVELOPER_DOCS_ENABLED: "true" }), true);
  assert.equal(developerDocsEnabled({ DEVELOPER_DOCS_ENABLED: " 1 " }), true);
});

test("docs pages 404 and are noindexed when the flag is off", () => {
  for (const f of ["app/developers/page.tsx", "app/developers/[slug]/page.tsx"]) {
    const src = readFileSync(join(SRC, f), "utf8");
    assert.match(src, /if \(!developerDocsEnabled\(\)\) notFound\(\)/, f);
    assert.match(src, /robots: \{ index: false/, f);
  }
});

test("flag OFF: docs host still gets the 308 to /help", () => {
  const res = docsHostResponse("docs.tulala.digital", "GET", new URL("https://docs.tulala.digital/auth"), {});
  assert.equal(res?.status, 308);
  assert.equal(res?.headers.get("location"), "https://tulala.digital/help");
});

test("flag ON: the redirect is skipped and the host rewrites to /developers", () => {
  const env = { DEVELOPER_DOCS_ENABLED: "true" };
  const res = docsHostResponse("docs.tulala.digital", "GET", new URL("https://docs.tulala.digital/auth"), env);
  assert.equal(res?.status, 200);
  assert.equal(res?.headers.get("location"), null);
  assert.match(res?.headers.get("x-middleware-rewrite") ?? "", /\/developers\/auth$/);
  assert.equal(docsRewritePath("/"), "/developers");
  assert.equal(docsHostResponse("tulala.digital", "GET", new URL("https://tulala.digital/"), env), null);
});

test("the gate does not admit /developers (the docs host rewrite bypasses it)", () => {
  const gate = readFileSync(join(SRC, "lib/saas/gate.ts"), "utf8");
  assert.doesNotMatch(gate, /developers/);
});

test("index lists the whole outline", () => {
  const slugs = DOC_PAGES.map((p) => p.slug);
  assert.deepEqual(slugs, ["overview", "auth", "endpoints", "webhooks", "errors", "rate-limits"]);
  const index = readFileSync(join(SRC, "app/developers/page.tsx"), "utf8");
  assert.match(index, /DOC_PAGES\.map/);
});

test("every documented endpoint exists in src/app/api", () => {
  assert.ok(DOC_ENDPOINTS.length > 0);
  for (const e of DOC_ENDPOINTS) {
    const file = join(SRC, "app", e.path.replace(/^\//, ""), "route.ts");
    assert.ok(existsSync(file), `${e.path} -> ${file}`);
    const src = readFileSync(file, "utf8");
    assert.match(src, new RegExp(`export (async )?function ${e.method}\\b`), `${e.path} ${e.method}`);
  }
});
