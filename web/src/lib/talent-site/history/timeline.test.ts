/**
 * Theme releases Phase 2: the timeline adapter (history rows → drawer rows),
 * the "Published only" filter, the unpublished-changes count and draft_rev
 * adoption.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTimelineResult,
  countUnpublishedChanges,
  filterPublishedOnly,
  historyPreviewUrl,
  mapHistoryRowsToRevisions,
} from "./timeline";
import {
  adoptDraftRev,
  isLegacyEpochVersion,
  resetDraftRevAdoptions,
  resolveExpectedDraftRev,
  versionAfterWrite,
} from "./draft-rev";
import { CONFLICT_COPY, pick, unpublishedChangesLabel } from "./copy";
import type { HistoryRow } from "./types";

function row(kind: HistoryRow["kind"], over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: `id-${kind}-${Math.random().toString(36).slice(2, 7)}`,
    site_id: "s",
    talent_profile_id: "p",
    at: "2026-09-30T10:00:00Z",
    last_at: "2026-09-30T10:01:00Z",
    actor: "talent",
    kind,
    summary_en: `EN ${kind}`,
    summary_es: `ES ${kind}`,
    report: null,
    undoable: false,
    draft_rev: 3,
    edit_count: 1,
    created_by: null,
    ...over,
  };
}

const target = { siteBasePath: "/t/site/valeria", pageSlug: null };

test("map: kinds become drawer badges (publish → published, restore → rollback, rest → draft)", () => {
  const rows = mapHistoryRowsToRevisions([row("publish"), row("restore"), row("edit"), row("theme_update")], target);
  assert.deepEqual(rows.map((r) => r.kind), ["published", "rollback", "draft", "draft"]);
  assert.deepEqual(rows.map((r) => r.history?.kind), ["publish", "restore", "edit", "theme_update"]);
});

test("map: carries EN + ES summaries, actor, edit count, last write time and rev", () => {
  const [r] = mapHistoryRowsToRevisions([row("edit", { edit_count: 4, actor: "tulala", draft_rev: 12 })], target);
  assert.equal(r!.history!.summaryEn, "EN edit");
  assert.equal(r!.history!.summaryEs, "ES edit");
  assert.equal(r!.history!.actor, "tulala");
  assert.equal(r!.history!.editCount, 4);
  assert.equal(r!.createdAt, "2026-09-30T10:01:00Z");
  assert.equal(r!.version, 12);
});

test("map: theme_update / auto_improve / design_apply can offer Undo when flagged", () => {
  const rows = mapHistoryRowsToRevisions(
    [
      row("theme_update", { undoable: true }),
      row("auto_improve", { undoable: true }),
      row("design_apply", { undoable: true }),
      row("edit", { undoable: true }),
      row("theme_update", { undoable: false }),
      row("design_apply", { undoable: false }),
    ],
    target,
  );
  assert.deepEqual(rows.map((r) => r.history!.undoable), [true, true, true, false, false, false]);
});

test("map: author names resolve from the profiles map", () => {
  const [r] = mapHistoryRowsToRevisions([row("edit", { created_by: "u1" })], target, new Map([["u1", "Valeria"]]));
  assert.deepEqual(r!.createdBy, { id: "u1", displayName: "Valeria" });
});

test("preview url: owner draft preview of the entry, on the edited page", () => {
  assert.equal(historyPreviewUrl("abc", target), "/t/site/valeria?preview=draft&history=abc");
  assert.equal(
    historyPreviewUrl("abc", { siteBasePath: "/t/site/valeria", pageSlug: "services" }),
    "/t/site/valeria/services?preview=draft&history=abc",
  );
  assert.equal(historyPreviewUrl("abc", { siteBasePath: null, pageSlug: null }), null);
});

test("published only: keeps publish entries", () => {
  const rows = mapHistoryRowsToRevisions([row("edit"), row("publish"), row("colors"), row("publish")], target);
  assert.equal(filterPublishedOnly(rows).length, 2);
  assert.ok(filterPublishedOnly(rows).every((r) => r.history!.kind === "publish"));
});

test("unpublished changes: entries newer than the latest publish", () => {
  assert.equal(countUnpublishedChanges([row("edit"), row("colors"), row("publish"), row("edit")]), 2);
  assert.equal(countUnpublishedChanges([row("publish"), row("edit")]), 0);
  assert.equal(countUnpublishedChanges([row("edit")]), 1);
});

test("timeline result: pageVersion is the site's draft_rev; publishedVersion the latest publish rev", () => {
  const res = buildTimelineResult([row("edit", { draft_rev: 9 }), row("publish", { draft_rev: 7 })], 9, target);
  assert.equal(res.pageVersion, 9);
  assert.equal(res.publishedVersion, 7);
  assert.equal(res.revisions.length, 2);
});

test("draft_rev: a same-tab colour save is adopted so the next page save is not a conflict", () => {
  resetDraftRevAdoptions();
  assert.equal(resolveExpectedDraftRev(5), 5);
  adoptDraftRev(5, 6);
  adoptDraftRev(6, 8);
  assert.equal(resolveExpectedDraftRev(5), 8);
  assert.equal(resolveExpectedDraftRev(7), 7);
  assert.equal(resolveExpectedDraftRev(null), null);
  adoptDraftRev(3, 3);
  assert.equal(resolveExpectedDraftRev(3), 3);
  resetDraftRevAdoptions();
  assert.equal(resolveExpectedDraftRev(5), 5);
});

test("draft_rev: version after a write prefers draft_rev, else the old epoch seconds", () => {
  assert.equal(versionAfterWrite({ draftRev: 4, updatedAt: "2026-01-01T00:00:00Z" }), 4);
  assert.equal(versionAfterWrite({ updatedAt: "2026-01-01T00:00:00Z" }), 1767225600);
  assert.equal(isLegacyEpochVersion(1767225600), true);
  assert.equal(isLegacyEpochVersion(42), false);
});

test("copy: conflict notice and draft chip in EN + ES, no em dashes", () => {
  assert.equal(pick(CONFLICT_COPY, "en"), "Updated in another tab · Reload");
  assert.equal(pick(CONFLICT_COPY, "es-MX"), "Actualizado en otra pestaña · Recargar");
  assert.equal(pick(unpublishedChangesLabel(1), "en"), "Draft · 1 unpublished change");
  assert.equal(pick(unpublishedChangesLabel(3), "es"), "Borrador · 3 sin publicar");
  assert.equal(/—/.test(JSON.stringify([CONFLICT_COPY, unpublishedChangesLabel(2)])), false);
});
