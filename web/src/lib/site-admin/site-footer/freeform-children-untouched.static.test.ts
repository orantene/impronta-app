/**
 * freeform-children-untouched.static.test.ts
 *
 * THE PROPERTY: an inspector save must not clobber the footer landmark's
 * operator-added freeform children.
 *
 * WHY THIS IS STATIC RATHER THAN A BEHAVIOURAL TEST
 * --------------------------------------------------------------------------
 * The property holds by CONSTRUCTION: the children live in `cms_pages.blocks`
 * and the save writes `cms_sections`. There is no shared state to exercise, so
 * a behavioural test would have to stand up two Supabase tables to assert that
 * one of them was never touched — and `actions.ts` is a `"use server"` module
 * the node runner cannot import at all (the constraint recorded in
 * `reference_server_only_import_breaks_test_lanes`).
 *
 * What a behavioural test WOULD catch, and what this one catches instead, is
 * the regression that actually threatens the property: someone adds a
 * `cms_pages` UPDATE to this module — to "also persist the tree", to fix an
 * unrelated staleness bug — and the children start getting overwritten. That is
 * a source-level change, so a source-level guard sees it.
 *
 * The complementary half (the props merge itself cannot emit `children`) is
 * covered behaviourally in `config-merge.test.ts` [F3].
 *
 * STATED LIMIT: this cannot see through a helper in another module. If the save
 * path ever calls out to something that writes `blocks`, this guard is blind to
 * it. That is the same limit every static guard in this repo carries, and the
 * reason the brief also requires a live round-trip check.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ACTIONS = path.join(
  process.cwd(),
  "src/lib/site-admin/site-footer/actions.ts",
);

const SOURCE = readFileSync(ACTIONS, "utf8");

/**
 * Strip block + line comments before matching. The file's own doc comments talk
 * at length about `cms_pages.blocks` and `.update(` — matching those would make
 * the guard fire on its own explanation, and the usual "fix" for that is to
 * delete the explanation. Match code only.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CODE = codeOnly(SOURCE);

test("[FF1] the footer save path performs no write against cms_pages", () => {
  // Every Supabase write verb. `.select()` on cms_pages is legitimate and
  // expected — the read-only freeform child count uses it.
  const WRITE_VERBS = ["update(", "insert(", "upsert(", "delete(", "rpc("];

  // Find each cms_pages access and check the chained call that follows it.
  const offenders: string[] = [];
  const pattern = /from\(\s*["']cms_pages["']\s*\)([\s\S]{0,240})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(CODE)) !== null) {
    const chain = match[1] ?? "";
    // Stop at the end of the statement so we don't read into the next one.
    const statement = chain.split(";")[0] ?? chain;
    for (const verb of WRITE_VERBS) {
      if (statement.includes(`.${verb}`)) {
        offenders.push(`.${verb} follows a cms_pages access`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "site-footer/actions.ts writes to `cms_pages`. That table holds the shell's " +
      "freeform draft (`blocks`), which is where the footer landmark's " +
      "operator-added children live. A write here overwrites them on every " +
      "inspector save — silent content loss with no error anywhere. The footer " +
      "inspector is a view over the SECTION row (`cms_sections`); if you need " +
      "the tree to change, that belongs in the shell surface's save path, not " +
      "here.",
  );
});

test("[FF2] the save goes through the canonical section save, not a raw table write", () => {
  assert.ok(
    CODE.includes("saveSectionDraftAction"),
    "The footer save must route through `saveSectionDraftAction` — it is what " +
      "supplies Zod validation, CAS, the audit entry and the revision row. A " +
      "direct `cms_sections` UPDATE skips all four.",
  );
  // A direct cms_sections write would bypass all of the above.
  const rawSectionWrite = /from\(\s*["']cms_sections["']\s*\)[\s\S]{0,200}?\.(update|insert|upsert|delete)\(/.test(
    CODE,
  );
  assert.equal(
    rawSectionWrite,
    false,
    "site-footer/actions.ts writes `cms_sections` directly instead of going " +
      "through `saveSectionDraftAction`.",
  );
});

test("[FF3] the save re-bakes the shell snapshot", () => {
  // The renderer reads `published_page_snapshot`, not the draft section row.
  // Without the re-bake the operator's edit persists and never appears — the
  // "I save and nothing changes" class of bug.
  assert.ok(
    CODE.includes("republishSiteShellSnapshot"),
    "The footer save must call `republishSiteShellSnapshot`. The storefront " +
      "renders the shell SNAPSHOT; a draft-only write saves successfully and " +
      "changes nothing the operator can see.",
  );
});

test("[FF4] both read and write are capability-gated", () => {
  const gates = CODE.match(/userHasCapability\(/g) ?? [];
  assert.ok(
    gates.length >= 2,
    `Expected the load and the save to each check \`userHasCapability\`; found ${gates.length} call(s).`,
  );
  assert.ok(
    CODE.includes("agency.site_admin.pages.edit"),
    "The footer actions must gate on `agency.site_admin.pages.edit` — the same " +
      "capability that gates the edit chrome itself.",
  );
});

test("[FF5] the write is plan-gated server-side", () => {
  assert.ok(
    CODE.includes("isShellMutationAllowedForPlan"),
    "The footer save must apply the shared shell plan gate on the SERVER. The " +
      "dock's ShellLockedState is a UX affordance; a stale client bundle must " +
      "still be refused.",
  );
});
