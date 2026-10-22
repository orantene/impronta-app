import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TUL-734: "See all N" on the Overview setup card expands in place; it used to
// call a handler that did nothing visible.
test("the setup card's See-all button expands the list locally", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/page-modules/OverviewBoard.tsx"),
    "utf8",
  );
  assert.match(src, /const \[showAll, setShowAll\] = useState\(false\)/);
  assert.match(src, /showAll \? missingAll : missingAll\.slice\(0, 3\)/);
  assert.match(src, /onClick=\{\(\) => setShowAll\(true\)\}/);
  assert.doesNotMatch(src, /onFinish/);
});
