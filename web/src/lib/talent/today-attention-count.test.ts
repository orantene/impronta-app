import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { todayAttentionTotal } from "./today-attention-count";

test("the reply row counts once, whatever the number of waiting clients", () => {
  assert.equal(todayAttentionTotal(6, 3), 7);
  assert.equal(todayAttentionTotal(6, 0), 6);
  assert.equal(todayAttentionTotal(0, 1), 1);
});

test("Hoy badge and View all read the same total", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx"),
    "utf8",
  );
  assert.match(src, /todayAttentionTotal\(attention\.length, awaitingReply\)/);
  assert.doesNotMatch(src, /\{copy\.t\("View all"\)\} \{attention\.length\}/);
});
