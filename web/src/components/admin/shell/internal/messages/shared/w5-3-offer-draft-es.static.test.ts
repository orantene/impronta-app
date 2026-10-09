/**
 * TUL-519 W5-3 — talent offer draft editor Spanish + first-draft hang.
 * Static pins so the Live QA strings and Iniciando lag cannot regress.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("W5-3: add-line and choose-talent copy are accented Spanish, no em dashes", () => {
  const es = JSON.parse(read("messages/es.json")) as {
    dashboard: { adminTabs: { lineup: { addLineItem: string; chooseTalent: string } } };
  };
  const en = JSON.parse(read("messages/en.json")) as {
    dashboard: { adminTabs: { lineup: { addLineItem: string; chooseTalent: string } } };
  };
  assert.equal(es.dashboard.adminTabs.lineup.addLineItem, "+ Añadir línea");
  assert.equal(es.dashboard.adminTabs.lineup.chooseTalent, "Elige talento");
  assert.equal(en.dashboard.adminTabs.lineup.chooseTalent, "Choose talent");
  assert.equal(en.dashboard.adminTabs.lineup.addLineItem, "+ Add line item");
  for (const s of [
    es.dashboard.adminTabs.lineup.addLineItem,
    es.dashboard.adminTabs.lineup.chooseTalent,
    en.dashboard.adminTabs.lineup.addLineItem,
    en.dashboard.adminTabs.lineup.chooseTalent,
  ]) {
    assert.doesNotMatch(s, /\u2014/, `em dash in product copy: ${s}`);
    assert.doesNotMatch(s, /\bTalent\b/, `English Talent word in copy: ${s}`);
  }
});

test("W5-3: CreateOfferButton does not keep Starting pending on router.refresh", () => {
  const src = read("src/components/admin/shell/internal/messages/shared/machinery-11.tsx");
  const btn = src.slice(src.indexOf("export function CreateOfferButton"));
  assert.match(btn, /await onCreated\?\.\(\)/);
  assert.match(btn, /void router\.refresh\(\)/);
  assert.doesNotMatch(btn, /await router\.refresh\(\)/);
});

test("W5-3: talent thread title is client-only; brief is on the subline; actions wrap", () => {
  const src = read("src/components/admin/shell/internal/messages/talent-1.tsx");
  const header = src.slice(src.indexOf("export function TalentJobShellHeader"), src.indexOf("export type ShellHeaderInput"));
  assert.match(header, /data-tulala-thread-title/);
  assert.match(header, /data-tulala-thread-brief/);
  assert.match(header, /\{conv\.client\}/);
  assert.match(header, /\[conv\.brief, metaLine\]/);
  assert.doesNotMatch(
    header,
    /\{conv\.client\} <span[^>]*>· \{conv\.brief\}<\/span>/,
  );
  assert.match(header, /\[data-tulala-header-row1\]\{flex-wrap:wrap\}/);
  assert.match(header, /\[data-tulala-header-actions\]\{flex:1 1 100%/);
});
