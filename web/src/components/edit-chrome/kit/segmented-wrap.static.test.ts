import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/components/edit-chrome/kit/segmented.tsx"), "utf8");

test("TUL-1027: full-width segmented groups wrap long labels instead of truncating", () => {
  assert.match(SRC, /whiteSpace: fullWidth \? "normal" : "nowrap"/);
  assert.match(SRC, /textOverflow: fullWidth \? "clip" : "ellipsis"/);
  assert.match(SRC, /title=\{typeof opt\.label === "string"/);
});
