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
  it("no longer paints the stuck 'Abriendo la conversación…' banner (TUL-1031)", () => {
    assert.doesNotMatch(SRC, /Abriendo la conversaci|Opening conversation/);
  });
  it("Messages keeps the address on the open thread", () => {
    const page = readFileSync(PAGE, "utf8");
    assert.match(page, /`\/talent\/inbox\/\$\{encodeURIComponent\(activeId\)\}`[\s\S]*replaceState\(/);
  });
});
