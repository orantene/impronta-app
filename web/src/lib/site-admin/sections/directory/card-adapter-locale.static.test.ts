// TUL-1855: every <TalentCardActions> the directory card mounts must be handed the
// section locale. Two of them (hover Inquire pill, save heart) fell back to "en", so an ES
// directory showed "INQUIRE" / "IN LINEUP" on the hover pill.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("each TalentCardActions in DirectoryCardAdapter receives locale", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/sections/directory/DirectoryCardAdapter.tsx"), "utf8");
  const blocks = src.split("<TalentCardActions").slice(1).filter((chunk) => /^\s/.test(chunk)).map((chunk) => chunk.slice(0, chunk.indexOf("/>")));
  assert.ok(blocks.length >= 4, "expected the four TalentCardActions mounts");
  for (const b of blocks) assert.match(b, /locale=\{locale\}/);
});
