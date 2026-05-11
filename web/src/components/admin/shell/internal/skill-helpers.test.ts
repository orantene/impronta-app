import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

import {
  countSecondaryParents,
  groupSkillsByRoleParent,
  pickFeaturedSkillTermId,
} from "./_skill-helpers";

function s(partial: Partial<ResolvedSkill>): ResolvedSkill {
  return {
    skill_term_id: "term",
    skill_slug: "slug",
    skill_name_en: "Skill",
    skill_name_es: null,
    is_generic_fallback: false,
    parent_category_id: null,
    parent_category_slug: null,
    parent_category_name_en: null,
    relationship_type: "primary_role",
    proficiency_level: null,
    years_experience: null,
    display_order: 0,
    is_verified: false,
    verified_at: null,
    verified_by_tenant_id: null,
    verification_note: null,
    created_at: "2026-01-01T00:00:00Z",
    booking_count: 0,
    last_booked_at: null,
    ...partial,
  };
}

describe("groupSkillsByRoleParent", () => {
  it("groups by relationship_type|parent_category_id", () => {
    const skills: ResolvedSkill[] = [
      s({ skill_term_id: "a", relationship_type: "primary_role", parent_category_id: "p1", parent_category_name_en: "Performers" }),
      s({ skill_term_id: "b", relationship_type: "primary_role", parent_category_id: "p1", parent_category_name_en: "Performers" }),
      s({ skill_term_id: "c", relationship_type: "secondary_role", parent_category_id: "p2", parent_category_name_en: "Music DJs" }),
    ];
    const m = groupSkillsByRoleParent(skills);
    assert.equal(m.size, 2);
    assert.equal(m.get("primary_role|p1")?.skills.length, 2);
    assert.equal(m.get("secondary_role|p2")?.skills.length, 1);
    assert.equal(m.get("primary_role|p1")?.parent_name, "Performers");
  });

  it("handles null parent_category_id by emitting empty-string key suffix", () => {
    const m = groupSkillsByRoleParent([s({ parent_category_id: null })]);
    assert.equal(m.size, 1);
    assert.ok(m.has("primary_role|"));
  });

  it("returns an empty map for an empty list", () => {
    assert.equal(groupSkillsByRoleParent([]).size, 0);
  });
});

describe("pickFeaturedSkillTermId", () => {
  it("returns the term_id with the lowest display_order", () => {
    const skills = [
      s({ skill_term_id: "a", display_order: 30 }),
      s({ skill_term_id: "b", display_order: 1 }),
      s({ skill_term_id: "c", display_order: 20 }),
    ];
    assert.equal(pickFeaturedSkillTermId(skills), "b");
  });

  it("returns null for empty / null input", () => {
    assert.equal(pickFeaturedSkillTermId([]), null);
    assert.equal(pickFeaturedSkillTermId(null), null);
  });

  it("does not mutate the input list", () => {
    const skills = [
      s({ skill_term_id: "a", display_order: 30 }),
      s({ skill_term_id: "b", display_order: 1 }),
    ];
    pickFeaturedSkillTermId(skills);
    assert.equal(skills[0].skill_term_id, "a");
    assert.equal(skills[1].skill_term_id, "b");
  });
});

describe("countSecondaryParents", () => {
  it("counts distinct secondary parent_category_ids", () => {
    const skills = [
      s({ relationship_type: "primary_role", parent_category_id: "p1" }),
      s({ relationship_type: "secondary_role", parent_category_id: "p2" }),
      s({ relationship_type: "secondary_role", parent_category_id: "p3" }),
      s({ relationship_type: "secondary_role", parent_category_id: "p2" }),
    ];
    assert.equal(countSecondaryParents(skills), 2);
  });

  it("ignores primary_role rows", () => {
    const skills = [
      s({ relationship_type: "primary_role", parent_category_id: "p1" }),
      s({ relationship_type: "primary_role", parent_category_id: "p2" }),
    ];
    assert.equal(countSecondaryParents(skills), 0);
  });

  it("returns 0 for null / empty input", () => {
    assert.equal(countSecondaryParents(null), 0);
    assert.equal(countSecondaryParents([]), 0);
  });
});
