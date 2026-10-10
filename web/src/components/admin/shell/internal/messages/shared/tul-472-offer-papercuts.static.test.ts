import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("TUL-472 (a): talent coordinator Lineup mounts LiveLineupPanel, not LineupTabPanel", () => {
  const src = read("src/components/admin/shell/internal/messages/talent-2.tsx");
  assert.match(src, /activeTab === "lineup"/);
  assert.match(src, /<LiveLineupPanel inquiryId=\{conv\.id\}/);
  assert.doesNotMatch(src, /<LineupTabPanel\b/);
});

test("TUL-472 (a): invite Accept keys off participantStatus === invited", () => {
  const src = read("src/components/admin/shell/internal/messages/talent-2.tsx");
  assert.match(src, /participantStatus === "invited"/);
  assert.doesNotMatch(
    src,
    /inviteStage = !isCoordinator && conv\.stage === "inquiry"/,
  );
  const adapter = read(
    "src/components/admin/shell/internal/talent/shared/conversation-adapter-1.tsx",
  );
  assert.match(adapter, /participantStatus: row\.participantStatus/);
});

test("TUL-472 (b): CreateOfferButton re-hydrates coord offer after create", () => {
  const btn = read("src/components/admin/shell/internal/messages/shared/machinery-11.tsx");
  assert.match(btn, /onCreated\?: \(\) => void \| Promise<void>/);
  assert.match(btn, /await onCreated\?\.\(\)/);
  const tab = read("src/components/admin/shell/internal/messages/shared/machinery-12.tsx");
  assert.match(tab, /coordOfferEpoch/);
  assert.match(tab, /onCreated=\{isCoordPov/);
});

test("TUL-472 (c): terms save updates shared save-state; classifier matches friendly conflict", () => {
  const editor = read("src/components/admin/shell/internal/messages/shared/machinery-11.tsx");
  assert.match(editor, /setSaveState\(\{ status: "saved", at: Date\.now\(\) \}\)/);
  assert.match(editor, /classifySaveError\(r\.error\)/);
  const cls = read("src/components/admin/shell/internal/messages/shared/offer-save-state.ts");
  assert.match(cls, /updated elsewhere/);
  const hook = read("src/components/admin/shell/internal/messages/shared/use-offer-save.ts");
  assert.match(hook, /saveGeneration/);
  assert.match(hook, /if \(gen !== saveGeneration\.current\) return/);
});
