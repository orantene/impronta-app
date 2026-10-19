import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TRADE_PROFILES } from "@/lib/talent-agenda/trades";
import { servicePresentationResolverEnabled } from "./flag";
import { resolveServicePresentation } from "./resolve";
import {
  PRESENTATION_MODES,
  type PresentationEntitlements,
  type PresentationMode,
} from "./types";
import {
  DEFAULT_PRESENTATION_MODE,
  TRADE_PRESENTATION_DEFAULTS,
  presentationEntitlementsForPlan,
  tradeDefaultMode,
} from "./trade-defaults";

const ALL: PresentationEntitlements = { allowedModes: PRESENTATION_MODES };
const NO_PAGES: PresentationEntitlements = {
  allowedModes: ["quick_view", "expand", "book_direct"],
};
function pick<T extends object>(obj: T, shape: object): object {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(shape)) out[k] = (obj as Record<string, unknown>)[k];
  return out;
}
const ON = { enabled: true } as const;

describe("servicePresentationResolverEnabled", () => {
  it("is OFF by default and for junk values", () => {
    assert.equal(servicePresentationResolverEnabled({}), false);
    assert.equal(servicePresentationResolverEnabled({ SERVICE_PRESENTATION_RESOLVER_ENABLED: "" }), false);
    assert.equal(servicePresentationResolverEnabled({ SERVICE_PRESENTATION_RESOLVER_ENABLED: "no" }), false);
  });
  it("turns on for true/1 (case and space tolerant)", () => {
    for (const v of ["true", "TRUE", " 1 "]) {
      assert.equal(servicePresentationResolverEnabled({ SERVICE_PRESENTATION_RESOLVER_ENABLED: v }), true);
    }
  });
});

describe("flag off", () => {
  it("returns the legacy marker and book_direct, ignoring every other input", () => {
    for (const setting of [null, "own_page", "expand"] as const) {
      const r = resolveServicePresentation({
        enabled: false,
        setting,
        tradeSlug: "photographer",
        entitlements: ALL,
      });
      assert.deepEqual(r, { mode: "book_direct", source: "legacy", legacy: true, degradedFrom: null });
    }
  });
});

describe("per-service setting", () => {
  it("wins over the trade default when the plan allows it", () => {
    const r = resolveServicePresentation({ ...ON, setting: "expand", tradeSlug: "photographer", entitlements: ALL });
    assert.deepEqual(pick(r, { mode: "expand", source: "service", legacy: false, degradedFrom: null }), { mode: "expand", source: "service", legacy: false, degradedFrom: null });
  });
  it("is ignored when it is not a known mode", () => {
    const r = resolveServicePresentation({ ...ON, setting: "bogus" as never, tradeSlug: "barber", entitlements: ALL });
    assert.deepEqual(pick(r, { mode: "book_direct", source: "trade_default" }), { mode: "book_direct", source: "trade_default" });
  });
});

describe("trade default", () => {
  for (const [slug, mode] of [
    ["barber", "book_direct"],
    ["beauty", "book_direct"],
    ["photographer", "own_page"],
    ["dj", "own_page"],
    ["musician", "own_page"],
    ["restaurant", "expand"],
    ["workshop", "quick_view"],
    ["class", "quick_view"],
  ] as const) {
    it(`${slug} -> ${mode} when unset`, () => {
      const r = resolveServicePresentation({ ...ON, setting: null, tradeSlug: slug, entitlements: ALL });
      assert.equal(r.mode, mode);
      assert.equal(r.source, "trade_default");
    });
  }
  it("normalizes case and whitespace", () => {
    assert.equal(tradeDefaultMode("  Photographer "), "own_page");
  });
  it("unknown, empty and missing trades fall back to the sensible default", () => {
    for (const slug of ["zzz-unknown", "", null, undefined]) {
      const r = resolveServicePresentation({ ...ON, setting: undefined, tradeSlug: slug, entitlements: ALL });
      assert.deepEqual(pick(r, { mode: DEFAULT_PRESENTATION_MODE, source: "fallback_default" }), { mode: DEFAULT_PRESENTATION_MODE, source: "fallback_default" });
    }
    assert.equal(DEFAULT_PRESENTATION_MODE, "book_direct");
  });
  it("covers every trade profile key in the agenda trade table (drift guard)", () => {
    for (const key of Object.keys(TRADE_PROFILES)) {
      assert.notEqual(TRADE_PRESENTATION_DEFAULTS[key], undefined, key);
    }
  });
  it("covers every slug an agenda trade profile lists", () => {
    for (const p of Object.values(TRADE_PROFILES)) {
      for (const slug of p.talentTypeSlugs) {
        assert.notEqual(TRADE_PRESENTATION_DEFAULTS[slug], undefined, slug);
      }
    }
  });
});

describe("entitlement degradation", () => {
  it("own_page degrades to quick_view without pages (setting)", () => {
    const r = resolveServicePresentation({ ...ON, setting: "own_page", tradeSlug: "barber", entitlements: NO_PAGES });
    assert.deepEqual(pick(r, { mode: "quick_view", source: "service", degradedFrom: "own_page" }), { mode: "quick_view", source: "service", degradedFrom: "own_page" });
  });
  it("own_page degrades to quick_view without pages (trade default)", () => {
    const r = resolveServicePresentation({ ...ON, setting: null, tradeSlug: "dj", entitlements: NO_PAGES });
    assert.deepEqual(pick(r, { mode: "quick_view", source: "trade_default", degradedFrom: "own_page" }), { mode: "quick_view", source: "trade_default", degradedFrom: "own_page" });
  });
  it("walks own_page -> quick_view -> expand -> book_direct", () => {
    const only = (m: PresentationMode[]) =>
      resolveServicePresentation({
        ...ON,
        setting: "own_page",
        tradeSlug: "barber",
        entitlements: { allowedModes: m },
      }).mode;
    assert.equal(only(["expand", "book_direct"]), "expand");
    assert.equal(only(["book_direct"]), "book_direct");
  });
  it("book_direct is always reachable, even with an empty allow-list", () => {
    const r = resolveServicePresentation({
      ...ON,
      setting: "own_page",
      tradeSlug: "dj",
      entitlements: { allowedModes: [] },
    });
    assert.equal(r.mode, "book_direct");
    assert.equal(r.degradedFrom, "own_page");
  });
  it("a book_direct setting is never degraded", () => {
    const r = resolveServicePresentation({ ...ON, setting: "book_direct", tradeSlug: "dj", entitlements: { allowedModes: [] } });
    assert.deepEqual(pick(r, { mode: "book_direct", source: "service", degradedFrom: null }), { mode: "book_direct", source: "service", degradedFrom: null });
  });
});

describe("every requested mode x allowed set (table)", () => {
  const ORDER: PresentationMode[] = ["own_page", "quick_view", "expand", "book_direct"];
  const subsets: PresentationMode[][] = [];
  for (let mask = 0; mask < 16; mask++) subsets.push(ORDER.filter((_, i) => mask & (1 << i)));
  for (const requested of ORDER) {
    for (const allowed of subsets) {
      it(`${requested} with [${allowed.join(",")}]`, () => {
        const idx = ORDER.indexOf(requested);
        const expected = ORDER.slice(idx).find((m) => m === "book_direct" || allowed.includes(m))!;
        const r = resolveServicePresentation({
          ...ON,
          setting: requested,
          tradeSlug: null,
          entitlements: { allowedModes: allowed },
        });
        assert.equal(r.mode, expected);
        assert.equal(r.degradedFrom, expected === requested ? null : requested);
      });
    }
  }
});

describe("presentationEntitlementsForPlan", () => {
  it("free has no pages; paid plans do; unknown plan acts as free", () => {
    assert.ok(!(presentationEntitlementsForPlan("free").allowedModes).includes("own_page"));
    for (const plan of ["studio", "agency", "network"]) {
      assert.ok((presentationEntitlementsForPlan(plan).allowedModes).includes("own_page"));
    }
    assert.ok(!(presentationEntitlementsForPlan("weird").allowedModes).includes("own_page"));
    assert.ok((presentationEntitlementsForPlan(null).allowedModes).includes("book_direct"));
  });
});
