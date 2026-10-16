import assert from "node:assert/strict";
import { test } from "node:test";

import { allowedStoragePhoto, colorsFromSiteTokens, loadShareTheme, type ShareThemeClient } from "./theme-defaults";

const STORAGE = "https://abc.supabase.co";

type Rows = { site: { design_tokens: unknown } | null; media: { storage_path: string; variant_kind: string; sort_order: number | null }[]; siteError?: boolean };

function fake(rows: Rows): ShareThemeClient {
  const chain = (result: () => unknown): unknown => {
    const c: Record<string, unknown> = {};
    for (const m of ["eq", "is", "in", "order"]) c[m] = () => c;
    c.limit = () => Promise.resolve(result());
    c.maybeSingle = () => Promise.resolve(result());
    return c;
  };
  return {
    from: ((table: string) => ({
      select: () =>
        table === "talent_sites"
          ? chain(() => (rows.siteError ? { data: null, error: { message: "boom" } } : { data: rows.site, error: null }))
          : chain(() => ({ data: rows.media, error: null })),
    })) as unknown as ShareThemeClient["from"],
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `${STORAGE}/storage/v1/object/public/media-public/${p}` } }) }) },
  };
}

test("theme found: site colours and a storage photo are used", async () => {
  const t = await loadShareTheme(
    fake({
      site: { design_tokens: { "color.background": "#112233", "color.ink": "#EEEEEE", "color.accent": "#ff0000" } },
      media: [{ storage_path: "a/g.jpg", variant_kind: "gallery", sort_order: 0 }, { storage_path: "a/c.jpg", variant_kind: "card", sort_order: 1 }],
    }),
    "p1", STORAGE,
  );
  assert.deepEqual(t.colors, { bg: "#112233", ink: "#eeeeee", accent: "#ff0000" });
  assert.ok(t.photoUrl?.endsWith("a/c.jpg"));
});

test("no published site or a read error: empty theme, defaults apply", async () => {
  const none = await loadShareTheme(fake({ site: null, media: [{ storage_path: "x.jpg", variant_kind: "card", sort_order: 0 }] }), "p1", STORAGE);
  assert.deepEqual(none, { colors: {}, photoUrl: null });
  const err = await loadShareTheme(fake({ site: null, media: [], siteError: true }), "p1", STORAGE);
  assert.deepEqual(err, { colors: {}, photoUrl: null });
});

test("non-hex tokens are dropped; primary backs up a missing accent", () => {
  assert.deepEqual(colorsFromSiteTokens({ "color.background": "var(--x)", "color.primary": "#abcdef", "color.ink": "red" }), { accent: "#abcdef" });
  assert.deepEqual(colorsFromSiteTokens(null), {});
});

test("photo from a non-storage host is rejected", async () => {
  assert.equal(allowedStoragePhoto("https://evil.example.com/a.jpg", STORAGE), null);
  assert.equal(allowedStoragePhoto("http://abc.supabase.co/a.jpg", STORAGE), null);
  assert.equal(allowedStoragePhoto("https://abc.supabase.co/a.jpg", STORAGE), "https://abc.supabase.co/a.jpg");
  const t = await loadShareTheme(
    fake({ site: { design_tokens: {} }, media: [{ storage_path: "a.jpg", variant_kind: "card", sort_order: 0 }] }),
    "p1", "https://other.supabase.co",
  );
  assert.equal(t.photoUrl, null);
});
