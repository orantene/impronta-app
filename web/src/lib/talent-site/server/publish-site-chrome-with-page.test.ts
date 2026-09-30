import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { publishSiteChromeWithPage } from "./publish-site-chrome-with-page";

function fakeSb(row: Record<string, unknown>, writes: Array<Record<string, unknown>>) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: row, error: null });
  chain.update = (patch: Record<string, unknown>) => {
    writes.push(patch);
    return chain;
  };
  // update(...).eq(...) resolves to { error: null }
  (chain as { then?: unknown }).then = undefined;
  return {
    from: () => ({
      select: () => chain,
      update: (patch: Record<string, unknown>) => {
        writes.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  } as never;
}

const okTheme = async () => ({ ok: true, data: { themeVersion: 2 } }) as never;

test("F134: a theme-updated shell draft is baked live with the page publish", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const shell = [{ id: "h", props: { __origin: { version: 19 } } }];
  const res = await publishSiteChromeWithPage(
    fakeSb({ shell_tree: shell, shell_published: [{ id: "h", props: { __origin: { version: 14 } } }], design_tokens_draft: {}, design_tokens: {} }, writes),
    "tp",
    { publishTheme: okTheme },
  );
  assert.deepEqual(res, { ok: true, shell: true, theme: false });
  assert.deepEqual(writes[0]?.shell_published, shell);
});

test("F134: identical drafts cause no write and no theme version bump", async () => {
  const writes: Array<Record<string, unknown>> = [];
  let themeCalls = 0;
  const shell = [{ id: "h" }];
  const res = await publishSiteChromeWithPage(
    fakeSb({ shell_tree: shell, shell_published: shell, design_tokens_draft: { a: "1" }, design_tokens: { a: "1" } }, writes),
    "tp",
    { publishTheme: async () => { themeCalls += 1; return okTheme(); } },
  );
  assert.deepEqual(res, { ok: true, shell: false, theme: false });
  assert.equal(writes.length, 0);
  assert.equal(themeCalls, 0);
});

test("F134: differing tokens publish the theme", async () => {
  const res = await publishSiteChromeWithPage(
    fakeSb({ shell_tree: [], shell_published: [], design_tokens_draft: { a: "2" }, design_tokens: { a: "1" } }, []),
    "tp",
    { publishTheme: okTheme },
  );
  assert.deepEqual(res, { ok: true, shell: false, theme: true });
});

test("F134: the page publish action calls the chrome publish after a non-delegated publish", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-core/adapters/talent-page-actions.ts"),
    "utf8",
  );
  assert.match(src, /if \(!first\.delegated\) \{\s*const chrome = await publishSiteChromeWithPage\(/);
});
