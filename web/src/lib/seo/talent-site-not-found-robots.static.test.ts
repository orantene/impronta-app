import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(
  join(process.cwd(), "src/app/%5Ftalent-site/not-found.tsx"),
  "utf8",
);

test("TUL-857: talent-site not-found page declares noindex, nofollow", () => {
  assert.match(src, /export const metadata: Metadata = \{ robots: \{ index: false, follow: false \} \}/);
});
