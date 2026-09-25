/**
 * T9.2 — TaskShell sticky action bar must clear the home indicator.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "TaskShell.tsx",
);

describe("TaskShell T9.2", () => {
  it("sticky footer uses safe-area-inset-bottom", () => {
    const src = blankComments(readFileSync(SRC, "utf8"));
    assert.ok(src.includes("sticky bottom-0"));
    assert.ok(src.includes("safe-area-inset-bottom"));
  });
});
