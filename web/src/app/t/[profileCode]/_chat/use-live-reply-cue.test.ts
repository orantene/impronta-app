import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { hasFreshReply } from "./use-live-reply-cue";

const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

test("e2e P1: a reply that arrived after she last looked is a fresh reply", () => {
  assert.equal(hasFreshReply([{ lastMessageAuthor: "agency", lastMessageAt: at(5_000) }], T0), true);
});

test("her own message, an older reply and an empty list are not", () => {
  assert.equal(hasFreshReply([{ lastMessageAuthor: "guest", lastMessageAt: at(5_000) }], T0), false);
  assert.equal(hasFreshReply([{ lastMessageAuthor: "agency", lastMessageAt: at(-5_000) }], T0), false);
  assert.equal(hasFreshReply([{ lastMessageAuthor: null, lastMessageAt: null }], T0), false);
  assert.equal(hasFreshReply([], T0), false);
});

test("any one inquiry with a fresh reply lights the launcher", () => {
  assert.equal(
    hasFreshReply(
      [
        { lastMessageAuthor: "guest", lastMessageAt: at(9_000) },
        { lastMessageAuthor: "agency", lastMessageAt: at(1_000) },
      ],
      T0,
    ),
    true,
  );
});

test("the launcher uses the live cue and draws a persistent dot, not only a one-time pulse", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const launcher = readFileSync(join(here, "TalentProfileChatLauncher.tsx"), "utf8");
  assert.match(launcher, /useLiveReplyCue\(\{ open,/);
  assert.match(launcher, /\(unreadCoordinatorReply && !replySeen\) \|\| liveReply/);
  assert.match(launcher, /data-launcher-unread/);
});
