import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// TUL-784: switching sign-in method must not move the submit under the pointer.
describe("email-code-form method swap", () => {
  const src = readFileSync(join(process.cwd(), "src/components/auth/email-code-form.tsx"), "utf8");
  it("reserves the password-lane height on both code-lane forms", () => {
    assert.ok(src.includes('METHOD_SWAP_RESERVE = "pb-[5.3rem]"'));
    const uses = src.match(/\$\{passwordFallback \? METHOD_SWAP_RESERVE : ""\}/g) ?? [];
    assert.equal(uses.length, 2);
  });
});
