import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/_pin-then-redirect.tsx"), "utf8");
const PAGE = join(process.cwd(), "src/components/admin/shell/internal/talent/pages/messages/MessagesPage.tsx");

describe("TUL-391 / TUL-959 / TUL-956 thread deep link opens in place", () => {
  it("pins the id before the Messages page mounts, without redirecting", () => {
    assert.match(SRC, /useState\(\(\) => \{[^}]*pinNextConversation\(conversationId\)/);
    assert.match(SRC, /<TalentPageRouteSyncer page="messages" \/>/);
    assert.doesNotMatch(SRC, /router\.replace|useRouter/);
  });
  it("announces the opening to screen readers only: no visible full-page banner (TUL-1031)", () => {
    assert.match(SRC, /role="status" aria-live="polite" className="sr-only"/);
    assert.match(SRC, /Abriendo la conversaci/);
    assert.match(SRC, /Opening conversation/);
    assert.doesNotMatch(SRC, /padding: 40|textAlign: "center"/, "the visible banner must stay gone");
  });
  it("clears the status after it has been announced", () => {
    assert.match(SRC, /setTimeout\(\(\) => setStatus\(""\)/);
  });
  it("moves focus to the Messages region on a deep link (a11y)", () => {
    const page = readFileSync(PAGE, "utf8");
    assert.match(page, /regionRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
    assert.doesNotMatch(page, /eslint-disable-next-line react-hooks\/exhaustive-deps/, "no new hook-deps suppression (ratchet is frozen)");
    assert.match(page, /ref=\{regionRef\}\s+tabIndex=\{-1\}\s+role="region"/);
  });
  it("Messages keeps the address on the open thread", () => {
    const page = readFileSync(PAGE, "utf8");
    assert.match(page, /`\/talent\/inbox\/\$\{encodeURIComponent\(activeId\)\}`[\s\S]*replaceState\(/);
  });
});
