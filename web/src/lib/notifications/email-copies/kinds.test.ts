import assert from "node:assert/strict";
import { test } from "node:test";

import { NOTIFICATION_CATALOG } from "../catalog";
import {
  COPY_KINDS,
  COPY_KIND_LABELS,
  catalogEntriesForKind,
  copyKindForEntry,
  filterActiveCopyRecipients,
  isPlausibleCopyEmail,
  normalizeCopyKinds,
  resolveInboundTargets,
} from "./kinds";

test("copyKindForEntry maps the agreed catalog entries", () => {
  assert.equal(copyKindForEntry("support.ticket.created.platform"), "support_new");
  assert.equal(copyKindForEntry("support.ticket.escalated.platform"), "support_urgent");
  assert.equal(copyKindForEntry("inquiry.submitted.coordinator"), "leads");
  for (const id of [
    "payment.failed.workspace",
    "refund.failed.workspace",
    "payment.needs_attention.workspace",
    "payment.dispute.opened.platform",
  ]) {
    assert.equal(copyKindForEntry(id), "payment_issues", id);
  }
  assert.equal(copyKindForEntry("offer.sent.client"), null);
  assert.equal(copyKindForEntry("toString"), null);
});

test("every mapped entry exists in the catalog and is renderable", () => {
  const byId = new Map(NOTIFICATION_CATALOG.map((e) => [e.id, e]));
  for (const kind of COPY_KINDS) {
    for (const id of catalogEntriesForKind(kind)) {
      const entry = byId.get(id);
      assert.ok(entry, `catalog entry ${id} missing`);
      assert.ok(entry?.email || entry?.in_app, `catalog entry ${id} has nothing to render`);
    }
  }
  assert.deepEqual(catalogEntriesForKind("support_inbound"), []);
});

test("every kind has a label", () => {
  for (const k of COPY_KINDS) assert.ok(COPY_KIND_LABELS[k]);
});

test("filterActiveCopyRecipients skips paused rows and other kinds", () => {
  const rows = [
    { email: "A@example.com", kinds: ["leads", "support_new"], paused: false },
    { email: "b@example.com", kinds: ["leads"], paused: true },
    { email: "c@example.com", kinds: ["payment_issues"], paused: false },
    { email: "a@example.com", kinds: ["leads"], paused: false },
    { email: "d@example.com", kinds: null, paused: null },
  ];
  assert.deepEqual(filterActiveCopyRecipients(rows, "leads"), ["a@example.com"]);
  assert.deepEqual(filterActiveCopyRecipients(rows, "payment_issues"), ["c@example.com"]);
  assert.deepEqual(filterActiveCopyRecipients(rows, "support_urgent"), []);
});

test("normalizeCopyKinds drops unknown values and dedupes", () => {
  assert.deepEqual(normalizeCopyKinds(["leads", "nope", "support_new", "leads", 3]), [
    "support_new",
    "leads",
  ]);
});

test("isPlausibleCopyEmail basic shape", () => {
  assert.equal(isPlausibleCopyEmail("ops@example.com"), true);
  for (const bad of ["", "nope", "a@b", "a b@example.com", "a@example.com, b@example.com"]) {
    assert.equal(isPlausibleCopyEmail(bad), false, bad);
  }
});

test("resolveInboundTargets: env fallback only when the list is empty", () => {
  assert.deepEqual(
    resolveInboundTargets({ listIsEmpty: true, listRecipients: [], envTarget: "env@example.com" }),
    { targets: ["env@example.com"], source: "env" },
  );
  assert.deepEqual(
    resolveInboundTargets({ listIsEmpty: true, listRecipients: [], envTarget: null }),
    { targets: [], source: "env" },
  );
  // List has rows but none active for inbound: env is NOT used.
  assert.deepEqual(
    resolveInboundTargets({ listIsEmpty: false, listRecipients: [], envTarget: "env@example.com" }),
    { targets: [], source: "list" },
  );
  assert.deepEqual(
    resolveInboundTargets({
      listIsEmpty: false,
      listRecipients: ["a@example.com", "b@example.com"],
      envTarget: "env@example.com",
    }),
    { targets: ["a@example.com", "b@example.com"], source: "list" },
  );
});
