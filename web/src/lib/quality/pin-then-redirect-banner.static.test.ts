import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/_pin-then-redirect.tsx"), "utf8");

describe("TUL-1031 PinThenRedirect banner", () => {
  it("is localized (ES + EN) from the dashboard locale", () => {
    assert.match(SRC, /useDashboardLocale/);
    assert.match(SRC, /Abriendo la conversaci/);
    assert.match(SRC, /Opening conversation/);
  });
  it("clears once the URL leaves /inbox/<id>", () => {
    assert.match(SRC, /usePathname/);
    assert.match(SRC, /return null;/);
  });
});
