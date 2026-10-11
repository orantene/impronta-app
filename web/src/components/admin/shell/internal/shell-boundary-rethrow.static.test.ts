import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const web = join(__dirname, "../../../../..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

test("ShellBoundary hands notFound/redirect back to Next before its crash screen", () => {
  const src = read("src/components/admin/shell/internal/shell-boundary.tsx");
  assert.match(src, /import\s*\{\s*unstable_rethrow\s*\}\s*from\s*"next\/navigation"/);
  const caught = src.indexOf("if (this.state.caught)");
  assert.ok(caught > 0, "ErrorBoundary render branch moved");
  const rethrow = src.indexOf("unstable_rethrow(this.state.caught)", caught);
  const fallback = src.indexOf("Something broke", caught);
  assert.ok(rethrow > caught && rethrow < fallback, "rethrow must run before the fallback renders");
});

test("work detail has its own not-found screen with ES and EN copy", () => {
  const nf = "src/app/(workspace)/[tenantSlug]/admin/work/[id]/not-found.tsx";
  assert.ok(existsSync(join(web, nf)));
  const body = read(nf);
  for (const key of ["notFoundTitle", "notFoundBody", "backToPipeline"]) {
    assert.match(body, new RegExp(`admin\\.work\\.detail\\.${key}`));
    for (const loc of ["en", "es"]) {
      const detail = JSON.parse(read(`messages/${loc}.json`)).admin.work.detail;
      assert.equal(typeof detail[key], "string", `${loc} missing ${key}`);
    }
  }
});
