import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultPostLayout,
  defaultPostLayoutForDesign,
  parsePostLayout,
  POST_LAYOUT_DESIGN_SLUGS,
  toPostLayoutEnvelope,
  type PostLayoutEnvelope,
} from "./post-layout";
import { ensurePostLayout, type PostLayoutStore } from "./post-layout-store";
import type { PostScope } from "./posts-writer";

const TALENT: PostScope = { kind: "talent", talentProfileId: "22222222-2222-4222-8222-222222222222" };
const TENANT: PostScope = { kind: "tenant", tenantId: "11111111-1111-4111-8111-111111111111" };

class Fake implements PostLayoutStore {
  talentLayout: unknown = null;
  rows = new Map<string, { id: string; blocks: unknown }>();
  constructor(private readonly slug: string | null) {}
  async findWorkspaceLayout(_t: string, locale: string) {
    return this.rows.get(locale) ?? null;
  }
  async insertWorkspaceLayout(_t: string, locale: string, envelope: PostLayoutEnvelope) {
    const row = { id: `row-${locale}`, blocks: envelope };
    this.rows.set(locale, row);
    return row;
  }
  async updateWorkspaceLayout() {
    return true;
  }
  async readTalentLayout() {
    return this.talentLayout;
  }
  async writeTalentLayout(_id: string, envelope: PostLayoutEnvelope) {
    this.talentLayout = envelope;
    return true;
  }
  async readTalentDesignSlug() {
    return this.slug;
  }
}

test("every registered slug yields a valid layout with es and en copy", () => {
  for (const slug of POST_LAYOUT_DESIGN_SLUGS) {
    for (const locale of ["es", "en"]) {
      const sections = defaultPostLayoutForDesign(slug, locale);
      assert.deepEqual(parsePostLayout(toPostLayoutEnvelope(sections)), sections, `${slug}/${locale}`);
      for (const s of sections) if (s.type === "blog_index") assert.ok(s.heading && s.heading.length > 0);
    }
    const es = JSON.stringify(defaultPostLayoutForDesign(slug, "es"));
    const en = JSON.stringify(defaultPostLayoutForDesign(slug, "en"));
    assert.notEqual(es, en, `${slug} localizes its heading`);
  }
});

test("unknown, empty and null slugs fall back to the generic default byte for byte", () => {
  for (const slug of [null, undefined, "", "default", "nope", "__proto__", "constructor"]) {
    for (const locale of ["es", "en"]) {
      assert.equal(JSON.stringify(defaultPostLayoutForDesign(slug, locale)), JSON.stringify(defaultPostLayout(locale)));
    }
  }
});

test("archetypes differ: editorial keeps author, minimal drops it, bold has 4 cards", () => {
  assert.equal(defaultPostLayoutForDesign("editorial", "en").some((s) => s.type === "post_author"), true);
  assert.equal(defaultPostLayoutForDesign("minimal", "en").some((s) => s.type === "post_author"), false);
  const bold = defaultPostLayoutForDesign("bold", "en").find((s) => s.type === "blog_index");
  assert.equal(bold?.type === "blog_index" ? bold.limit : 0, 4);
});

test("first creation uses the per-design default; an existing layout is never overwritten", async () => {
  const store = new Fake("minimal");
  const first = await ensurePostLayout(store, TALENT, "en");
  assert.equal(first?.created, true);
  assert.deepEqual(first?.sections, defaultPostLayoutForDesign("minimal", "en"));
  // The design changes later; the saved layout stays.
  const later = new Fake("bold");
  later.talentLayout = store.talentLayout;
  const again = await ensurePostLayout(later, TALENT, "en");
  assert.equal(again?.created, false);
  assert.deepEqual(again?.sections, defaultPostLayoutForDesign("minimal", "en"));
});

test("talent without a design slug and workspace sites get the generic default", async () => {
  const t = await ensurePostLayout(new Fake(null), TALENT, "es");
  assert.deepEqual(t?.sections, defaultPostLayout("es"));
  const w = await ensurePostLayout(new Fake("bold"), TENANT, "es");
  assert.deepEqual(w?.sections, defaultPostLayout("es"));
});
