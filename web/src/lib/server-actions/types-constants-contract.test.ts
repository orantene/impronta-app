/**
 * Characterization — pure exported constants/enums of the server-action
 * layer (the `.types.ts` siblings + the watermark default). These exist
 * because Next.js forbids non-async exports from `"use server"` files, so
 * each enum/limit was extracted into a sibling module. They are the
 * "status enums / limits" the layer validates against; pin exact CURRENT
 * values + their cross-constant invariants so a refactor that drifts them
 * is caught. Pure: zero DB / auth / request scope.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PROFICIENCY_LEVELS,
  PROFICIENCY_META,
  MAX_TOTAL_SKILLS,
  type ProficiencyLevel,
} from "./admin-talent-skills.types";
import { MAX_CONTEXTS_PER_TALENT } from "./admin-talent-contexts.types";
import { DEFAULT_WATERMARK_PRESET } from "./admin-workspace-settings-constants";

// ─────────────────────────────────────────────────────────────────────────
// Talent skills — proficiency ladder
// ─────────────────────────────────────────────────────────────────────────

describe("admin-talent-skills.types", () => {
  it("PROFICIENCY_LEVELS — exact ordered ladder (5 rungs)", () => {
    assert.deepEqual(PROFICIENCY_LEVELS, [
      "beginner",
      "intermediate",
      "advanced",
      "expert",
      "master",
    ]);
  });

  it("PROFICIENCY_META keys === PROFICIENCY_LEVELS (no orphan / missing rung)", () => {
    assert.deepEqual(
      Object.keys(PROFICIENCY_META).sort(),
      [...PROFICIENCY_LEVELS].sort(),
    );
  });

  it("dots are 1..5 and strictly increase along the ladder order", () => {
    const dots = PROFICIENCY_LEVELS.map((l) => PROFICIENCY_META[l].dots);
    assert.deepEqual(dots, [1, 2, 3, 4, 5]);
    for (let i = 1; i < dots.length; i++) {
      assert.ok(dots[i]! > dots[i - 1]!, "dots strictly increasing");
    }
  });

  it("each level's label is the Title-case of its key; description is non-empty", () => {
    for (const lvl of PROFICIENCY_LEVELS) {
      const meta = PROFICIENCY_META[lvl];
      assert.equal(meta.label, lvl[0]!.toUpperCase() + lvl.slice(1));
      assert.ok(meta.description.length > 0);
    }
  });

  it("MAX_TOTAL_SKILLS is 9", () => {
    assert.equal(MAX_TOTAL_SKILLS, 9);
  });

  it("ProficiencyLevel union ↔ array stay in sync (compile-time proof)", () => {
    // If the union gains/loses a member without the array following, this
    // assignment stops compiling — that's the contract.
    const all: ProficiencyLevel[] = [
      "beginner",
      "intermediate",
      "advanced",
      "expert",
      "master",
    ];
    assert.deepEqual([...PROFICIENCY_LEVELS].sort(), [...all].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Talent contexts — hard cap
// ─────────────────────────────────────────────────────────────────────────

describe("admin-talent-contexts.types", () => {
  it("MAX_CONTEXTS_PER_TALENT is 100", () => {
    assert.equal(MAX_CONTEXTS_PER_TALENT, 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Watermark default — must be a valid preset per the (module-private)
// watermarkPresetSchema bounds documented in admin-workspace-settings.ts
// ─────────────────────────────────────────────────────────────────────────

describe("DEFAULT_WATERMARK_PRESET", () => {
  it("exact current default shape (watermark OFF by default)", () => {
    assert.deepEqual(DEFAULT_WATERMARK_PRESET, {
      enabled: false,
      position: "br",
      size_pct: 12,
      opacity: 0.6,
      padding_pct: 4,
      variant: "light",
    });
  });

  it("conforms to the documented schema bounds (default must itself be valid)", () => {
    const p = DEFAULT_WATERMARK_PRESET;
    assert.equal(typeof p.enabled, "boolean");
    // watermarkPresetSchema: position ∈ the 9-cell grid; default is a corner.
    assert.ok(
      ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"].includes(
        p.position,
      ),
    );
    assert.ok(p.size_pct >= 4 && p.size_pct <= 25, "size_pct ∈ [4,25]");
    assert.ok(p.opacity >= 0 && p.opacity <= 1, "opacity ∈ [0,1]");
    assert.ok(
      p.padding_pct >= 0 && p.padding_pct <= 10,
      "padding_pct ∈ [0,10]",
    );
    assert.ok(["light", "dark"].includes(p.variant));
  });
});
