import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterAuditRows,
  isWithinDays,
  dayLimitFor,
  searchableText,
  isFailureAction,
  type AuditFilterRow,
  type AuditFilterState,
} from "./filter";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function row(over: Partial<AuditFilterRow> = {}): AuditFilterRow {
  return {
    actorLabel: "maria@agency.com",
    actorKind: "staff",
    action: "settings.branding.updated",
    category: "settings",
    targetLabel: "Impronta Models",
    targetId: "tenant-1",
    summary: "Updated branding: logo, accent color",
    ipAddress: "198.51.100.42",
    country: "MX",
    createdAtIso: hoursAgo(2),
    ...over,
  };
}

const ALL: AuditFilterState = {
  search: "",
  category: "all",
  actorKind: "all",
  dateRange: "all",
};

test("no filters returns every row", () => {
  const rows = [row(), row({ category: "media" }), row({ actorKind: "talent" })];
  assert.equal(filterAuditRows(rows, ALL, NOW).length, 3);
});

test("category filter keeps only the matching category", () => {
  const rows = [row({ category: "settings" }), row({ category: "media" }), row({ category: "billing" })];
  const out = filterAuditRows(rows, { ...ALL, category: "media" }, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].category, "media");
});

test("actor kind filter keeps only the matching actor kind", () => {
  const rows = [row({ actorKind: "staff" }), row({ actorKind: "talent" }), row({ actorKind: "system" })];
  const out = filterAuditRows(rows, { ...ALL, actorKind: "system" }, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].actorKind, "system");
});

test("search matches actor, summary, action, target, IP and country", () => {
  const r = row();
  for (const q of [
    "maria@agency.com",
    "accent color",
    "settings.branding",
    "Impronta Models",
    "tenant-1",
    "198.51.100",
    "mx",
  ]) {
    assert.equal(filterAuditRows([r], { ...ALL, search: q }, NOW).length, 1, `expected match for "${q}"`);
  }
});

test("search is case-insensitive and trims surrounding whitespace", () => {
  const r = row({ summary: "Deleted 3 media assets" });
  assert.equal(filterAuditRows([r], { ...ALL, search: "  DELETED 3 MEDIA  " }, NOW).length, 1);
});

test("search excludes non-matching rows", () => {
  const rows = [row({ summary: "Updated branding" }), row({ summary: "Deleted media" })];
  const out = filterAuditRows(rows, { ...ALL, search: "zzz-no-match" }, NOW);
  assert.equal(out.length, 0);
});

test("search tolerates null fields", () => {
  const r = row({ actorLabel: null, targetLabel: null, targetId: null, ipAddress: null, country: null, summary: null });
  assert.doesNotThrow(() => filterAuditRows([r], { ...ALL, search: "anything" }, NOW));
  assert.equal(filterAuditRows([r], { ...ALL, search: "settings.branding" }, NOW).length, 1);
  assert.equal(searchableText(r), "settings.branding.updated");
});

test("date windows bound the result set", () => {
  const rows = [
    row({ createdAtIso: hoursAgo(1) }),
    row({ createdAtIso: daysAgo(3) }),
    row({ createdAtIso: daysAgo(10) }),
    row({ createdAtIso: daysAgo(90) }),
  ];
  assert.equal(filterAuditRows(rows, { ...ALL, dateRange: "24h" }, NOW).length, 1);
  assert.equal(filterAuditRows(rows, { ...ALL, dateRange: "7d" }, NOW).length, 2);
  assert.equal(filterAuditRows(rows, { ...ALL, dateRange: "30d" }, NOW).length, 3);
  assert.equal(filterAuditRows(rows, { ...ALL, dateRange: "all" }, NOW).length, 4);
});

test("dayLimitFor maps ranges to day counts", () => {
  assert.equal(dayLimitFor("all"), null);
  assert.equal(dayLimitFor("24h"), 1);
  assert.equal(dayLimitFor("7d"), 7);
  assert.equal(dayLimitFor("30d"), 30);
});

test("isWithinDays rejects unparseable timestamps but allows them when unbounded", () => {
  assert.equal(isWithinDays("not-a-date", 7, NOW), false);
  assert.equal(isWithinDays("not-a-date", null, NOW), true);
});

test("filters combine as AND", () => {
  const rows = [
    row({ category: "media", actorKind: "staff", summary: "Deleted 3 media assets", createdAtIso: hoursAgo(1) }),
    row({ category: "media", actorKind: "talent", summary: "Deleted 3 media assets", createdAtIso: hoursAgo(1) }),
    row({ category: "media", actorKind: "staff", summary: "Uploaded a photo", createdAtIso: hoursAgo(1) }),
    row({ category: "media", actorKind: "staff", summary: "Deleted 3 media assets", createdAtIso: daysAgo(40) }),
  ];
  const out = filterAuditRows(
    rows,
    { search: "deleted", category: "media", actorKind: "staff", dateRange: "24h" },
    NOW,
  );
  assert.equal(out.length, 1);
});

test("isFailureAction flags refusals and failures, not successes", () => {
  for (const a of [
    "security.permission_denied",
    "media.upload.failed",
    "auth.sign_in_failed",
    "billing.payment.failed",
    "billing.payout.failed",
  ]) {
    assert.equal(isFailureAction(a), true, `expected ${a} to be a failure`);
  }
  for (const a of [
    "settings.branding.updated",
    "roster.talent.created",
    "media.uploaded",
    "auth.signed_in",
    // must not match on a substring in the middle of the action
    "media.failed_upload.retried",
  ]) {
    assert.equal(isFailureAction(a), false, `expected ${a} NOT to be a failure`);
  }
});

test("failures are findable by searching their reason", () => {
  const r = row({
    category: "security",
    action: "security.permission_denied",
    summary: "Attempted an action their role does not allow",
    targetId: "manage_billing",
  });
  assert.equal(filterAuditRows([r], { ...ALL, search: "manage_billing" }, NOW).length, 1);
});

test("security events are reachable by category filter", () => {
  const rows = [
    row({ category: "security", action: "auth.sign_in_failed", actorKind: "guest", actorLabel: "attacker@x.com" }),
    row({ category: "auth", action: "auth.signed_in" }),
  ];
  const out = filterAuditRows(rows, { ...ALL, category: "security" }, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].action, "auth.sign_in_failed");
});
