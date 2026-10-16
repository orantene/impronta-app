/** TUL-1067: unified dock tab and action labels, wrapped titles, banner reset. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "..", "..", "..");
const comp = readFileSync(join(HERE, "GuestDockCatalog.tsx"), "utf8");
const msgs = (l: string) => (JSON.parse(readFileSync(join(WEB, "messages", `${l}.json`), "utf8")) as { public: { guestChat: Record<string, string> } }).public.guestChat;

test("sub-tab names are fixed per locale", () => {
  assert.deepEqual([msgs("en").catalogServices, msgs("en").catalogPackages, msgs("en").catalogTalent], ["Services", "Packages", "Talent"]);
  assert.deepEqual([msgs("es").catalogServices, msgs("es").catalogPackages, msgs("es").catalogTalent], ["Servicios", "Paquetes", "Talento"]);
});

test("tab labels never ellipsize and the strip scrolls", () => {
  const chip = comp.slice(comp.indexOf("function Chip"), comp.indexOf("function SmallButton"));
  assert.doesNotMatch(chip, /textOverflow/);
  assert.match(chip, /flexShrink: 0/);
  assert.match(comp, /overflowX: "auto"/);
});

test("primary Add and secondary Ask labels", () => {
  for (const [l, add, ask] of [["en", "Add", "Ask"], ["es", "Agregar", "Preguntar"]] as const) {
    const m = msgs(l);
    assert.equal(m.catalogAddInquiry, add);
    assert.equal(m.catalogAddLineup, add);
    assert.equal(m.catalogAdd, add);
    assert.equal(m.catalogAsk, ask);
  }
  assert.equal(msgs("en").catalogInInquiry, "In inquiry");
  assert.equal(msgs("en").catalogInLineup, "In lineup");
});

test("row titles clamp to 2 lines, never single-line ellipsis", () => {
  const titles = comp.match(/fontSize: 13\.5, fontWeight: 600[^}]*\}/g) ?? [];
  assert.ok(titles.length >= 2);
  for (const s of titles) {
    assert.match(s, /WebkitLineClamp: 2/);
    assert.doesNotMatch(s, /nowrap/);
  }
});

test("the banner clears on every sub-tab switch", () => {
  assert.match(comp, /setServiceChip\(label\); setNotice\(null\)/);
  assert.match(comp, /setCategory\(g\.category\); setNotice\(null\)/);
});

test("a11y (09 finding): dock buttons carry the row name, 36px targets, keyboard focus ring", () => {
  const src = readFileSync(join(__dirname, "GuestDockCatalog.tsx"), "utf8");
  assert.match(src, /const ariaLabel = itemName \? `\$\{label\}: \$\{itemName\}` : undefined/);
  assert.equal((src.match(/<SmallButton itemName=\{/g) ?? []).length, (src.match(/<SmallButton\b/g) ?? []).length);
  assert.ok((src.match(/className=\{a11y\.focusRing\}/g) ?? []).length >= 3);
  assert.ok((src.match(/minHeight: 36/g) ?? []).length >= 2);
});
