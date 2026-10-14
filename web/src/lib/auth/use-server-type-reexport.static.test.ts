import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TUL-750 (2026-10-14): `otp-actions.ts` ("use server") imported
 * `{ sendEmailCodeCore, type EmailCodeState }` and re-exported the type. The
 * server-action transform kept `EmailCodeState` as a runtime export and every
 * POST /login crashed with "ReferenceError: EmailCodeState is not defined".
 * Consumers import the type from the core module instead.
 */
describe("otp-actions server module", () => {
  const src = readFileSync(join(process.cwd(), "src/app/auth/otp-actions.ts"), "utf8");
  it("does not re-export EmailCodeState", () => {
    assert.doesNotMatch(src, /export type \{[^}]*EmailCodeState/);
  });
  it("imports EmailCodeState as a type-only import", () => {
    assert.match(src, /import type \{ EmailCodeState \} from "@\/lib\/auth\/send-email-code-core"/);
    assert.doesNotMatch(src, /\btype EmailCodeState,/);
  });
});
