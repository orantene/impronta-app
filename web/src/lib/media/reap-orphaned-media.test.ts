import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_REAP_ALERT_THRESHOLD,
  classifyStorageObjects,
  collectStorageRefsFromJson,
  matchProtectedRule,
  reapAlertBody,
  reapAlertThreshold,
  shouldAlertOnReapReport,
  storagePathFromPublicUrl,
  type ClassifyInput,
  type MediaAssetRow,
  type StorageObject,
} from "./reap-orphaned-media";

// A fixed "now" keeps every age assertion deterministic.
const NOW = new Date("2026-08-15T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const TALENT = "b887957d-abfc-4366-ae43-9ca5762571d9";

function obj(
  name: string,
  over: Partial<StorageObject> = {},
): StorageObject {
  return {
    bucketId: "media-public",
    name,
    sizeBytes: 1000,
    createdAt: daysAgo(365),
    ...over,
  };
}

function asset(over: Partial<MediaAssetRow> & { id: string; storagePath: string }): MediaAssetRow {
  return {
    bucketId: "media-public",
    deletedAt: null,
    sourceMediaAssetId: null,
    variantKind: "gallery",
    ...over,
  };
}

function classify(over: Partial<ClassifyInput> = {}) {
  return classifyStorageObjects({
    objects: [],
    assets: [],
    externalReferences: [],
    now: NOW,
    ...over,
  });
}

const paths = (list: { storagePath: string }[]) => list.map((v) => v.storagePath);
const keepReasonFor = (plan: ReturnType<typeof classify>, path: string) =>
  plan.kept.find((k) => k.storagePath === path)?.keepReason;

// ---------------------------------------------------------------------------

describe("classifyStorageObjects — soft-delete grace period", () => {
  it("does NOT reap a soft-deleted asset inside the grace period", () => {
    const plan = classify({
      objects: [obj("t/inside.jpg")],
      assets: [asset({ id: "a1", storagePath: "t/inside.jpg", deletedAt: daysAgo(5) })],
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "t/inside.jpg"), "within_grace_period");
  });

  it("DOES reap a soft-deleted asset outside the grace period", () => {
    const plan = classify({
      objects: [obj("t/outside.jpg")],
      assets: [asset({ id: "a1", storagePath: "t/outside.jpg", deletedAt: daysAgo(90) })],
    });
    assert.deepEqual(paths(plan.deletable), ["t/outside.jpg"]);
    assert.equal(plan.deletableBytes, 1000);
  });

  it("boundary: exactly at the grace cutoff is still protected", () => {
    const plan = classify({
      objects: [obj("t/edge.jpg")],
      assets: [
        asset({ id: "a1", storagePath: "t/edge.jpg", deletedAt: daysAgo(DEFAULT_GRACE_DAYS) }),
      ],
    });
    assert.deepEqual(paths(plan.deletable), []);
  });

  it("never reaps a live asset row", () => {
    const plan = classify({
      objects: [obj("t/live.jpg")],
      assets: [asset({ id: "a1", storagePath: "t/live.jpg", deletedAt: null })],
    });
    assert.equal(keepReasonFor(plan, "t/live.jpg"), "live_asset_row");
  });

  it("a live row PINS a path even when a soft-deleted row shares it", () => {
    // Production has exactly one such pair — a naive reaper deletes live data.
    const plan = classify({
      objects: [obj("t/shared.jpg")],
      assets: [
        asset({ id: "dead", storagePath: "t/shared.jpg", deletedAt: daysAgo(200) }),
        asset({ id: "live", storagePath: "t/shared.jpg", deletedAt: null }),
      ],
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "t/shared.jpg"), "live_asset_row");
  });
});

describe("classifyStorageObjects — variants and derivatives", () => {
  it("does NOT reap a derivative's path while its parent asset lives", () => {
    const plan = classify({
      objects: [obj("t/thumb.jpg")],
      assets: [
        asset({ id: "parent", storagePath: "t/original.jpg", deletedAt: null }),
        asset({
          id: "child",
          storagePath: "t/thumb.jpg",
          variantKind: "card",
          sourceMediaAssetId: "parent",
          deletedAt: daysAgo(200),
        }),
      ],
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "t/thumb.jpg"), "live_parent_asset");
  });

  it("does NOT reap a parent's path while a derivative of it lives", () => {
    const plan = classify({
      objects: [obj("t/original.jpg")],
      assets: [
        asset({ id: "parent", storagePath: "t/original.jpg", deletedAt: daysAgo(200) }),
        asset({
          id: "child",
          storagePath: "t/thumb.jpg",
          variantKind: "card",
          sourceMediaAssetId: "parent",
          deletedAt: null,
        }),
      ],
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "t/original.jpg"), "live_derivative_asset");
  });

  it("a parent still inside its own grace period protects the derivative", () => {
    const plan = classify({
      objects: [obj("t/thumb.jpg")],
      assets: [
        asset({ id: "parent", storagePath: "t/original.jpg", deletedAt: daysAgo(3) }),
        asset({
          id: "child",
          storagePath: "t/thumb.jpg",
          sourceMediaAssetId: "parent",
          deletedAt: daysAgo(200),
        }),
      ],
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "t/thumb.jpg"), "live_parent_asset");
  });

  it("reaps a whole lineage once parent AND derivative are both expired", () => {
    const plan = classify({
      objects: [obj("t/original.jpg"), obj("t/thumb.jpg")],
      assets: [
        asset({ id: "parent", storagePath: "t/original.jpg", deletedAt: daysAgo(200) }),
        asset({
          id: "child",
          storagePath: "t/thumb.jpg",
          sourceMediaAssetId: "parent",
          deletedAt: daysAgo(200),
        }),
      ],
    });
    assert.deepEqual(paths(plan.deletable).sort(), ["t/original.jpg", "t/thumb.jpg"]);
  });
});

describe("classifyStorageObjects — sources OTHER than media_assets", () => {
  it("does NOT reap a talent-document path even though no media_assets row exists", () => {
    // The trap: documents are referenced from field-value JSON only. A
    // media_assets-only reaper would delete every talent document.
    const documentPath = `${TALENT}/documents/contract.pdf`;
    const plan = classify({
      objects: [obj(documentPath, { bucketId: "media-originals" })],
      assets: [],
      allowUnaccounted: true, // even under the opt-in it must survive
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, documentPath), "protected_prefix");
  });

  it("protects a talent document via its external field-value reference too", () => {
    const documentPath = `${TALENT}/documents/comp-card.pdf`;
    const rule = matchProtectedRule("media-originals", documentPath);
    assert.equal(rule?.id, "talent-documents");

    // And the JSON harvester finds the same path from the stored entry shape.
    const refs = collectStorageRefsFromJson(
      [{ id: "d1", storagePath: documentPath, bucketId: "media-originals" }],
      "talent_documents",
    );
    assert.deepEqual(refs, [
      { bucketId: "media-originals", storagePath: documentPath, source: "talent_documents" },
    ]);
  });

  it("does NOT reap an object claimed by an external reference", () => {
    const plan = classify({
      objects: [obj("some/branding.png")],
      assets: [],
      externalReferences: [
        { bucketId: "media-public", storagePath: "some/branding.png", source: "agency_branding" },
      ],
      allowUnaccounted: true,
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "some/branding.png"), "external_reference");
  });

  it("an external reference outranks an expired media_assets row on the same path", () => {
    const plan = classify({
      objects: [obj("t/still-used.jpg")],
      assets: [asset({ id: "a1", storagePath: "t/still-used.jpg", deletedAt: daysAgo(300) })],
      externalReferences: [
        { bucketId: "media-public", storagePath: "t/still-used.jpg", source: "agency_branding" },
      ],
    });
    assert.deepEqual(paths(plan.deletable), []);
  });

  it("protects the other non-media_assets prefixes found in production", () => {
    for (const p of [
      "agency-logos/00000000-0000-0000-0000-000000000001/logo.png",
      "review-media/tenant/photo.png",
      "tenant/abc/talent/def/x.png",
      "talent/portfolio-a/x.jpg",
      "00000000-0000-0000-0000-000000000001/staging/x.jpeg",
      "a0faa883-0a78-44d7-8f47-d0a69092301e/reel/x.webm",
      "avatars/aaaa-bbbb/avatar.webp",
      "talent-site-logos/abc/logo.svg",
      "builder-template-thumbnails/tpl-1/3.png",
    ]) {
      assert.ok(matchProtectedRule("media-public", p), `expected ${p} to be protected`);
    }
  });

  it("protects private originals, whose reference source could not be identified", () => {
    const p = `${TALENT}/originals/abc.jpg`;
    assert.equal(matchProtectedRule("media-originals", p)?.id, "private-originals");
    const plan = classify({
      objects: [obj(p, { bucketId: "media-originals" })],
      allowUnaccounted: true,
    });
    assert.deepEqual(paths(plan.deletable), []);
  });

  it("does NOT reap an image a live CMS page still binds by raw public URL", () => {
    // Builder image nodes store props.src as a URL, not an asset id. The row
    // can be soft-deleted in the media library while the page still renders it.
    const plan = classify({
      objects: [obj("tenant/t1/library/photo.webp")],
      assets: [
        asset({
          id: "a1",
          storagePath: "tenant/t1/library/photo.webp",
          deletedAt: daysAgo(200),
        }),
      ],
      externalReferences: [
        {
          bucketId: "media-public",
          storagePath: "tenant/t1/library/photo.webp",
          source: "cms_sections",
        },
      ],
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "tenant/t1/library/photo.webp"), "external_reference");
  });
});

describe("classifyStorageObjects — cross-bucket derived reference", () => {
  it("does NOT reap a media-originals object pinned by a media-public row", () => {
    // signOriginal() probes media-originals with the SAME key as the
    // media-public row, so the pinning row names a DIFFERENT bucket.
    const shared = "t/deriv/photo.jpg";
    const plan = classify({
      objects: [obj(shared, { bucketId: "media-originals" })],
      assets: [asset({ id: "a1", bucketId: "media-public", storagePath: shared, deletedAt: null })],
      allowUnaccounted: true,
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, shared), "live_asset_row");
  });

  it("still reaps when the cross-bucket row is itself expired", () => {
    const shared = "t/deriv/gone.jpg";
    const plan = classify({
      objects: [obj(shared, { bucketId: "media-originals" }), obj(shared)],
      assets: [
        asset({
          id: "a1",
          bucketId: "media-public",
          storagePath: shared,
          deletedAt: daysAgo(200),
        }),
      ],
      allowUnaccounted: true,
    });
    assert.equal(plan.deletable.length, 2);
  });
});

describe("classifyStorageObjects — objects with no media_assets row at all", () => {
  it("keeps a no-row object by default (not positively accounted for)", () => {
    const plan = classify({ objects: [obj("orphan/unknown.jpg")] });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "orphan/unknown.jpg"), "unaccounted_no_asset_row");
  });

  it("does NOT reap a brand-new no-row object even under the opt-in (upload in flight)", () => {
    // The object is written before its row is inserted; this race is real.
    const plan = classify({
      objects: [obj("orphan/just-uploaded.jpg", { createdAt: daysAgo(0) })],
      allowUnaccounted: true,
    });
    assert.deepEqual(paths(plan.deletable), []);
    assert.equal(keepReasonFor(plan, "orphan/just-uploaded.jpg"), "unaccounted_within_grace");
  });

  it("reaps an OLD no-row object only under the explicit opt-in", () => {
    const objects = [obj("orphan/ancient.jpg", { createdAt: daysAgo(400) })];
    assert.deepEqual(paths(classify({ objects }).deletable), []);
    assert.deepEqual(
      paths(classify({ objects, allowUnaccounted: true }).deletable),
      ["orphan/ancient.jpg"],
    );
  });

  it("treats an unparseable created_at as too new rather than reapable", () => {
    const plan = classify({
      objects: [obj("orphan/bad-date.jpg", { createdAt: "not-a-date" })],
      allowUnaccounted: true,
    });
    assert.deepEqual(paths(plan.deletable), []);
  });
});

describe("classifyStorageObjects — per-run deletion cap", () => {
  it("caps deletions and reports what it withheld", () => {
    const objects = Array.from({ length: 10 }, (_, i) => obj(`t/${i}.jpg`));
    const assets = objects.map((o, i) =>
      asset({ id: `a${i}`, storagePath: o.name, deletedAt: daysAgo(90) }),
    );
    const plan = classify({ objects, assets, maxDeletions: 3 });
    assert.equal(plan.deletable.length, 3);
    assert.equal(plan.eligibleCount, 10);
    assert.equal(plan.cappedByLimit, true);
    assert.equal(plan.keptByReason.over_deletion_cap, 7);
  });
});

// ---------------------------------------------------------------------------
// The abort contract. `classifyStorageObjects` is only ever reached with input
// that every source answered for; a failed lookup must abort upstream. This
// pins that contract with the same shape the scan layer returns.
// ---------------------------------------------------------------------------
describe("an errored reference lookup aborts rather than deletes", () => {
  type Gathered = { ok: true; refs: string[] } | { ok: false; stage: string; error: string };

  async function runWithSources(sources: Array<() => Promise<Gathered>>) {
    const refs: string[] = [];
    for (const source of sources) {
      const result = await source();
      // The whole point: the FIRST failure returns before classify() is called.
      if (!result.ok) return { deleted: [] as string[], aborted: result.stage };
      refs.push(...result.refs);
    }
    const plan = classify({
      objects: [obj("t/expired.jpg")],
      assets: [asset({ id: "a1", storagePath: "t/expired.jpg", deletedAt: daysAgo(90) })],
      externalReferences: refs.map((storagePath) => ({
        bucketId: "media-public",
        storagePath,
        source: "test",
      })),
    });
    return { deleted: paths(plan.deletable), aborted: null as string | null };
  }

  it("deletes nothing when a referencing source errors", async () => {
    const out = await runWithSources([
      async () => ({ ok: true, refs: [] }),
      async () => ({ ok: false, stage: "talent_documents", error: "connection reset" }),
      async () => ({ ok: true, refs: [] }),
    ]);
    assert.equal(out.aborted, "talent_documents");
    assert.deepEqual(out.deleted, []);
  });

  it("proceeds only when every source answered", async () => {
    const out = await runWithSources([
      async () => ({ ok: true, refs: [] }),
      async () => ({ ok: true, refs: [] }),
    ]);
    assert.equal(out.aborted, null);
    assert.deepEqual(out.deleted, ["t/expired.jpg"]);
  });
});

describe("storagePathFromPublicUrl", () => {
  it("parses a Supabase public object URL", () => {
    assert.deepEqual(
      storagePathFromPublicUrl(
        "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/agency-logos/x/logo.png",
      ),
      { bucketId: "media-public", storagePath: "agency-logos/x/logo.png" },
    );
  });

  it("drops the signed-URL query string", () => {
    assert.deepEqual(
      storagePathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/sign/media-originals/a/b.pdf?token=abc",
      ),
      { bucketId: "media-originals", storagePath: "a/b.pdf" },
    );
  });

  it("returns null for anything that is not a storage URL", () => {
    assert.equal(storagePathFromPublicUrl("https://example.com/logo.png"), null);
    assert.equal(storagePathFromPublicUrl(""), null);
  });

  it("harvests nested references out of a theme_json-shaped blob", () => {
    const refs = collectStorageRefsFromJson(
      {
        branding: {
          logo_url:
            "https://x.supabase.co/storage/v1/object/public/media-public/agency-logos/t/logo.png",
          favicon_url:
            "https://x.supabase.co/storage/v1/object/public/media-public/agency-logos/t/fav.png",
          primary_color: "#101010",
        },
      },
      "agency_branding",
    );
    assert.deepEqual(paths(refs).sort(), ["agency-logos/t/fav.png", "agency-logos/t/logo.png"]);
  });
});

// ─── Batch A / A10 — the report has to reach a human ────────────────────────
//
// The reaper's full report only ever existed in the HTTP response body, which
// Vercel discards for a cron invocation. These rules decide when a run pages
// the platform admins instead of vanishing.

describe("reaper alerting", () => {
  const report = (over: Partial<Parameters<typeof reapAlertBody>[0]> = {}) => ({
    dryRun: true,
    maxDeletions: 500,
    wouldDelete: { count: 0, bytes: 0 },
    cappedByLimit: false,
    deleted: null,
    ...over,
  });

  it("stays quiet below the threshold", () => {
    assert.equal(
      shouldAlertOnReapReport(report({ wouldDelete: { count: 9, bytes: 1 } }), 250),
      false,
    );
  });

  it("alerts at the threshold, not one past it", () => {
    assert.equal(
      shouldAlertOnReapReport(report({ wouldDelete: { count: 250, bytes: 1 } }), 250),
      true,
    );
  });

  it("alerts whenever the per-run cap bit, however small the count looks", () => {
    // cappedByLimit means there was MORE than the run was allowed to touch.
    // Judging on the capped number alone would hide exactly the big backlog
    // the alert exists for.
    assert.equal(
      shouldAlertOnReapReport(
        report({ wouldDelete: { count: 3, bytes: 1 }, cappedByLimit: true }),
        250,
      ),
      true,
    );
  });

  it("reads the threshold from env, falling back to the measured default", () => {
    assert.equal(reapAlertThreshold({} as NodeJS.ProcessEnv), DEFAULT_REAP_ALERT_THRESHOLD);
    assert.equal(
      reapAlertThreshold({ MEDIA_REAPER_ALERT_THRESHOLD: "10" } as NodeJS.ProcessEnv),
      10,
    );
    // Nonsense and non-positive values must not silently disable alerting.
    assert.equal(
      reapAlertThreshold({ MEDIA_REAPER_ALERT_THRESHOLD: "0" } as NodeJS.ProcessEnv),
      DEFAULT_REAP_ALERT_THRESHOLD,
    );
    assert.equal(
      reapAlertThreshold({ MEDIA_REAPER_ALERT_THRESHOLD: "lots" } as NodeJS.ProcessEnv),
      DEFAULT_REAP_ALERT_THRESHOLD,
    );
  });

  it("says whether anything was actually deleted", () => {
    const dry = reapAlertBody(report({ wouldDelete: { count: 381, bytes: 85 * 1024 * 1024 } }));
    assert.match(dry, /^Dry run: 381 storage objects \(85 MB\)/);
    assert.match(dry, /Nothing was deleted\./);

    const live = reapAlertBody(
      report({
        dryRun: false,
        wouldDelete: { count: 25, bytes: 1024 },
        deleted: { count: 25, bytes: 1024 },
      }),
    );
    assert.match(live, /^Live run/);
    assert.match(live, /25 were deleted\./);
  });

  it("names the cap when it bit, so the number is not read as the whole picture", () => {
    const body = reapAlertBody(
      report({ wouldDelete: { count: 25, bytes: 0 }, cappedByLimit: true, maxDeletions: 25 }),
    );
    assert.match(body, /per-run cap of 25 was reached/);
  });
});
