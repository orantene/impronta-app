/**
 * TUL-217: a Vercel share link carries a secret (`_vercel_share`). The repo is
 * PUBLIC and PR comments / job summaries / logs are readable, so the QA host
 * pool must never print, comment or summarise one.
 *
 * Static check over the CI workflow only: no line that emits output may
 * mention the share token or a variable holding a share URL. The local
 * qa-host.mjs CLI is deliberately out of scope: since #2655 it prints the
 * share link to the operator's own terminal by design; the workflow strips
 * the query string before anything becomes public.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const FILES = [join(WEB_ROOT, "..", ".github", "workflows", "qa-host-pool.yml")];

/** Lines that can reach a comment, summary, log or status description. */
const EMITTER =
  /console\.(log|error|warn|info)|process\.std(out|err)\.write|\becho\b|GITHUB_STEP_SUMMARY|gh\s+pr\s+comment|gh\s+issue\s+comment|gh\s+api|\bcore\.(info|warning|error|summary)|createComment|::(notice|warning|error)/;
/** The token itself, or an identifier that holds a share URL. */
const SHARE = /_vercel_share|\bshare[-_ ]?(url|link|token)\b|\bshareUrl\b|\bshareLink\b/i;

function numbered(file: string) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }));
}

for (const file of FILES) {
  const name = file.split("/").slice(-2).join("/");

  test(`${name}: never names _vercel_share outside a comment`, () => {
    const hits = numbered(file).filter(({ line }) => !line.startsWith("#") && /_vercel_share/.test(line));
    assert.deepEqual(hits, []);
  });

  test(`${name}: no output line carries a share URL or token`, () => {
    const hits = numbered(file).filter(({ line }) => EMITTER.test(line) && SHARE.test(line));
    assert.deepEqual(hits, []);
  });
}

test("GUARD BITES: a leaking line is caught", () => {
  const bad = 'echo "preview: $SHARE_URL?_vercel_share=abc"';
  assert.ok(EMITTER.test(bad) && SHARE.test(bad));
  const ok = "console.log(`https://${host}`);";
  assert.ok(!(EMITTER.test(ok) && SHARE.test(ok)));
});
