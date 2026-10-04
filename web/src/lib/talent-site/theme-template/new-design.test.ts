import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";
import { loadMaisonCatalogRow } from "@/lib/talent-site/server/maison-catalog-row";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";

import { copyDesignPayload, deriveUniqueDesignSlug, galleryDesignFromAuthored, slugifyDesignName } from "./new-design.pure";
import { createDesignFromDraft } from "./new-design.server";

/** Minimal chainable fake of the Supabase client: records inserts/deletes per table. */
function fakeAdmin(opts: { existingSlugs?: string[]; failTable?: string; catalogRow?: Record<string, unknown> } = {}) {
  const inserted: Record<string, unknown[]> = {};
  const deleted: string[] = [];
  const admin = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = (): never => q as never;
      q.select = () => {
        q.mode = "select";
        return chain();
      };
      q.eq = () => chain();
      q.maybeSingle = async () => ({ data: opts.catalogRow ?? null, error: null });
      q.insert = async (row: unknown) => {
        if (opts.failTable === table) return { error: { message: "boom" } };
        (inserted[table] ??= []).push(row);
        return { error: null };
      };
      q.delete = () => {
        deleted.push(table);
        return chain();
      };
      q.then = (resolve: (v: unknown) => void) =>
        resolve({ data: table === "talent_theme_catalog" ? (opts.existingSlugs ?? []).map((slug) => ({ slug })) : [], error: null });
      return q;
    },
  };
  return { admin: admin as unknown as SupabaseClient, inserted, deleted };
}

const folio = COLLECTION_DESIGNS.find((d) => d.slug === "folio")!;

describe("slug derivation", () => {
  it("kebabs, folds accents and falls back", () => {
    assert.equal(slugifyDesignName("Élégance  Noire!"), "elegance-noire");
    assert.equal(slugifyDesignName("???"), "design");
  });
  it("is unique against taken slugs and code designs", () => {
    assert.equal(deriveUniqueDesignSlug("Aurora", []), "aurora");
    assert.equal(deriveUniqueDesignSlug("Aurora", ["aurora"]), "aurora-2");
    assert.equal(deriveUniqueDesignSlug("Aurora", ["aurora", "aurora-2", "AURORA-3"]), "aurora-4");
    assert.equal(deriveUniqueDesignSlug("Folio", []), "folio-2");
    assert.equal(deriveUniqueDesignSlug("Maison", []), "maison-2");
    assert.match(deriveUniqueDesignSlug("x".repeat(200), ["x".repeat(48)]), /^[a-z0-9][a-z0-9-]{0,63}$/);
  });
});

describe("payload copy", () => {
  it("is independent of the source and drops frozen design keys", () => {
    const src = {
      shellTree: [{ id: "a", kind: "x", props: { designKey: "folio:a", n: 1 }, children: [] }],
      homeTree: [],
    } as unknown as DesignPayload;
    const copy = copyDesignPayload(src);
    assert.notEqual(copy, src);
    assert.notEqual(copy.shellTree, src.shellTree);
    (copy.shellTree[0] as unknown as { props: { n: number } }).props.n = 99;
    assert.equal((src.shellTree[0] as unknown as { props: { n: number } }).props.n, 1);
    assert.equal("designKey" in (copy.shellTree[0] as unknown as { props: object }).props, false);
    assert.equal((src.shellTree[0] as unknown as { props: { designKey: string } }).props.designKey, "folio:a");
  });
});

describe("createDesignFromDraft", () => {
  const deps = (opened: string[]) => ({
    loadSource: async () => ({ payload: folio.buildPayload(), tier: "talent_pro" as const, paletteSource: "folio" }),
    openDraft: async (_a: SupabaseClient, design: string) => {
      opened.push(design);
      return { ok: true as const };
    },
  });

  it("writes a hidden authored draft row, snapshot v1 and opens the draft", async () => {
    const { admin, inserted } = fakeAdmin({ existingSlugs: ["aurora"] });
    const opened: string[] = [];
    const res = await createDesignFromDraft(admin, { sourceDesign: "folio", name: { en: "Aurora", es: "Aurora ES" }, actorId: "u1" }, deps(opened));
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.slug, "aurora-2");
    assert.match(res.href, /talent-designs\/aurora-2\/edit/);
    const row = inserted.talent_theme_catalog[0] as Record<string, unknown>;
    assert.equal(row.status, "draft");
    assert.equal(row.source, "authored");
    assert.equal(row.kind, "design");
    assert.equal(row.version, 1);
    assert.deepEqual((row.preview as { names: unknown }).names, { en: "Aurora", es: "Aurora ES" });
    assert.equal((row.preview as { paletteSource: string }).paletteSource, "folio");
    const ver = inserted.talent_theme_versions[0] as Record<string, unknown>;
    assert.equal(ver.version, 1);
    assert.equal(ver.source, "authored");
    assert.deepEqual(opened, ["aurora-2"]);
    assert.notEqual(row.payload, folio.buildPayload());
  });

  it("rolls back when the draft cannot be opened, and refuses empty names", async () => {
    const { admin, deleted } = fakeAdmin();
    const res = await createDesignFromDraft(
      admin,
      { sourceDesign: "folio", name: { en: "A", es: "B" }, actorId: null },
      { ...deps([]), openDraft: async () => ({ ok: false as const, error: "x" }) },
    );
    assert.equal(res.ok, false);
    assert.ok(deleted.includes("talent_theme_catalog") && deleted.includes("talent_theme_versions"));
    const bad = await createDesignFromDraft(admin, { sourceDesign: "folio", name: { en: " ", es: "B" }, actorId: null }, deps([]));
    assert.equal(bad.ok, false);
  });
});

describe("hidden status never reaches talents", () => {
  it("loadMaisonCatalogRow refuses a draft authored row", async () => {
    const { admin } = fakeAdmin({
      catalogRow: {
        id: "1", kind: "design", slug: "aurora", title: "Aurora", summary: "", category: null, tags: [],
        payload: folio.buildPayload(), preview: {}, required_talent_tier: "talent_pro",
        status: "draft", source: "authored", version: 1, schema_version: 1, sort_order: 1000,
      },
    });
    assert.equal(await loadMaisonCatalogRow(admin, "design", "aurora"), null);
  });
  it("the gallery listing query and the RLS policy only return published rows", () => {
    const listing = readFileSync(join(process.cwd(), "src/lib/talent-site/theme-catalog/load-catalog.server.ts"), "utf8");
    assert.match(listing, /\.eq\("status", "published"\)/);
    const sql = readFileSync(join(process.cwd(), "../supabase/migrations/20261231278000_talent_theme_catalog.sql"), "utf8");
    assert.match(sql, /using \(status = 'published'\)/);
  });
  it("authored gallery meta inherits palettes from the source design", () => {
    const meta = galleryDesignFromAuthored({ slug: "aurora", title: "Aurora", preview: { names: { en: "Aurora", es: "Aurora ES" } } }, getGalleryDesign("folio"));
    assert.equal(meta.name, "Aurora");
    assert.deepEqual(meta.palettes, getGalleryDesign("folio")!.palettes);
    assert.equal(meta.slug, "aurora");
  });
});
