/**
 * builder-lab-audit.test.ts — unit tests for the Builder Lab audit log (G1)
 * pure shape helpers: insert-payload construction + row→entry mapping.
 *
 * Runner: node:test + node:assert/strict (tsx --test). The DB-backed server
 * actions (`appendBuilderLabAudit`/`listBuilderLabAudit`) are not exercised here;
 * we test the deterministic transforms they delegate to.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAuditInsertPayload,
  mapAuditRowToEntry,
  distinctActorIds,
  type BuilderLabAuditRow,
} from "./builder-lab-audit-shape";

describe("buildAuditInsertPayload", () => {
  it("maps a full overlay.set input to the DB column shape", () => {
    const payload = buildAuditInsertPayload({
      action: "overlay.set",
      itemRef: "el-button",
      actor: "actor-1",
      before: { talent_enabled: true },
      after: { talent_enabled: false },
    });
    assert.deepEqual(payload, {
      action: "overlay.set",
      item_ref: "el-button",
      template_id: null,
      actor: "actor-1",
      before: { talent_enabled: true },
      after: { talent_enabled: false },
    });
  });

  it("null-coalesces missing itemRef / templateId / before / after", () => {
    const payload = buildAuditInsertPayload({
      action: "template.publish",
      templateId: "tmpl-9",
      actor: "actor-2",
    });
    assert.equal(payload.item_ref, null);
    assert.equal(payload.template_id, "tmpl-9");
    assert.equal(payload.before, null);
    assert.equal(payload.after, null);
    assert.equal(payload.actor, "actor-2");
  });

  it("preserves an explicit null before (overlay.clear semantics)", () => {
    const payload = buildAuditInsertPayload({
      action: "overlay.clear",
      itemRef: "db-template:abc",
      actor: "actor-3",
      before: { label_override: "Hero" },
      after: null,
    });
    assert.deepEqual(payload.before, { label_override: "Hero" });
    assert.equal(payload.after, null);
  });
});

describe("mapAuditRowToEntry", () => {
  const row: BuilderLabAuditRow = {
    id: "row-1",
    action: "template.archive",
    item_ref: null,
    template_id: "tmpl-7",
    actor: "actor-1",
    before: { status: "published" },
    after: { status: "archived" },
    created_at: "2026-06-18T10:00:00.000Z",
  };

  it("resolves a known actor name", () => {
    const entry = mapAuditRowToEntry(row, new Map([["actor-1", "Oran T"]]));
    assert.equal(entry.id, "row-1");
    assert.equal(entry.action, "template.archive");
    assert.equal(entry.templateId, "tmpl-7");
    assert.equal(entry.itemRef, null);
    assert.equal(entry.actorId, "actor-1");
    assert.equal(entry.actorName, "Oran T");
    assert.deepEqual(entry.before, { status: "published" });
    assert.deepEqual(entry.after, { status: "archived" });
    assert.equal(entry.createdAt, "2026-06-18T10:00:00.000Z");
  });

  it("leaves actorName null when the id is not in the lookup", () => {
    const entry = mapAuditRowToEntry(row, new Map());
    assert.equal(entry.actorName, null);
    assert.equal(entry.actorId, "actor-1");
  });

  it("leaves actorName null when the row has no actor", () => {
    const entry = mapAuditRowToEntry({ ...row, actor: null }, new Map([["actor-1", "Oran T"]]));
    assert.equal(entry.actorId, null);
    assert.equal(entry.actorName, null);
  });
});

describe("distinctActorIds", () => {
  it("dedupes and drops nulls", () => {
    const rows: BuilderLabAuditRow[] = [
      { id: "a", action: "overlay.set", item_ref: "x", template_id: null, actor: "u1", before: null, after: null, created_at: "t" },
      { id: "b", action: "overlay.set", item_ref: "y", template_id: null, actor: "u1", before: null, after: null, created_at: "t" },
      { id: "c", action: "overlay.set", item_ref: "z", template_id: null, actor: null, before: null, after: null, created_at: "t" },
      { id: "d", action: "overlay.set", item_ref: "w", template_id: null, actor: "u2", before: null, after: null, created_at: "t" },
    ];
    const ids = distinctActorIds(rows);
    assert.deepEqual([...ids].sort(), ["u1", "u2"]);
  });

  it("returns [] for no actors", () => {
    assert.deepEqual(distinctActorIds([]), []);
  });
});
