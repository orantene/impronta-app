import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src/components/admin/shell/internal/talent");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("TUL-542: Today 'Edit site' opens the page builder by real navigation", () => {
  const today = read("pages/TodayPage.tsx");
  assert.match(today, /onOpenSite=\{\(\) => openAgendaPath\("\/talent\/page-builder", "public-page"\)\}/);
  assert.doesNotMatch(today, /onOpenSite=\{\(\) => setTalentPage\("public-page"\)\}/);
  // openAgendaPath hard-navigates non-booking paths (page-builder is outside the shell).
  assert.match(today, /window\.location\.assign\(/);
});

test("TUL-542: Today keeps a separate 'View website' link", () => {
  const agenda = read("agenda/AgendaTodayPage.tsx");
  assert.match(agenda, /copy\.t\("View website"\)/);
  assert.match(agenda, /copy\.t\("Edit site"\)/);
});
