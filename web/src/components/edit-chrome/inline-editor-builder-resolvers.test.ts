import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { buildInlineImageReplacePatch } from "./inline-editor-builder-resolvers";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * D1 regression — "Replace image" pill silently doing nothing on the
 * published site.
 *
 * Root cause: the canvas replace flow (inline-editor.tsx's
 * `handleImagePicked`) patched `{ src: publicUrl }` only. The published
 * renderer resolves `mediaId` → `dataSources.mediaAssets` FIRST and only
 * falls back to `src` when unresolved, so a stale `mediaId` kept winning
 * over the freshly-patched `src` — the editor showed the new image, the
 * published page kept showing the old one.
 *
 * `buildInlineImageReplacePatch` is the exact helper inline-editor.tsx now
 * calls when a canvas "Replace image" pick lands — this test locks in that
 * it always moves `src` and `mediaId` together, then proves via the real
 * `renderBuilderNodes` path that patching WITHOUT `mediaId` reproduces the
 * original bug while patching WITH it (i.e. via this helper) fixes it.
 */

test("buildInlineImageReplacePatch pairs mediaId with the new src", () => {
  const patch = buildInlineImageReplacePatch({
    id: "22222222-2222-4222-8222-222222222222",
    publicUrl: "https://example.supabase.co/storage/v1/object/public/media-public/tenant/a/library/new-photo.webp",
  });
  assert.deepEqual(patch, {
    src: "https://example.supabase.co/storage/v1/object/public/media-public/tenant/a/library/new-photo.webp",
    mediaId: "22222222-2222-4222-8222-222222222222",
  });
});

function renderImage(node: BuilderNode): string {
  return renderToStaticMarkup(
    renderBuilderNodes([node], {
      mode: "freeform",
      dataSources: {
        mediaAssets: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            publicUrl: "https://example.supabase.co/.../old-photo.webp",
            alt: "Old asset",
            width: 800,
            height: 800,
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            publicUrl: "https://example.supabase.co/.../new-photo.webp",
            alt: "New asset",
            width: 800,
            height: 800,
          },
        ],
      },
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

test("D1: patching src alone (the old buggy behavior) leaves the published render on the OLD asset", () => {
  // Simulates the pre-fix bug: only `src` was patched, `mediaId` stayed stale.
  const node: BuilderNode = {
    id: "img1",
    kind: "image",
    props: {
      mediaId: "11111111-1111-4111-8111-111111111111", // stale — still points at OLD asset
      src: "https://example.supabase.co/.../new-photo.webp", // "fixed" by the buggy patch
      alt: "",
    },
  } as BuilderNode;

  const html = renderImage(node);
  assert.ok(html.includes("old-photo.webp"), "published render regresses to the OLD asset");
  assert.ok(!html.includes("new-photo.webp"), "new src is silently ignored");
});

test("D1 fix: patching via buildInlineImageReplacePatch makes the published render pick up the replacement", () => {
  const patch = buildInlineImageReplacePatch({
    id: "22222222-2222-4222-8222-222222222222",
    publicUrl: "https://example.supabase.co/.../new-photo.webp",
  });
  const node: BuilderNode = {
    id: "img1",
    kind: "image",
    // `patch` supplies the FINAL src/mediaId (both moved together, as the
    // fix guarantees) — no need to also state the pre-patch old values here.
    props: { alt: "", ...patch },
  } as BuilderNode;

  const html = renderImage(node);
  assert.ok(html.includes("new-photo.webp"), "published render now shows the replacement");
  assert.ok(!html.includes("old-photo.webp"), "old asset no longer wins");
  assert.ok(
    html.includes('data-builder-media-id="22222222-2222-4222-8222-222222222222"'),
    "mediaId marker updated too",
  );
});
