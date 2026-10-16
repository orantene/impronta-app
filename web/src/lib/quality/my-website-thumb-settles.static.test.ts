import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(join(process.cwd(), "src/components/talent/site/maison-setup/MyWebsiteCard.tsx"), "utf8");

describe("TUL-542 My website preview never stays on the placeholder", () => {
  it("keeps checking the frame until it reports complete (onLoad can be missed)", () => {
    assert.match(SRC, /window\.setInterval\(\(\) => \{\s*if \(isDone\(\)\)/);
    assert.match(SRC, /window\.clearInterval\(timer\)/);
  });
  it("re-mounts the frame when its URL changes", () => {
    assert.match(SRC, /key=\{thumbSrc\}/);
  });
});
