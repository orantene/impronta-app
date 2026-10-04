/**
 * Save look → front-door chat: text draft + optional imageDataUrl.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(HERE, name), "utf8");

test("ask-question stashes imageDataUrl into pending look image", () => {
  const launcher = read("TalentProfileChatLauncher.tsx");
  assert.match(launcher, /useAskQuestionOpen/);
  const hook = read("use-ask-question-open.ts");
  assert.match(hook, /setPendingLookImage/);
  assert.match(hook, /imageDataUrl/);
});

test("send path uploads pending look via inquiry attachments", () => {
  const send = read("use-mini-chat-send.ts");
  assert.match(send, /attachPendingLookImage|flushLookImage/);
  const attach = read("attach-pending-look-image.ts");
  assert.match(attach, /uploadInquirySubmitAttachments/);
  assert.match(attach, /nail-studio-look\.png/);
});

test("Nail Studio frame forwards imageDataUrl into ask-question", () => {
  const frame = readFileSync(
    join(HERE, "../../../../lib/site-admin/builder-node/nail-designer-frame.tsx"),
    "utf8",
  );
  assert.match(frame, /imageDataUrl/);
  assert.match(frame, /tulala:ask-question/);
});

test("Nail Studio Save look chat/quote emit includes imageDataUrl", () => {
  const studio = readFileSync(
    join(HERE, "../../../../../public/apps/nail-studio/index.html"),
    "utf8",
  );
  assert.match(studio, /function emitHandoff/);
  assert.match(studio, /imageDataUrl/);
  assert.match(studio, /emitHandoff\('chat'\)/);
  assert.match(studio, /emitHandoff\('quote'\)/);
});
