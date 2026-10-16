/** TUL-708 follow-up: a long client name in an agenda row must not wrap badly at 390px. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

it("Today agenda row clamps a long client name to two lines and breaks long words (main's TUL-708 decision)", () => {
  const src = readFileSync(path.join(HERE, "AgendaTodayPage.tsx"), "utf8");
  assert.match(
    src,
    /className="line-clamp-2 break-words text-\[14px\] font-semibold text-\[var\(--tc-primary\)\]">\s*\{copy\.t\(item\.client\?\.name/,
  );
});
