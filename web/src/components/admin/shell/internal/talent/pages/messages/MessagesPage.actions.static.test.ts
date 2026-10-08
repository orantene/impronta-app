/**
 * AUD-010 — Talent seller Actions sit in the composer, with copy.t keys.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));

describe("TalentMessagesV5 Actions placement + i18n", () => {
  const page = readFileSync(join(DIR, "MessagesPage.tsx"), "utf8");
  const actions = readFileSync(
    join(process.cwd(), "src/components/talent/studio/TalentSellerActions.tsx"),
    "utf8",
  );
  const railEs = readFileSync(
    join(DIR, "../../../dashboard-i18n-rail.ts"),
    "utf8",
  );

  it("mounts TalentSellerActions via composerAccessory, not a top toolbar", () => {
    assert.match(page, /composerAccessory=/);
    assert.match(page, /TalentSellerActions/);
    assert.doesNotMatch(
      page,
      /flex items-center justify-end gap-2 px-3 py-2[\s\S]*TalentSellerActions/,
      "Actions must not sit in the old top toolbar",
    );
  });

  it("routes every action title/body through copy.t", () => {
    assert.match(actions, /copy\.t\(row\.title\)/);
    assert.match(actions, /copy\.t\(row\.body\)/);
    assert.match(actions, /copy\.t\("Actions"\)/);
  });

  it("has Spanish rows for every seller action title", () => {
    for (const title of [
      "Send a quote",
      "Propose a time",
      "Request a deposit",
      "Send a photo or file",
      "Add a private note",
      "Save client details",
    ]) {
      assert.match(railEs, new RegExp(`"${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    }
  });
});
