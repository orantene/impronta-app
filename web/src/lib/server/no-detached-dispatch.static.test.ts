/**
 * TUL-641 — no detached `void dispatch…()` / `void send…()` in server code.
 *
 * On Vercel serverless a floating promise started after the response can die
 * when the function freezes, so an email or notification silently never goes
 * out. Must-complete side effects go through `afterResponse()`
 * (`@/lib/server/after-response`, Next `after()`), or are awaited.
 *
 * This guard fails when a new `void <dispatch|send|notify|email|emit|enqueue|
 * deliver|recordAi…>(` appears in a non-client file under src/app or src/lib
 * without an allow-list entry (path -> reason). Add an entry ONLY for work that
 * is genuinely optional (analytics) and say why.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/server/no-detached-dispatch.static.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const SRC = new URL("../../", import.meta.url).pathname;
const DETACHED = /(^|[^A-Za-z0-9_.$])void\s+(?:dispatch|send|notify|email|emit|enqueue|deliver|recordAi)[A-Za-z0-9_]*\s*\(/;

/** path (relative to src/) -> why a detached call is acceptable there. */
const ALLOW: Record<string, string> = {};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
}

test("no detached dispatch/send in server code without an allow-list entry", () => {
  const files: string[] = [];
  walk(join(SRC, "app"), files);
  walk(join(SRC, "lib"), files);
  const offenders: string[] = [];
  for (const file of files) {
    const rel = relative(SRC, file);
    const text = readFileSync(file, "utf8");
    if (/^\s*(['"])use client\1/m.test(text.slice(0, 400))) continue;
    if (ALLOW[rel]) continue;
    text.split("\n").forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      if (DETACHED.test(line)) offenders.push(`${rel}:${i + 1}: ${t.slice(0, 100)}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Detached side effect(s). Use afterResponse() from @/lib/server/after-response (or await), or allow-list with a reason:\n${offenders.join("\n")}`,
  );
});

test("the allow-list has no stale entries", () => {
  for (const rel of Object.keys(ALLOW)) {
    assert.ok(statSync(join(SRC, rel)).isFile(), `allow-listed file is gone: ${rel}`);
  }
});

test("afterResponse is the shared after() wrapper with an inline fallback", () => {
  const src = readFileSync(new URL("./after-response.ts", import.meta.url), "utf8");
  assert.match(src, /import \{ after \} from "next\/server"/);
  assert.match(src, /after\(run\)/);
  assert.match(src, /catch \{\s*void run\(\);/);
});
