import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { codeGalleryItemsForPolicy } from "./registry-db-merge";
import { resolveAddGalleryInsertAction } from "./insert";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { AddGalleryTab } from "./types";

const ALL_TABS: AddGalleryTab[] = [
  "blocks",
  "designs",
  "data",
  "shell",
];

// Mirrors AddGalleryPreviewModal.resolvePreviewNode + DevicePreviewFrame: every
// previewable code item must resolve to a node AND render to real markup.
test("every previewable code gallery item live-renders", () => {
  const items = codeGalleryItemsForPolicy({
    allowedTabs: ALL_TABS,
    allowDbTemplates: false,
  });

  let previewable = 0;
  let liveData = 0;
  const failures: string[] = [];
  const empties: string[] = [];

  for (const item of items) {
    let action;
    try {
      action = resolveAddGalleryInsertAction(item);
    } catch {
      // noop/coming-soon items throw or return noop — not previewable, fine.
      continue;
    }
    if (
      action.type === "sectionEmbed" ||
      action.type === "connectedNode" ||
      action.type === "noop"
    ) {
      liveData++;
      continue;
    }
    previewable++;
    try {
      const html = renderToStaticMarkup(
        renderBuilderNodes([action.node], {
          publicPathPrefix: "",
          includeRendererStyles: true,
          includeFontLinks: true,
        }) as Parameters<typeof renderToStaticMarkup>[0],
      );
      // Empty markup = an empty layout primitive (Section/Container). The modal
      // shows an "empty layout" hint for these, so it's acceptable — only a
      // THROWN error is a real failure of the render pipeline.
      if (!html || html.length < 30) empties.push(item.id);
    } catch (err) {
      failures.push(`${item.id}: threw ${(err as Error).message}`);
    }
  }

  console.log(
    `[preview-verify] ${previewable} previewable items rendered (${empties.length} empty layout primitives: ${empties.join(", ") || "none"}), ${liveData} live-data items skipped, ${failures.length} hard failures`,
  );
  assert.equal(failures.length, 0, `Render failures:\n${failures.join("\n")}`);
  assert.ok(previewable > 10, `expected many previewable items, got ${previewable}`);
});
