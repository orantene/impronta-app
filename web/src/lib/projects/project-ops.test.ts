import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  amendmentDiscard,
  attachDeliverableFile,
  projectArchive,
  projectReplaceTalent,
  setDeliverableAmount,
} from "./project-ops";

test("replace talent maps already_started and talent_unavailable", async () => {
  const started = await projectReplaceTalent(
    { rpc: async () => ({ data: { ok: false, reason: "already_started" }, error: null }) },
    { tenantId: "t1", bookingId: "b1", fromTalentId: "a", toTalentId: "b", operationKey: "replace-1" },
  );
  assert.equal(started.ok, false);
  if (!started.ok) assert.equal(started.reason, "already_started");

  const busy = await projectReplaceTalent(
    { rpc: async () => ({ data: { ok: false, reason: "talent_unavailable" }, error: null }) },
    { tenantId: "t1", bookingId: "b1", fromTalentId: "a", toTalentId: "b", operationKey: "replace-2" },
  );
  assert.equal(busy.ok, false);
  if (!busy.ok) assert.equal(busy.reason, "talent_unavailable");
});

test("discard refuses a sent offer", async () => {
  const result = await amendmentDiscard(
    { rpc: async () => ({ data: { ok: false, reason: "not_draft" }, error: null }) },
    { tenantId: "t1", offerId: "o1", expectedVersion: 1, inquiryExpectedVersion: 2 },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_draft");
});

test("archive is a status transition and a bad file path is invalid", async () => {
  const archived = await projectArchive(
    { rpc: async () => ({ data: { ok: true, booking_id: "b1" }, error: null }) },
    { tenantId: "t1", bookingId: "b1", reason: "done" },
  );
  assert.equal(archived.ok, true);

  const bad = await attachDeliverableFile(
    { from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) },
    { tenantId: "t1", deliverableId: "d1", filePath: "../etc/passwd" },
  );
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "invalid");

  const amount = await setDeliverableAmount(
    { from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) },
    { tenantId: "t1", deliverableId: "d1", amountCents: -1 },
  );
  assert.equal(amount.ok, false);
  if (!amount.ok) assert.equal(amount.reason, "invalid");
});

test("project ops SQL stamps amount_cents and file_path", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231219000_project_ops.sql"), "utf8");
  assert.match(sql, /project_replace_talent/);
  assert.match(sql, /amendment_discard/);
  assert.match(sql, /amount_cents/);
  assert.match(sql, /file_path/);
  assert.match(sql, /project_archive/);
});

test("replace talent SQL rewrites talent_name_snapshot from the incoming profile", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231234000_project_replace_talent_name_snapshot.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.project_replace_talent/);
  assert.match(sql, /talent_name_snapshot/);
  assert.match(sql, /display_name/);
  assert.match(sql, /SET talent_profile_id = p_to_talent,\s*talent_name_snapshot = COALESCE\(v_name/s);
});
