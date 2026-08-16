import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateTenantTalentTypeAvailability } from "@/lib/talent-taxonomy-service";
import { selectableTalentTypeIds } from "./tenant-talent-type-options";

/**
 * Parity: every talent_type the picker OFFERS must be one the write-path
 * validator ACCEPTS as a primary role. Picker/validator drift is the bug
 * class this pins — roster/new used to offer all 332 leaves Impronta had
 * disabled, and the save then failed on a setting the admin cannot see.
 */

type Term = {
  id: string;
  slug: string;
  name_en: string;
  kind: string | null;
  term_type: string | null;
  parent_id: string | null;
  is_active: boolean;
  archived_at: string | null;
};

const term = (over: Partial<Term> & { id: string }): Term => ({
  slug: over.id,
  name_en: over.id,
  kind: "talent_type",
  term_type: "talent_type",
  parent_id: null,
  is_active: true,
  archived_at: null,
  ...over,
});

// A miniature of the real tree: performers → stage-show-acts → {cabaret-act,
// actor}; performers → dancers → latin-dancer; plus a no-primary category.
const PERFORMERS = term({ id: "performers", kind: null, term_type: "parent_category" });
const STAGE = term({ id: "stage-show-acts", kind: null, term_type: "category_group", parent_id: "performers" });
const DANCERS = term({ id: "dancers", kind: null, term_type: "category_group", parent_id: "performers" });
const CABARET = term({ id: "cabaret-act", parent_id: "stage-show-acts" });
const ACTOR = term({ id: "actor", parent_id: "stage-show-acts" });
const LATIN = term({ id: "latin-dancer", parent_id: "dancers" });
const RETIRED = term({ id: "retired-type", parent_id: "dancers", is_active: false });
const NOPRIM_CAT = term({ id: "kids-family", kind: null, term_type: "parent_category" });
const NOPRIM_GRP = term({ id: "kids-grp", kind: null, term_type: "category_group", parent_id: "kids-family" });
const BABYSITTER = term({ id: "babysitter", parent_id: "kids-grp" });

const TREE = [PERFORMERS, STAGE, DANCERS, CABARET, ACTOR, LATIN, RETIRED, NOPRIM_CAT, NOPRIM_GRP, BABYSITTER];
const TALENT_TYPE_IDS = TREE.filter((t) => t.term_type === "talent_type").map((t) => t.id);

type Setting = { taxonomy_term_id: string; is_enabled: boolean | null; allow_as_primary?: boolean | null; allow_as_secondary?: boolean | null };

function validatorAccepts(id: string, settings: Setting[]): boolean {
  const byId = new Map(TREE.map((t) => [t.id, t] as const));
  const t = byId.get(id)!;
  const ancestors: Term[] = [];
  let p = t.parent_id;
  while (p) {
    const a = byId.get(p)!;
    ancestors.push(a);
    p = a.parent_id;
  }
  const res = evaluateTenantTalentTypeAvailability({
    term: t,
    ancestors,
    settings,
    relationshipType: "primary_role",
  });
  return res.ok;
}

function assertParity(settings: Setting[]) {
  const offered = selectableTalentTypeIds({
    terms: TREE,
    settings,
    talentTypeIds: TALENT_TYPE_IDS,
  });
  for (const id of TALENT_TYPE_IDS) {
    if (offered.has(id)) {
      assert.ok(
        validatorAccepts(id, settings),
        `picker offers "${id}" but the validator rejects it — drift`,
      );
    }
  }
  return offered;
}

describe("tenant talent-type picker ⊆ write-path validator", () => {
  it("no settings rows → everything active is offered and accepted", () => {
    const offered = assertParity([]);
    assert.ok(offered.has("cabaret-act"));
    assert.ok(!offered.has("retired-type"), "inactive term must not be offered");
  });

  it("the Impronta launch-curation shape: leaf disabled under enabled parents", () => {
    const settings: Setting[] = [{ taxonomy_term_id: "cabaret-act", is_enabled: false }];
    const offered = assertParity(settings);
    assert.ok(!offered.has("cabaret-act"), "explicitly-disabled leaf must not be offered");
    assert.ok(offered.has("actor"), "sibling stays offered");
  });

  it("disabled category_group hides its leaves (no leaf rows exist)", () => {
    const settings: Setting[] = [{ taxonomy_term_id: "stage-show-acts", is_enabled: false }];
    const offered = assertParity(settings);
    assert.ok(!offered.has("cabaret-act"));
    assert.ok(!offered.has("actor"));
    assert.ok(offered.has("latin-dancer"));
  });

  it("disabled parent_category hides the whole subtree", () => {
    const settings: Setting[] = [{ taxonomy_term_id: "performers", is_enabled: false }];
    const offered = assertParity(settings);
    assert.ok(!offered.has("cabaret-act"));
    assert.ok(!offered.has("latin-dancer"));
    assert.ok(offered.has("babysitter"));
  });

  it("allow_as_primary=false on the parent-category gate blocks primary picks", () => {
    const settings: Setting[] = [
      { taxonomy_term_id: "kids-family", is_enabled: true, allow_as_primary: false },
    ];
    const offered = assertParity(settings);
    assert.ok(!offered.has("babysitter"), "primary picker must honor the allow_as_primary gate");
    assert.ok(offered.has("cabaret-act"));
  });

  it("full sweep: 32 random overlay combinations never drift", () => {
    // Deterministic pseudo-random (no Math.random in this harness).
    let seed = 0x5eed;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let round = 0; round < 32; round += 1) {
      const settings: Setting[] = [];
      for (const t of TREE) {
        const r = rnd();
        if (r < 0.25) settings.push({ taxonomy_term_id: t.id, is_enabled: false });
        else if (r < 0.4) settings.push({ taxonomy_term_id: t.id, is_enabled: true, allow_as_primary: rnd() < 0.5 ? false : true });
      }
      assertParity(settings);
    }
  });
});
