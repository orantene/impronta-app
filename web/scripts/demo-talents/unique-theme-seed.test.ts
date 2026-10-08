/**
 * TUL-38 unique-theme seed unit tests (pure lib + fake Io).
 *
 *   cd web && npx tsx --test scripts/demo-talents/unique-theme-seed.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_BATCH } from "../../src/lib/talent-site/theme-catalog/demo-account";
import {
  FORBIDDEN_CODES,
  SLICE1_CODES,
  UNIQUE_THEME_DEMOS,
  claimedThemes,
  demosForSlice,
} from "./unique-theme-map";
import {
  assertAllowedCode,
  assertDemoRow,
  assertUniqueThemes,
  buildPlan,
  formatPlan,
  parseCli,
  pickStock,
  planActions,
  run,
  type AuthMeta,
  type Io,
  type ProfileRow,
  type SiteRow,
  type StockPhoto,
} from "./unique-theme-seed-lib";

const quiet = () => {};

function stock(role: string, id: string): StockPhoto {
  return {
    id,
    assetId: `asset-${id}`,
    url: `https://example.test/${id}.jpg`,
    role,
    businessType: "nail-salon",
    family: "beauty",
    alt: { es: "foto", en: "photo" },
  };
}

function profile(code: string, over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: `id-${code}`,
    profile_code: code,
    is_demo: true,
    user_id: `user-${code}`,
    display_name: code,
    short_bio: "old",
    bio_i18n: { es: "old" },
    preferred_locale: "en",
    ...over,
  };
}

function site(code: string, over: Partial<SiteRow> = {}): SiteRow {
  const demo = UNIQUE_THEME_DEMOS.find((d) => d.profileCode === code)!;
  return {
    id: `site-${code}`,
    site_slug: demo.siteSlug,
    theme_design_slug: "other",
    status: "draft",
    ...over,
  };
}

function auth(code: string, over: Partial<AuthMeta> = {}): AuthMeta {
  const demo = UNIQUE_THEME_DEMOS.find((d) => d.profileCode === code)!;
  return {
    email: demo.email,
    demo_batch: DEMO_BATCH,
    demo: true,
    ...over,
  };
}

function fakeIo(opts: {
  profiles?: Record<string, ProfileRow | null>;
  sites?: Record<string, SiteRow | null>;
  auths?: Record<string, AuthMeta | null>;
  stock?: StockPhoto[];
  failWrite?: boolean;
}): { io: Io; writes: string[] } {
  const writes: string[] = [];
  const io: Io = {
    findProfile: async (code) => opts.profiles?.[code] ?? profile(code),
    findSite: async (id) => {
      const code = id.replace(/^id-/, "");
      return opts.sites?.[code] ?? site(code);
    },
    findAuth: async (userId) => {
      const code = userId.replace(/^user-/, "");
      return opts.auths?.[code] ?? auth(code);
    },
    listStock: async () =>
      opts.stock ?? [
        stock("hero", "h1"),
        stock("portrait", "p1"),
        stock("gallery", "g1"),
        stock("gallery", "g2"),
        stock("detail", "d1"),
        stock("wide", "w1"),
      ],
    writeProfile: async ({ id }) => {
      if (opts.failWrite) return { ok: false, error: "nope" };
      writes.push(`profile:${id}`);
      return { ok: true };
    },
    writeSiteTheme: async ({ siteId, theme }) => {
      writes.push(`theme:${siteId}:${theme}`);
      return { ok: true };
    },
    attachStock: async ({ talentProfileId, picks }) => {
      writes.push(`stock:${talentProfileId}:${picks.length}`);
      return { ok: true, attached: picks.length };
    },
  };
  return { io, writes };
}

test("curated map: unique themes and slice-1 size", () => {
  assertUniqueThemes();
  assert.equal(demosForSlice(1).length, 5);
  assert.deepEqual(
    demosForSlice(1).map((d) => d.profileCode),
    [...SLICE1_CODES],
  );
  assert.equal(new Set(claimedThemes()).size, claimedThemes().length);
  for (const d of demosForSlice(1)) {
    assert.equal(d.pack.defaultLocale, "es");
    assert.deepEqual(d.pack.supportedLocales, ["es", "en"]);
    assert.ok(d.pack.tagline.es.length > 0);
    assert.ok(d.pack.tagline.en.length > 0);
    assert.ok(d.pack.bio.es.length > 0);
    assert.ok(d.pack.bio.en.length > 0);
    assert.ok(!d.pack.bio.es.includes("—"));
    assert.ok(!d.pack.bio.en.includes("—"));
  }
});

test("parseCli defaults to dry-run slice 1", () => {
  const o = parseCli([]);
  assert.equal(o.apply, false);
  assert.deepEqual(o.only, [...SLICE1_CODES]);
  assert.equal(o.slice, 1);
});

test("parseCli --apply and --only", () => {
  const o = parseCli(["--apply", "--only", "TAL-93020,TAL-93011"]);
  assert.equal(o.apply, true);
  assert.deepEqual(o.only, ["TAL-93020", "TAL-93011"]);
});

test("parseCli refuses unknown flags and forbidden codes", () => {
  assert.throws(() => parseCli(["--yes"]), /unknown argument/);
  assert.throws(() => parseCli(["--only", "TAL-93938"]), /forbidden/);
  assert.throws(() => parseCli(["--only", "TAL-93900"]), /forbidden/);
  assert.throws(() => parseCli(["--only", "TAL-91001"]), /TAL-93/);
  assert.throws(() => parseCli(["--only", "TAL-93010"]), /slice 2/);
});

test("assertAllowedCode blocks real and QA talents", () => {
  for (const code of FORBIDDEN_CODES) {
    assert.throws(() => assertAllowedCode(code), /forbidden/);
  }
  assert.throws(() => assertAllowedCode("TAL-93199"), /not on the unique-theme/);
  assert.doesNotThrow(() => assertAllowedCode("TAL-93020"));
});

test("assertDemoRow refuses is_demo false and bad batch", () => {
  const expected = UNIQUE_THEME_DEMOS[0]!;
  assert.throws(
    () =>
      assertDemoRow({
        expected,
        profile: profile(expected.profileCode, { is_demo: false }),
        auth: auth(expected.profileCode),
      }),
    /is_demo/,
  );
  assert.throws(
    () =>
      assertDemoRow({
        expected,
        profile: profile(expected.profileCode),
        auth: auth(expected.profileCode, { demo_batch: "other" }),
      }),
    /demo_batch/,
  );
  assert.throws(
    () =>
      assertDemoRow({
        expected,
        profile: profile(expected.profileCode),
        auth: auth(expected.profileCode, { email: "real@example.com" }),
      }),
    /demo domain/,
  );
});

test("pickStock prefers unused photos per role", () => {
  const demo = UNIQUE_THEME_DEMOS[0]!;
  const picks = pickStock(demo, [stock("hero", "h1"), stock("portrait", "p1"), stock("gallery", "g1"), stock("gallery", "g2"), stock("detail", "d1")]);
  assert.equal(picks.find((p) => p.key === "hero")?.photo?.id, "h1");
  assert.equal(picks.find((p) => p.key === "gallery-0")?.photo?.id, "g1");
  assert.equal(picks.find((p) => p.key === "gallery-1")?.photo?.id, "g2");
  const gap = pickStock(demo, []);
  assert.ok(gap.some((p) => p.required && p.gap));
});

test("dry run writes nothing and prints the plan", async () => {
  const { io, writes } = fakeIo({});
  const lines: string[] = [];
  const r = await run([], io, (s) => lines.push(s));
  assert.equal(r.exitCode, 0);
  assert.deepEqual(writes, []);
  const out = lines.join("\n");
  assert.match(out, /DRY RUN/);
  assert.match(out, /TAL-93020/);
  assert.match(out, /maison-v2/);
  assert.match(out, /TAL-93009/);
  assert.match(out, /frame/);
});

test("apply writes profile, theme, and stock for slice 1", async () => {
  const { io, writes } = fakeIo({});
  const r = await run(["--apply", "--only", "TAL-93020"], io, quiet);
  assert.equal(r.exitCode, 0);
  assert.ok(writes.some((w) => w.startsWith("profile:")));
  assert.ok(writes.some((w) => w.includes("theme:") && w.includes("maison-v2")));
  assert.ok(writes.some((w) => w.startsWith("stock:")));
});

test("apply refuses when required stock is missing", async () => {
  const { io, writes } = fakeIo({ stock: [] });
  const r = await run(["--apply", "--only", "TAL-93020"], io, quiet);
  assert.equal(r.exitCode, 2);
  assert.deepEqual(writes, []);
});

test("is_demo false at plan time refuses without writing", async () => {
  const { io, writes } = fakeIo({
    profiles: { "TAL-93020": profile("TAL-93020", { is_demo: false }) },
  });
  const r = await run(["--apply", "--only", "TAL-93020"], io, quiet);
  assert.equal(r.exitCode, 2);
  assert.deepEqual(writes, []);
  assert.match(r.plans[0]!.refused ?? "", /is_demo/);
});

test("formatPlan marks gaps", async () => {
  const { io } = fakeIo({ stock: [stock("hero", "h1")] });
  const plans = await buildPlan(["TAL-93020"], io, 1);
  const text = formatPlan(plans, false);
  assert.match(text, /GAP/);
  assert.match(text, /TAL-93020/);
});

test("planActions lists bilingual + theme + stock work", () => {
  const demo = UNIQUE_THEME_DEMOS[0]!;
  const actions = planActions(
    demo,
    profile(demo.profileCode),
    site(demo.profileCode),
    pickStock(demo, [stock("hero", "h1"), stock("portrait", "p1"), stock("gallery", "g1"), stock("gallery", "g2"), stock("detail", "d1")]),
  );
  assert.ok(actions.some((a) => /bio_i18n/.test(a)));
  assert.ok(actions.some((a) => /preferred_locale/.test(a)));
  assert.ok(actions.some((a) => /theme_design_slug/.test(a)));
  assert.ok(actions.some((a) => /platform-stock/.test(a)));
});
