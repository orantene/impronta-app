/**
 * The talent inbox (/talent/inbox) must not draw English literals on a Spanish
 * UI. Each touched file renders its strings through copy.t(...), and every key
 * has an ES row in the dashboard catalog.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { translateDashboardText } from "./dashboard-i18n";

const DIR = __dirname;
const read = (rel: string) => readFileSync(join(DIR, rel), "utf8");

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SHELL = read("messages/TalentJobShell.tsx");
const SHELL_CODE = stripComments(SHELL);
const LAYOUT = read("messages/shared/inbox-layout-1.tsx");
const IDENTITY = read("messages/shared/inbox-identity-1.tsx");

// English literals the defect named, plus the rest of the inbox chrome.
const KEYS = [
  "My jobs", "All jobs", "Inquiry", "Hold", "Booked", "Past", "Coordinating",
  "awaiting you", "NEW", "Search jobs…", "Nothing in this view",
  "Try a different keyword, or clear the search.", "Clear search",
  "No job selected", "Collapse jobs list", "Expand jobs list",
  "Today", "Yesterday", "This week", "Older",
];

describe("talent inbox i18n", () => {
  it("TalentJobShell wires the dashboard text hook and the date-group translator", () => {
    assert.match(SHELL, /useDashboardText\(\)/);
    assert.match(SHELL, /\(s\) => copy\.t\(s\)/);
  });

  it("no raw English literal for the named strings outside copy.t(...)", () => {
    const literals = [
      "My jobs", "All jobs", "Coordinating", "awaiting you", "NEW", "Clear search",
      "Nothing in this view", "Search jobs…", "No job selected",
      "Try a different keyword, or clear the search.",
    ];
    for (const lit of literals) {
      const raw = new RegExp(`(?<!copy\\.t\\()(["'\`>])${lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'\`<])`);
      assert.doesNotMatch(SHELL_CODE, raw, `raw literal "${lit}" in TalentJobShell.tsx`);
    }
  });

  it("filter chips are translated", () => {
    for (const k of ["All jobs", "Inquiry", "Hold", "Booked", "Past", "Coordinating"]) {
      assert.ok(SHELL.includes(`label: copy.t("${k}")`), `chip ${k}`);
    }
  });

  it("rail, mobile handle, hover actions and search pill are translated", () => {
    assert.match(LAYOUT, /copy\.t\("Expand jobs list"\)/);
    assert.match(LAYOUT, /copy\.t\("Open jobs list"\)/);
    assert.match(IDENTITY, /copy\.t\("Mark unread"\)/);
    assert.match(IDENTITY, /copy\.t\("Clear \(Esc\)"\)/);
    assert.doesNotMatch(LAYOUT, /\{count\} jobs/);
  });

  it("every key has a Spanish row that differs from the English", () => {
    for (const k of KEYS) {
      const es = translateDashboardText(k, "es");
      assert.notEqual(es, k, `missing ES for "${k}"`);
    }
    assert.equal(translateDashboardText("Today", "es"), "Hoy");
    assert.equal(translateDashboardText("Yesterday", "es"), "Ayer");
  });
});
