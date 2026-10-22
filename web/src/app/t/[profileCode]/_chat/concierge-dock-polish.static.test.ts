import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

test("TUL-1795: the dock header shows the full business name (two lines) instead of one clipped line", () => {
  const card = read("app/t/[profileCode]/_chat/CardDockHeader.tsx");
  assert.match(card, /WebkitLineClamp: 2/);
  assert.doesNotMatch(card, /whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" \}\}>\{name\}/);
  const panel = read("app/t/[profileCode]/_chat/GuestPanelHeader.tsx");
  assert.equal((panel.match(/WebkitLineClamp: 2/g) ?? []).length, 2);
});

test("TUL-1795: the active language pill uses a readable foreground/background pair", () => {
  for (const f of ["components/public-language-toggle.tsx", "components/public-header-mobile-menu.tsx"]) {
    const src = read(f);
    assert.match(src, /bg-foreground font-semibold text-background/, f);
    assert.doesNotMatch(src, /\? "bg-muted text-foreground"/, f);
  }
});
