/**
 * P0 2026-10-01 — Free talent (Valeria) clicked a block in the page builder's
 * Add gallery, got the "Web Office" refusal, and the talent area crashed with
 * `useAdminShell outside AdminShellProvider`.
 *
 * Root cause: the plan-lock stopgap soft-navigated from the bare builder route
 * to /talent/settings; the talent layout does not re-render on a client
 * navigation, so the shell-only route syncer mounted with no provider.
 *
 * Pins: (1) the syncer renders outside AdminShellProvider; (2) the gallery's
 * lock agrees card-for-card with the builder gate; (3) the stopgap navigates
 * hard; (4) the talent error boundary speaks Spanish.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { TalentPageRouteSyncer } from "@/app/(workspace)/[tenantSlug]/talent/_talent-page-route-syncer";
import { talentErrorCopy } from "@/app/(workspace)/talent/_talent-error-copy";
import { guardBuilderNodeMutation } from "./edit-context-internal";
import { codeGalleryItemsForPolicy } from "@/lib/site-admin/add-gallery/registry-db-merge";
import {
  galleryLockedHint,
  isGalleryItemStructurallyLocked,
} from "@/lib/site-admin/add-gallery/structural-lock";

const TALENT_PAGE_TABS = ["blocks", "designs", "data", "page_templates", "shell"] as const;

test("route syncer renders outside AdminShellProvider (the crash path)", () => {
  assert.doesNotThrow(() =>
    renderToString(createElement(TalentPageRouteSyncer, { page: "settings" })),
  );
});

function gateRefusesInsert(structuralEdits: boolean | undefined): boolean {
  return (
    guardBuilderNodeMutation({
      tree: [],
      operation: "insert",
      canEditSiteShell: false,
      advancedElementLibraryEnabled: true,
      structuralEdits,
      locale: "en",
    }) !== null
  );
}

test("gallery lock agrees with the builder gate for every insertable card", () => {
  const items = codeGalleryItemsForPolicy({
    allowedTabs: [...TALENT_PAGE_TABS],
    allowDbTemplates: true,
  } as Parameters<typeof codeGalleryItemsForPolicy>[0]);
  assert.ok(items.length > 0);
  for (const structuralEdits of [false, true, undefined]) {
    const refuses = gateRefusesInsert(structuralEdits);
    for (const item of items) {
      if (item.tab === "shell") {
        // Shell variants swap the landmark through their own action, not insert.
        assert.equal(isGalleryItemStructurallyLocked(item, structuralEdits), false);
        continue;
      }
      assert.equal(
        isGalleryItemStructurallyLocked(item, structuralEdits),
        refuses,
        `${item.id} with structuralEdits=${String(structuralEdits)}`,
      );
    }
  }
});

test("locked hint is bilingual", () => {
  assert.match(galleryLockedHint("en").title, /Web Office/);
  assert.match(galleryLockedHint("es").title, /Oficina Web/);
  assert.equal(galleryLockedHint("es").cta, "Ver planes");
  assert.notEqual(galleryLockedHint("es").cta, galleryLockedHint("en").cta);
});

test("lock stopgap navigates hard, never a soft router push", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/components/talent/site/TalentMaxBuilderMount.tsx"),
    "utf8",
  );
  assert.match(src, /window\.location\.assign\("\/talent\/settings"\)/);
  assert.doesNotMatch(src, /router\.push\("\/talent\/settings"\)/);
});

test("talent error boundary copy is Spanish for es", () => {
  assert.equal(talentErrorCopy("es").title, "Algo salió mal");
  assert.equal(talentErrorCopy("es-MX").retry, "Reintentar");
  assert.equal(talentErrorCopy("en").title, "Something went wrong");
  assert.equal(talentErrorCopy(null).title, "Something went wrong");
  for (const v of Object.values(talentErrorCopy("es"))) assert.doesNotMatch(v, /—/);
});
