import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("workspace Reviews subtitle never says 'your talent' (TUL-732)", () => {
  for (const f of ["../../../messages/en.json", "../../../messages/es.json"]) {
    const sub = JSON.parse(read(f)).dashboard.adminReviews.subtitle as string;
    assert.doesNotMatch(sub, /your talent|de tu talento/i);
  }
});

test("moderation queue loading state is a skeleton, not bare text (TUL-732)", () => {
  const src = read(
    "../../components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/review-moderation-queue.tsx",
  );
  assert.match(src, /<RowSkeleton/);
});
