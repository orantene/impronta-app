import assert from "node:assert/strict";
import test from "node:test";

import { decideRebuildAuth, parseRebuildBody, parseRestoreBody } from "./rebuild-entry";

const base = { secret: "s3cret", authorization: null, userId: null, isAdmin: false };

test("correct bearer passes with no actor", () => {
  const d = decideRebuildAuth({ ...base, authorization: "Bearer s3cret" });
  assert.deepEqual(d, { allow: true, via: "bearer", actorId: null });
});

test("wrong bearer is 401 even for a signed-in admin", () => {
  const d = decideRebuildAuth({ ...base, authorization: "Bearer nope", userId: "u", isAdmin: true });
  assert.equal(d.allow, false);
  assert.equal(!d.allow && d.status, 401);
});

test("bearer without configured secret is 503", () => {
  const d = decideRebuildAuth({ ...base, secret: undefined, authorization: "Bearer x" });
  assert.equal(!d.allow && d.status, 503);
});

test("session: admin passes, non-admin 403, anonymous 401", () => {
  assert.deepEqual(decideRebuildAuth({ ...base, userId: "u", isAdmin: true }), { allow: true, via: "admin", actorId: "u" });
  const non = decideRebuildAuth({ ...base, userId: "u" });
  assert.equal(!non.allow && non.status, 403);
  const anon = decideRebuildAuth(base);
  assert.equal(!anon.allow && anon.status, 401);
});

test("rebuild body validation", () => {
  assert.equal(parseRebuildBody({}).ok, true);
  assert.equal(parseRebuildBody(undefined).ok, true);
  assert.equal(parseRebuildBody({ design: "folio", only: ["TAL-93020"], dryRun: false }).ok, true);
  assert.equal(parseRebuildBody({ design: "x" }).ok, false);
  assert.equal(parseRebuildBody({ only: ["bad"] }).ok, false);
  assert.equal(parseRebuildBody({ extra: 1 }).ok, false);
});

test("restore body validation", () => {
  assert.equal(parseRestoreBody({ runId: "0b8f6c1e-2d3a-4b5c-8d9e-1f2a3b4c5d6e" }).ok, true);
  assert.equal(parseRestoreBody({ runId: "nope" }).ok, false);
  assert.equal(parseRestoreBody(null).ok, false);
});
