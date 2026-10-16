import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { planFirstRelease, type FirstReleaseFacts } from "./first-release";
import { checkChannelChange, dryRunIsFresh } from "./manager/dry-run";

const WEB = new URL("../../../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, WEB), "utf8");

const gridline: FirstReleaseFacts = { design: "gridline", title: "Gridline", catalogVersion: 1, releaseRows: 0, realSites: 0 };

test("TUL-404: a design with no release row gets a draft release at its catalog version", () => {
  const p = planFirstRelease(gridline);
  assert.ok(p.ok);
  assert.equal(p.version, 1);
  assert.equal(p.notes.en, "First release of Gridline (v1).");
  assert.equal(p.notes.es, "Primera versión de Gridline (v1).");
});

test("TUL-404: refused when releases exist, real sites use the design, or it is not in the catalog", () => {
  const has = planFirstRelease({ ...gridline, releaseRows: 1 });
  assert.ok(!has.ok);
  assert.match(has.error, /already has releases/);
  const real = planFirstRelease({ ...gridline, realSites: 2 });
  assert.ok(!real.ok);
  assert.match(real.error, /2 talent site/);
  assert.match(real.errorEs, /2 sitio/);
  for (const catalogVersion of [null, 0, 1.5]) assert.ok(!planFirstRelease({ ...gridline, catalogVersion }).ok);
});

test("TUL-404: the new draft release still needs a fresh dry run before Publish to demos", () => {
  const release = { id: "r1", to_version: 1, items: [], dry_run_report: null, channel: "draft" as const, status: "draft" as const };
  assert.ok(!dryRunIsFresh(release).ok);
  const guard = checkChannelChange(release, "demos");
  assert.ok(!guard.ok);
  assert.match(guard.error, /dry run first/);
  assert.ok(!checkChannelChange(release, "optin").ok, "one step at a time");
});

test("TUL-404: the action is admin-gated, refuses impersonation, and the writer counts every release row", () => {
  const action = read("src/app/(workspace)/platform/admin/builder-lab/themes/actions.ts");
  const body = action.slice(action.indexOf("export async function actionCreateFirstRelease"));
  assert.match(body, /await requireNotImpersonating\(\)/);
  assert.match(body, /await gate\(\)/);
  const writer = read("src/lib/talent-site/theme-releases/first-release.server.ts");
  assert.match(writer, /from\("talent_theme_releases"\)[\s\S]*count: "exact"/);
  assert.doesNotMatch(writer, /neq\("status", "archived"\)/);
  assert.match(writer, /createDraftRelease\(admin, \{[\s\S]*fromVersion: plan\.version,[\s\S]*toVersion: plan\.version/);
});
