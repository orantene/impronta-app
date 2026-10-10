import assert from "node:assert/strict";
import test from "node:test";
import { resolveHybridSessionDisplayName } from "./session-display-name";

test("onb1-22: hybrid prefers talent name over email-local profiles.display_name", () => {
  assert.equal(
    resolveHybridSessionDisplayName({
      profileDisplayName: "tulala-qa",
      talentDisplayName: "QA Grok Uno",
    }),
    "QA Grok Uno",
  );
});

test("pure workspace staff keeps profiles.display_name when no talent profile", () => {
  assert.equal(
    resolveHybridSessionDisplayName({
      profileDisplayName: "Ana Ruiz",
      talentDisplayName: null,
    }),
    "Ana Ruiz",
  );
});

test("trims and treats blank talent name as absent", () => {
  assert.equal(
    resolveHybridSessionDisplayName({
      profileDisplayName: "tulala-qa",
      talentDisplayName: "   ",
    }),
    "tulala-qa",
  );
  assert.equal(
    resolveHybridSessionDisplayName({
      profileDisplayName: null,
      talentDisplayName: null,
    }),
    null,
  );
});
