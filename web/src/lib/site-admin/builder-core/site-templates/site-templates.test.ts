/**
 * site-templates — the acceptance the three layers must pass before a tenant
 * ever sees them. Runs in the `test:builder` lane (D-TPL-9).
 *
 *  1. every Look × every family × both locales instantiates to six non-empty,
 *     validator-clean pages with no leftover marker;
 *  2. a Look contains no business-type block and no business-type word;
 *  3. every id in `business-types.ts` resolves to components with a catalogue
 *     and a transaction block;
 *  4. with NO facts, nothing is invented: honest empty lines, no wa.me link,
 *     no price-shaped text;
 *  5. with NO imagery, frames are dropped and reported, never rendered empty;
 *  6. every theme patch passes `validateThemePatch`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { validateThemePatch } from "@/lib/site-admin/tokens/registry";
import { BUSINESS_FAMILIES, BUSINESS_TYPES, type BusinessFamilyId } from "@/lib/words/business-types";

import {
  BUSINESS_COMPONENTS,
  COMPONENT_EMPTY_STATES,
  LOOKS,
  LOOK_COPY_DEFAULTS,
  SITE_PAGE_ROLES,
  buildComponentsForType,
  emptyImageResolver,
  exampleContext,
  fixtureImageResolver,
  instantiateSite,
  resolveComponentsForType,
  resolveIdentityTemplate,
  type ComponentId,
  type SiteLocale,
} from "./index";

const TYPE_BLOCK_KINDS = new Set(["menu_board", "reserve_table", "session_picker", "ticket_picker", "directory", "featured_talent", "talent_type_grid", "hero_search", "location_map", "form", "stats"]);
const TYPE_WORDS = /\b(menú|menu|platillo|dish|mesa|table|clase|class|sesión|session|boleto|ticket|roster|talento|talent|salón|salon|barber|spa|gym|tour|cita|appointment|restaurante|restaurant|servicio|service)s?\b/i;
const PRICE_SHAPE = /\$\s?\d|\d+\s?(mxn|usd|€)/i;

const FAMILY_TYPE: Record<BusinessFamilyId, string> = Object.fromEntries(
  BUSINESS_FAMILIES.map((f) => [f, BUSINESS_TYPES.find((t) => t.family === f)?.id ?? "custom"]),
) as Record<BusinessFamilyId, string>;

function textOf(tree: unknown): string {
  return JSON.stringify(tree);
}

test("every Look × family × locale instantiates clean", () => {
  for (const look of LOOKS) {
    for (const family of BUSINESS_FAMILIES) {
      for (const locale of ["es", "en"] as SiteLocale[]) {
        const typeId = FAMILY_TYPE[family];
        const ctx = exampleContext(family, typeId, locale);
        const result = instantiateSite({
          look,
          locale,
          identity: ctx.identity,
          images: fixtureImageResolver,
          components: buildComponentsForType(typeId, ctx),
        });
        assert.deepEqual(result.issues, [], `${look.id}/${family}/${locale}: ${result.issues.join(" | ")}`);
        assert.ok(result.ok);
        for (const role of SITE_PAGE_ROLES) {
          assert.ok(result.pages[role].length > 0, `${look.id}/${family}/${locale}: ${role} empty`);
        }
        assert.ok(result.shell.header.length > 0 && result.shell.footer.length > 0);
        const all = textOf(result);
        assert.doesNotMatch(all, /look:\/\/image\//, "leftover image marker");
        assert.doesNotMatch(all, /\{\{copy\./, "leftover copy marker");
        assert.doesNotMatch(all, /\{\{business\./, "leftover identity marker");
        assert.doesNotMatch(all, /\{\{href\./, "leftover href marker");
        // The type's catalogue and transaction blocks reached their pages.
        const ids = resolveComponentsForType(typeId);
        const catalogueKinds = ids.map((id) => BUSINESS_COMPONENTS[id]).filter((c) => c.slot === "catalogue");
        assert.ok(catalogueKinds.length > 0);
        assert.ok(result.filledSlots.includes("catalogue"), `${look.id}/${family}: catalogue slot unfilled`);
        assert.ok(result.filledSlots.includes("transaction"), `${look.id}/${family}: transaction slot unfilled`);
        assert.ok(result.filledSlots.includes("map"));
        assert.ok(result.filledSlots.includes("gallery"));
      }
    }
  }
});

test("a Look carries no business-type block and no business-type word", () => {
  for (const look of LOOKS) {
    const trees = [...Object.values(look.pages), look.shell.header, look.shell.footer];
    const kinds = new Set<string>();
    const walk = (n: { kind: string; children?: unknown[] }) => {
      kinds.add(n.kind);
      for (const c of n.children ?? []) walk(c as { kind: string; children?: unknown[] });
    };
    for (const tree of trees) for (const n of tree) walk(n as { kind: string; children?: unknown[] });
    for (const k of kinds) assert.ok(!TYPE_BLOCK_KINDS.has(k), `${look.id} contains type block ${k}`);
    for (const [key, pair] of Object.entries(look.copy)) {
      assert.doesNotMatch(pair.es, TYPE_WORDS, `${look.id} copy ${key} (es) has a type word`);
      assert.doesNotMatch(pair.en, TYPE_WORDS, `${look.id} copy ${key} (en) has a type word`);
      assert.doesNotMatch(pair.es + pair.en, /[—–]/, `${look.id} copy ${key} has an em/en dash`);
    }
  }
  for (const [key, pair] of Object.entries(LOOK_COPY_DEFAULTS)) {
    assert.doesNotMatch(pair.es + " " + pair.en, TYPE_WORDS, `default copy ${key} has a type word`);
  }
});

test("every business type resolves to catalogue + transaction components", () => {
  const ids = [...BUSINESS_TYPES.map((t) => t.id), "custom"];
  assert.ok(ids.length >= 120, `expected ~120 types, got ${ids.length}`);
  for (const id of ids) {
    const comps = resolveComponentsForType(id).map((c) => BUSINESS_COMPONENTS[c]);
    assert.ok(comps.length >= 3, `${id}: only ${comps.length} components`);
    assert.ok(comps.some((c) => c.slot === "catalogue"), `${id}: no catalogue component`);
    assert.ok(comps.some((c) => c.slot === "transaction"), `${id}: no transaction component`);
    assert.ok(comps.some((c) => c.id === "location_hours"), `${id}: no location/hours`);
  }
  // Every component has bilingual empty-state copy (may be empty when the
  // component simply vanishes without facts).
  for (const id of Object.keys(BUSINESS_COMPONENTS) as ComponentId[]) {
    const e = COMPONENT_EMPTY_STATES[id];
    assert.ok(e, `${id}: missing empty state entry`);
    assert.equal(!!e.es, !!e.en, `${id}: empty state must exist in both languages or neither`);
  }
});

test("with no facts nothing is invented", () => {
  const bare = exampleContext("dining", "restaurant", "es");
  bare.identity = { businessName: "Sin Datos" };
  bare.services = null;
  bare.staffCount = null;
  bare.yearsExperience = null;
  bare.example = false;
  const components = buildComponentsForType("restaurant", bare);
  const result = instantiateSite({ look: LOOKS[0], locale: "es", identity: bare.identity, images: fixtureImageResolver, components });
  const all = textOf(result);
  assert.doesNotMatch(all, /wa\.me/, "no WhatsApp number → no WhatsApp link");
  assert.doesNotMatch(all, PRICE_SHAPE, "no price-shaped text");
  assert.match(all, /El menú aún no está publicado\./);
  assert.doesNotMatch(all, /Playa del Carmen|Casa Ejemplo/, "example identity must not leak");
  assert.ok(!result.filledSlots.includes("whatsapp"));
  assert.ok(!result.filledSlots.includes("home.proof"));

  const salon = exampleContext("beauty", "nail-salon", "en");
  salon.identity = { businessName: "No Facts Salon" };
  salon.services = [];
  salon.staffCount = null;
  const salonResult = instantiateSite({ look: LOOKS[1], locale: "en", identity: salon.identity, images: fixtureImageResolver, components: buildComponentsForType("nail-salon", salon) });
  assert.match(textOf(salonResult), /Services are not published yet\./);
});

test("with no imagery frames are dropped and reported, never rendered empty", () => {
  const ctx = exampleContext("tours", "private-tours", "es");
  const result = instantiateSite({ look: LOOKS[2], locale: "es", identity: ctx.identity, images: emptyImageResolver, components: buildComponentsForType("private-tours", { ...ctx, images: emptyImageResolver }) });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => /image slot "hero" unresolved/.test(i)));
  assert.doesNotMatch(textOf(result), /"kind":"image"/, "no image node survives without a source");
  for (const role of SITE_PAGE_ROLES) assert.ok(result.pages[role].length > 0, `${role} still renders its copy`);
});

test("identity templates drop optional groups cleanly", () => {
  const id = { businessName: "Casa" };
  assert.equal(resolveIdentityTemplate("Ven[[ en {{business.city}}]] hoy.", id), "Ven hoy.");
  assert.equal(resolveIdentityTemplate("Ven[[ en {{business.city}}]] hoy.", { ...id, city: "Tulum" }), "Ven en Tulum hoy.");
  assert.equal(resolveIdentityTemplate("[[{{business.tagline}}]]", id), "");
  assert.equal(resolveIdentityTemplate("{{business.name}}", id), "Casa");
  assert.equal(resolveIdentityTemplate("{{href.transaction}}", id), "/book");
  assert.equal(resolveIdentityTemplate("{{href.catalogue}}", { ...id, pageHrefs: { catalogue: "/menu" } }), "/menu");
});

test("every Look theme patch passes validateThemePatch", () => {
  for (const look of LOOKS) {
    const gate = validateThemePatch({ ...look.themePatch });
    assert.ok(gate.ok, `${look.id}: ${JSON.stringify("issues" in gate ? gate.issues : gate)}`);
  }
});

test("every Look exports to portable JSON and imports back clean", async () => {
  const { toPortableLook, parsePortableLook } = await import("./portable-look");
  for (const look of LOOKS) {
    const json = JSON.parse(JSON.stringify(toPortableLook(look)));
    const parsed = parsePortableLook(json);
    assert.ok(parsed.ok, `${look.id}: ${parsed.ok ? "" : parsed.reasons.join(" | ")}`);
    if (parsed.ok) {
      assert.equal(parsed.builtIn, true);
      assert.equal(parsed.look.id, look.id);
    }
  }
  const bad = parsePortableLook({ kind: "look", version: 1, id: "x", title: { es: "", en: "" }, axis: { es: "", en: "" }, themePatch: { "color.primary": "red" }, shell: { header: [], footer: [] }, pages: Object.fromEntries(SITE_PAGE_ROLES.map((r) => [r, []])), copy: {} });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.reasons.some((r) => r.startsWith("themePatch.color.primary")));
});
