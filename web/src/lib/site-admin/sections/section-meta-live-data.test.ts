/**
 * section-meta-live-data.test.ts — Marathon W0-T5(d). THE W2-T2 correctness guard.
 *
 * W2-T2 adds `SectionMeta.hasLiveData` and skips the curated-edit
 * `queueRouterRefresh()` for sections tagged `false` (pure render — the client
 * canvas snapshot already reflects the prop change). The hazard: ONE data-bound
 * section mistagged `false` silently ships a STALE island after a prop edit.
 *
 * This test removes the "trust the hand-maintained 9-vs-37 list" risk by
 * DERIVING the data-bound set from the filesystem: a section's `Component.tsx`
 * is a server data-loader iff it is `async` (it awaits a Supabase / session /
 * headers fetch at render time). It then:
 *
 *   1. asserts the derived async-Component set equals the canonical expected set
 *      (so a NEW async section added later without updating the expectation
 *      fails loudly — exactly the mistag W2-T2 fears, in the other direction);
 *   2. once W2-T2 lands `hasLiveData`, asserts EVERY async-Component section is
 *      tagged `hasLiveData:true` and every sync section is falsy (the live gate).
 *      Until then, step 2 is inert (the field is absent) and step 1 carries the
 *      contract.
 *
 * ── Why this reads meta.ts directly (not the section registry) ──────────────
 * `section-meta-registry` imports the full `SECTION_REGISTRY`, which has a
 * module-init-order fragility under `tsx --test` (a circular get on
 * `SECTION_REGISTRY`). Each section's `meta.ts` imports only `type SectionMeta`
 * (zero runtime), so we dynamic-import the meta modules directly — fully
 * self-contained, immune to the registry-init issue, and a stricter source of
 * truth.
 *
 * Runner: node:test via `tsx --test` (filesystem scan + meta dynamic-import, no
 * DOM). Wired into CI via `test:builder-capabilities:a` (package.json, W0-T5).
 */
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const SECTION_DIR = new URL("./", import.meta.url);

/**
 * The canonical data-bound (server-data-loader) section keys. Verified against
 * the curated-section-embed-lag finding AND the async-Component scan below. Any
 * section here MUST get `hasLiveData:true` in W2-T2; everything else stays
 * pure-render and is refresh-skipped on a prop edit.
 *
 * NOTE: the plan prose says "9" in places; the authoritative async-Component
 * scan resolves to these EIGHT. The scan is ground truth — keep them in sync.
 */
const EXPECTED_DATA_BOUND_SECTIONS = [
  "directory",
  "featured_talent",
  "hero_search",
  "join_register",
  "location_discovery",
  "site_footer",
  "site_header",
  "talent_type_grid",
  // WS-A A5 — async header-widget embeds (read session / discovery counts).
  "header_account",
  "header_inquiry",
].sort();

/** A section's Component.tsx is a server data-loader iff it renders async. */
function componentIsAsync(sectionKey: string): boolean {
  const url = new URL(`${sectionKey}/Component.tsx`, SECTION_DIR);
  if (!existsSync(url)) return false;
  const src = readFileSync(url, "utf8");
  return (
    /export\s+default\s+async\s+function/.test(src) ||
    /export\s+async\s+function/.test(src) ||
    /^async\s+function/m.test(src) ||
    /async\s+function\s+\w*Component/.test(src) ||
    /=\s*async\s*\(/.test(src)
  );
}

/** All section keys that have BOTH a meta.ts and a Component.tsx on disk. */
function listSectionKeysOnDisk(): string[] {
  return readdirSync(SECTION_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => existsSync(new URL(`${name}/meta.ts`, SECTION_DIR)))
    .sort();
}

interface SectionMetaShape {
  key: string;
  hasLiveData?: boolean;
}

/** Dynamic-import a section's meta.ts and return its SectionMeta object. */
async function loadMeta(sectionKey: string): Promise<SectionMetaShape | null> {
  const mod = (await import(`./${sectionKey}/meta.ts`)) as Record<string, unknown>;
  const meta = Object.values(mod).find(
    (v): v is SectionMetaShape =>
      !!v && typeof v === "object" && "key" in (v as Record<string, unknown>),
  );
  return meta ?? null;
}

test("the async-Component (server data-loader) set EXACTLY matches the canonical data-bound list", () => {
  const derived = listSectionKeysOnDisk().filter(componentIsAsync).sort();
  assert.deepEqual(
    derived,
    EXPECTED_DATA_BOUND_SECTIONS,
    "a section's Component.tsx became (or stopped being) async without updating the data-bound expectation — " +
      "this is the W2-T2 mistag hazard. Reconcile EXPECTED_DATA_BOUND_SECTIONS + the hasLiveData tags.",
  );
});

test("every canonical data-bound section is a real section directory on disk", () => {
  const keys = new Set(listSectionKeysOnDisk());
  for (const key of EXPECTED_DATA_BOUND_SECTIONS) {
    assert.ok(keys.has(key), `data-bound section "${key}" is missing from the sections directory`);
  }
});

test("W2-T2: the section-live-data resolver's set EXACTLY matches the canonical data-bound list", async () => {
  // The runtime refresh-guard reads `sectionTypeHasLiveData` from
  // `section-live-data.ts` (a client-safe, Component-free meta aggregation).
  // Pin that its derived key set equals the async-Component-derived canonical
  // set — so a NEW data-bound section tagged in meta.ts but NOT added to the
  // resolver's import list (or vice-versa) fails loudly here.
  const { LIVE_DATA_SECTION_TYPE_KEYS } = await import("./section-live-data");
  assert.deepEqual(
    [...LIVE_DATA_SECTION_TYPE_KEYS].sort(),
    EXPECTED_DATA_BOUND_SECTIONS,
    "section-live-data.ts's hasLiveData set drifted from the canonical async-Component set — " +
      "reconcile its meta import list AND the meta.ts hasLiveData tags.",
  );
});

test("W2-T2 GATE: when hasLiveData is present, EVERY data-bound section is true and EVERY pure section is falsy", async () => {
  // Forward-looking. `hasLiveData` is added in W2-T2. Until then `meta` lacks
  // the field and this body asserts nothing about it (the contract is carried by
  // the async-scan test above). The instant W2-T2 tags sections, this becomes the
  // live correctness gate with zero edits here.
  const dataBound = new Set(EXPECTED_DATA_BOUND_SECTIONS);
  for (const key of listSectionKeysOnDisk()) {
    const meta = await loadMeta(key);
    if (!meta || !("hasLiveData" in meta)) continue; // field not landed yet → inert
    if (dataBound.has(key)) {
      assert.equal(
        meta.hasLiveData,
        true,
        `data-bound section "${key}" MUST be hasLiveData:true or its curated island ships stale after a prop edit`,
      );
    } else {
      assert.notEqual(
        meta.hasLiveData,
        true,
        `pure-render section "${key}" is tagged hasLiveData:true — it will pay an unnecessary full refresh on every prop edit`,
      );
    }
  }
});
