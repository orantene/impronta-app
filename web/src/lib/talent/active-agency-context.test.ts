import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/talent/active-agency-context.ts"),
  "utf8",
);

test("active agency cookie name is stable", () => {
  assert.match(SRC, /tulala\.talent\.active_tenant_id/);
});

test("set-active-agency action writes the same cookie", () => {
  const actionSrc = readFileSync(
    join(process.cwd(), "src/lib/talent/set-active-agency-action.ts"),
    "utf8",
  );
  assert.match(actionSrc, /ACTIVE_TALENT_TENANT_COOKIE/);
  assert.match(actionSrc, /revalidatePath\("\/talent"/);
});
