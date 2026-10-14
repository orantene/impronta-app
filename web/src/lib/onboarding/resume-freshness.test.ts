import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isResumeFresh, RESUME_MAX_AGE_MS } from "./module-state";

// TUL-16 (e): /start must not restore a stale or finished draft.
const NOW = Date.parse("2026-10-14T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 60 * 60 * 1000;

test("guest: a recent draft resumes", () => {
  assert.equal(isResumeFresh({ step: "entry", choice: "myself", updatedAt: ago(H) }, { now: NOW, isAuthenticated: false }), true);
});

test("guest: older than 24h does not resume", () => {
  assert.equal(RESUME_MAX_AGE_MS, 24 * H);
  assert.equal(isResumeFresh({ step: "reading", updatedAt: ago(25 * H) }, { now: NOW, isAuthenticated: false }), false);
});

test("guest: no timestamp does not resume", () => {
  assert.equal(isResumeFresh({ step: "reading" }, { now: NOW, isAuthenticated: false }), false);
});

test("guest: a finished draft (building/arrival) does not resume", () => {
  for (const step of ["building", "arrival"] as const) {
    assert.equal(isResumeFresh({ step, updatedAt: ago(H) }, { now: NOW, isAuthenticated: false }), false);
  }
});

test("signed in: own draft resumes, but a finished one older than 24h does not", () => {
  assert.equal(isResumeFresh({ step: "essentials", updatedAt: ago(72 * H) }, { now: NOW, isAuthenticated: true }), true);
  assert.equal(isResumeFresh({ step: "arrival", updatedAt: ago(25 * H) }, { now: NOW, isAuthenticated: true }), false);
});

test("loadOnboardingResume gates on isResumeFresh and archives stale guest drafts", () => {
  const src = readFileSync(join(__dirname, "../server-actions/onboarding-module.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function loadOnboardingResume"), src.indexOf("export async function submitOnboardingInput"));
  assert.match(body, /isResumeFresh\(/);
  assert.match(body, /archiveBrief\(/);
});

test("signed in: an unfinished draft older than 14 days does not resume (TUL-750/16)", () => {
  assert.equal(isResumeFresh({ step: "essentials", updatedAt: ago(15 * 24 * H) }, { now: NOW, isAuthenticated: true }), false);
  assert.equal(isResumeFresh({ step: "essentials", updatedAt: ago(13 * 24 * H) }, { now: NOW, isAuthenticated: true }), true);
});
