/**
 * Talent dashboard visual language. Action fill is not ink, and the
 * selections that used to be black buttons stay soft.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("talent action teal is separate from ink", () => {
  const src = read("components/admin/shell/internal/talent/visual/tokens.ts");
  assert.match(src, /action: "#3B8277"/);
  assert.match(src, /ink: "#26313B"/);
  assert.match(src, /\["--tc-primary" as string\]: TALENT_VISUAL\.ink/);
  assert.match(src, /\["--tc-action" as string\]: TALENT_VISUAL\.action/);
  assert.match(src, /\["--tulala-primary-fill" as string\]: TALENT_VISUAL\.action/);
});

test("fee choice and client filters are not ink fills", () => {
  const fee = read("components/talent/money/FeePayerCard.tsx");
  assert.doesNotMatch(fee, /bg-admin-ink/);
  assert.match(fee, /bg-\[var\(--tc-soft\)\]/);
  assert.match(fee, /bg-\[var\(--tc-action\)\]/);
  const clients = read("components/admin/shell/internal/talent/pages/ClientsPage.tsx");
  assert.doesNotMatch(clients, /bg-admin-ink/);
  assert.match(clients, /role="tab"/);
  assert.match(clients, /bg-\[var\(--tc-soft\)\]/);
});

test("talent shell mounts the visual scope and agency buttons stay on the shared fill", () => {
  const shell = read("components/admin/shell/admin-shell-client.tsx");
  assert.match(shell, /data-talent-visual=\{talentVisual \? "1" : undefined\}/);
  assert.match(shell, /state\.surface === "talent"/);
  const buttons = read("components/admin/shell/internal/primitives/buttons.tsx");
  assert.match(buttons, /var\(--tulala-primary-fill, \$\{COLORS\.fill\}\)/);
  assert.doesNotMatch(buttons, /#3B8277/);
});

test("service filters are soft and service actions are teal", () => {
  const home = read("components/talent/services/ServicesHome.tsx");
  assert.doesNotMatch(home, /bg-admin-ink text-white/);
  assert.match(home, /bg-\[var\(--tc-soft\)\]/);
  assert.match(home, /bg-\[var\(--tc-action\)\]/);
  const ledger = read("components/talent/money/EarningsLedger.tsx");
  assert.doesNotMatch(ledger, /background: active \? COLORS\.fill/);
});

test("today website actions are teal and the mode pill falls back to slate", () => {
  const hero = read("components/talent/website-reward/WebsiteTodayHero.tsx");
  assert.match(hero, /data-testid="website-today-hero-cta"[\s\S]*bg-\[var\(--tc-action\)\]/);
  assert.doesNotMatch(hero, /bg-emerald-900 px-5/);
  const mode = read("components/admin/shell/internal/page-modules/IdentityBar-2.tsx");
  assert.match(mode, /var\(--tc-soft, \$\{COLORS\.fill\}\)/);
});

test("today week strip marks the current day with a soft tint", () => {
  const strip = read("components/admin/shell/internal/talent/shared/week-rhythm-1.tsx");
  assert.match(strip, /today:\s*\{[^}]*bg: "var\(--tc-soft\)"/);
  assert.match(strip, /today:\s*\{[^}]*border: "var\(--tc-action\)"/);
  assert.doesNotMatch(strip, /today:\s*\{[^}]*COLORS\.accent/);
  assert.doesNotMatch(strip, /today:\s*\{[^}]*label: "#fff"/);
});

test("agenda primary token is type, not the solid button fill", () => {
  const agenda = read("components/admin/shell/internal/talent/agenda/primitives/tokens.ts");
  assert.match(agenda, /primary: TALENT_VISUAL\.ink/);
  assert.match(agenda, /action: TALENT_VISUAL\.action/);
  const record = read("components/admin/shell/internal/talent/agenda/AgendaBookingRecord.tsx");
  assert.match(record, /bg-\[var\(--tc-action\)\]/);
  assert.doesNotMatch(record, /bg-\[var\(--tc-primary\)\]/);
});
