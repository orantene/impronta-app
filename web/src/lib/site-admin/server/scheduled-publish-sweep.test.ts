/**
 * scheduled-publish-sweep.test.ts — the cron must publish EVERY due cms page,
 * through the publish path that page kind actually needs.
 *
 * BACKGROUND (the bug this locks down): `/api/cron/publish-scheduled` selected
 * due rows with `.eq("system_template_key", "homepage")` while the editor's
 * Publish caret offered "Schedule publish" on every surface. Scheduling an
 * inner page therefore did nothing, forever, with no error anywhere.
 *
 * Deleting the filter alone would NOT have been a fix: there are three publish
 * paths, and pushing a freeform page (tree in `cms_pages.blocks`) through the
 * homepage publisher (which reads `cms_page_sections`) would publish an empty
 * slot composition over a real page. So the routing itself is what these tests
 * pin.
 *
 * The NEGATIVE guard lives in `publish-scheduled-route.static.test.ts` — it
 * fails if the homepage filter is ever re-added to the route's query.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyScheduledPage,
  isRowDue,
  runScheduledPublishSweep,
  SCHEDULED_SWEEP_COLUMNS,
  type ScheduledPageRow,
  type ScheduledPublishHandlers,
} from "./scheduled-publish-sweep";

const NOW = "2026-08-15T12:00:00.000Z";
const PAST = "2026-08-15T11:59:00.000Z";
const FUTURE = "2026-08-15T13:00:00.000Z";

function row(over: Partial<ScheduledPageRow> = {}): ScheduledPageRow {
  return {
    id: "page-1",
    tenant_id: "tenant-1",
    locale: "en",
    version: 4,
    status: "draft",
    scheduled_publish_at: PAST,
    scheduled_by: "operator-1",
    is_system_owned: false,
    system_template_key: null,
    is_freeform: true,
    ...over,
  };
}

const HOMEPAGE_ROW = row({
  id: "home-en",
  is_system_owned: true,
  system_template_key: "homepage",
  is_freeform: false,
});
const FREEFORM_ROW = row({ id: "about-en", is_freeform: true });
const TEMPLATE_ROW = row({ id: "legacy-en", is_freeform: false });

/** Records which handler each row reached. */
function recordingHandlers(calls: string[]): ScheduledPublishHandlers {
  const make =
    (kind: string) =>
    async (r: ScheduledPageRow, locale: string) => {
      calls.push(`${kind}:${r.id}:${locale}`);
      return {
        ok: true as const,
        version: r.version + 1,
        publishedAt: NOW,
      };
    };
  return {
    homepage: make("homepage"),
    freeform: make("freeform"),
    template: make("template"),
  };
}

function alwaysLocale(): boolean {
  return true;
}

// ── classification ─────────────────────────────────────────────────────────

test("the homepage is classified by its system-template key, not its slug or freeform flag", () => {
  assert.equal(classifyScheduledPage(HOMEPAGE_ROW), "homepage");
  // A system homepage row that somehow carries is_freeform=true must STILL take
  // the homepage path — its content lives in cms_page_sections either way.
  assert.equal(
    classifyScheduledPage({
      is_system_owned: true,
      system_template_key: "homepage",
      is_freeform: true,
    }),
    "homepage",
  );
});

test("a freeform cms page routes to the freeform publisher", () => {
  assert.equal(classifyScheduledPage(FREEFORM_ROW), "freeform");
});

test("a non-freeform, non-homepage cms page routes to the template publisher", () => {
  assert.equal(classifyScheduledPage(TEMPLATE_ROW), "template");
  // Other system pages (site shell, directory) are not the homepage and are not
  // freeform, so they take the generic page publisher rather than silently
  // borrowing the homepage's.
  assert.equal(
    classifyScheduledPage({
      is_system_owned: true,
      system_template_key: "__site_shell__",
      is_freeform: false,
    }),
    "template",
  );
});

// ── due-ness ───────────────────────────────────────────────────────────────

test("a row whose fire time has not arrived is not due", () => {
  assert.equal(isRowDue(row({ scheduled_publish_at: FUTURE }), NOW), false);
});

test("a row with no schedule is not due", () => {
  assert.equal(isRowDue(row({ scheduled_publish_at: null }), NOW), false);
});

test("an archived page is never resurrected by a stale schedule", () => {
  assert.equal(isRowDue(row({ status: "archived" }), NOW), false);
});

test("a PUBLISHED page with a due schedule still fires", () => {
  // Publishing a freeform page never flips its status back to draft, so the old
  // `status='draft'` filter meant a page published once could never fire a
  // later schedule. The schedule column is the operator's intent.
  assert.equal(isRowDue(row({ status: "published" }), NOW), true);
});

test("a fire time exactly at now is due", () => {
  assert.equal(isRowDue(row({ scheduled_publish_at: NOW }), NOW), true);
});

// ── sweep dispatch ─────────────────────────────────────────────────────────

test("each due row reaches its own publish path", async () => {
  const calls: string[] = [];
  const cleared: string[] = [];
  const report = await runScheduledPublishSweep({
    nowIso: NOW,
    rows: [HOMEPAGE_ROW, FREEFORM_ROW, TEMPLATE_ROW],
    handlers: recordingHandlers(calls),
    isLocale: alwaysLocale,
    clearSchedule: async (r) => {
      cleared.push(r.id);
    },
  });

  assert.deepEqual(calls, [
    "homepage:home-en:en",
    "freeform:about-en:en",
    "template:legacy-en:en",
  ]);
  assert.equal(report.publishedCount, 3);
  assert.equal(report.failedCount, 0);
  assert.deepEqual(cleared, ["home-en", "about-en", "legacy-en"]);
  assert.deepEqual(
    report.published.map((p) => p.kind),
    ["homepage", "freeform", "template"],
  );
});

test("an inner page publishes even when no homepage row is in the batch", async () => {
  // The regression in one line: before the fix, this batch produced zero
  // publishes because the query filtered every non-homepage row away.
  const calls: string[] = [];
  const report = await runScheduledPublishSweep({
    nowIso: NOW,
    rows: [FREEFORM_ROW],
    handlers: recordingHandlers(calls),
    isLocale: alwaysLocale,
    clearSchedule: async () => {},
  });
  assert.equal(report.publishedCount, 1);
  assert.deepEqual(calls, ["freeform:about-en:en"]);
});

test("not-due rows are skipped: no publish, no schedule clear", async () => {
  const calls: string[] = [];
  const cleared: string[] = [];
  const report = await runScheduledPublishSweep({
    nowIso: NOW,
    rows: [
      row({ id: "future", scheduled_publish_at: FUTURE }),
      row({ id: "unscheduled", scheduled_publish_at: null }),
      row({ id: "archived", status: "archived" }),
    ],
    handlers: recordingHandlers(calls),
    isLocale: alwaysLocale,
    clearSchedule: async (r) => {
      cleared.push(r.id);
    },
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(cleared, []);
  assert.equal(report.dueCount, 0);
  assert.equal(report.skippedCount, 3);
  assert.equal(report.publishedCount, 0);
});

test("locale-keyed rows publish independently", async () => {
  // cms_pages is unique on (tenant_id, locale, slug) — each locale is its own
  // row with its own schedule. Scheduling "en" must not touch "es".
  const calls: string[] = [];
  await runScheduledPublishSweep({
    nowIso: NOW,
    rows: [
      row({ id: "about-en", locale: "en" }),
      row({ id: "about-es", locale: "es", scheduled_publish_at: FUTURE }),
    ],
    handlers: recordingHandlers(calls),
    isLocale: alwaysLocale,
    clearSchedule: async () => {},
  });
  assert.deepEqual(calls, ["freeform:about-en:en"]);
});

test("a failed publish is reported and its schedule is LEFT INTACT for the retry", async () => {
  const cleared: string[] = [];
  const handlers: ScheduledPublishHandlers = {
    homepage: async () => ({ ok: false, error: "VERSION_CONFLICT: stale" }),
    freeform: async () => ({ ok: false, error: "boom" }),
    template: async () => ({ ok: false, error: "boom" }),
  };
  const report = await runScheduledPublishSweep({
    nowIso: NOW,
    rows: [HOMEPAGE_ROW],
    handlers,
    isLocale: alwaysLocale,
    clearSchedule: async (r) => {
      cleared.push(r.id);
    },
  });
  assert.deepEqual(cleared, []);
  assert.equal(report.failedCount, 1);
  assert.equal(report.failed[0]?.kind, "homepage");
  assert.match(report.failed[0]?.error ?? "", /VERSION_CONFLICT/);
});

test("a throwing handler fails one row without aborting the sweep", async () => {
  const calls: string[] = [];
  const recording = recordingHandlers(calls);
  const handlers: ScheduledPublishHandlers = {
    ...recording,
    freeform: async () => {
      throw new Error("network down");
    },
  };
  const report = await runScheduledPublishSweep({
    nowIso: NOW,
    rows: [FREEFORM_ROW, HOMEPAGE_ROW],
    handlers,
    isLocale: alwaysLocale,
    clearSchedule: async () => {},
  });
  assert.equal(report.failedCount, 1);
  assert.equal(report.publishedCount, 1);
  assert.deepEqual(calls, ["homepage:home-en:en"]);
});

test("an unusable locale is reported, never published", async () => {
  const calls: string[] = [];
  const report = await runScheduledPublishSweep({
    nowIso: NOW,
    rows: [row({ locale: null }), row({ id: "bad", locale: "zz" })],
    handlers: recordingHandlers(calls),
    isLocale: (v) => v === "en" || v === "es",
    clearSchedule: async () => {},
  });
  assert.deepEqual(calls, []);
  assert.equal(report.failedCount, 2);
});

// ── column contract ────────────────────────────────────────────────────────

test("the sweep column list carries every field the routing depends on", () => {
  for (const col of [
    "is_system_owned",
    "system_template_key",
    "is_freeform",
    "status",
    "scheduled_publish_at",
    "scheduled_by",
    "version",
    "locale",
    "tenant_id",
  ]) {
    assert.ok(
      SCHEDULED_SWEEP_COLUMNS.includes(col),
      `SCHEDULED_SWEEP_COLUMNS dropped "${col}" — the sweep would mis-route or under-report rows`,
    );
  }
});
