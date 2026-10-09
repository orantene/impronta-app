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

  it("detail view and shared headers route their literals through copy.t with ES rows", () => {
    const SAME_IN_ES = new Set(["Subtotal", "Total", "Chat"]);
    const files = [
      "messages/shared/machinery-13.tsx",
      "messages/shared/inbox-identity-1.tsx",
      "messages/shared/inbox-layout-1.tsx",
      "talent/shared/conversations-1.tsx",
      "messages/TalentJobShell.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      assert.match(src, /useDashboardText\(\)/, `${f} must use useDashboardText`);
      let from = 0;
      for (;;) {
        const at = src.indexOf("copy.t(", from);
        if (at < 0) break;
        let depth = 0;
        let i = at + "copy.t".length;
        const start = i;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")" && --depth === 0) break;
        }
        const call = src.slice(start, i + 1);
        from = i;
        for (const m of call.matchAll(/"((?:[^"\\]|\\.)+)"/g)) {
          const lit = m[1];
          if (!/[A-Za-z]{3,}/.test(lit) || SAME_IN_ES.has(lit)) continue;
          assert.notEqual(translateDashboardText(lit, "es"), lit, `${f}: no ES row for "${lit}"`);
        }
      }
    }
  });

  it("GUEST / Registered identity pill and the Offer-tab hero are not raw English", () => {
    const pill = read("talent/shared/conversations-1.tsx");
    assert.match(pill, /copy\.t\(label\)/);
    assert.equal(translateDashboardText("Guest", "es"), "Invitado");
    const deal = stripComments(read("messages/shared/machinery-13.tsx"));
    for (const lit of ["Your take-home", "Submit my rate", "Edit rate", "Review counter", "Pending rate"]) {
      assert.doesNotMatch(deal, new RegExp(`(?<!copy\\.t\\()["'>]${lit}["'<]`), `raw "${lit}"`);
    }
  });

  it("generated inbox previews have ES rows", () => {
    assert.notEqual(translateDashboardText("Awaiting your response.", "es"), "Awaiting your response.");
  });
});
