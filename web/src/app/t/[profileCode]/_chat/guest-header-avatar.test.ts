import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveGuestHeaderAvatar } from "./guest-header-avatar";

const HERE = dirname(fileURLToPath(import.meta.url));

test("AUD-039: logo wins over photo and monogram", () => {
  assert.deepEqual(
    resolveGuestHeaderAvatar({ logoUrl: "https://x/logo.png", photoUrl: "https://x/p.jpg", name: "Jorg" }),
    { kind: "logo", src: "https://x/logo.png" },
  );
});

test("AUD-039: photo when there is no logo", () => {
  assert.deepEqual(
    resolveGuestHeaderAvatar({ logoUrl: "  ", photoUrl: "https://x/p.jpg", name: "Jorg" }),
    { kind: "photo", src: "https://x/p.jpg" },
  );
});

test("AUD-039: monogram only when neither exists", () => {
  assert.deepEqual(resolveGuestHeaderAvatar({ name: "jorg beauty" }), { kind: "monogram", letter: "J" });
  assert.deepEqual(resolveGuestHeaderAvatar({ name: "" }), { kind: "monogram", letter: "•" });
});

test("AUD-039: talent-site dock loads logo + photo and passes them through", () => {
  const dock = readFileSync(join(HERE, "../../../%5Ftalent-site/TalentSiteMessagesDock.tsx"), "utf8");
  assert.match(dock, /logo_url/);
  assert.match(dock, /loadTalentCardThumbs/);
  assert.match(dock, /logoUrl=\{logoUrl\}/);
  assert.match(dock, /photoUrl=\{photoUrl\}/);
  const mount = readFileSync(join(HERE, "TalentProfileChatLauncherMount.tsx"), "utf8");
  assert.match(mount, /photoUrl,/);
  const header = readFileSync(join(HERE, "GuestPanelHeader.tsx"), "utf8");
  assert.match(header, /resolveGuestHeaderAvatar/);
  assert.match(header, /objectFit:\s*"contain"/);
  assert.match(header, /objectFit:\s*"cover"/);
});
