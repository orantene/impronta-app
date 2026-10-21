import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canApproveJoinRequest, type JoinTermsLoadState } from "./join-terms";

const web = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

test("TUL-1690: Approve is blocked while the proposed terms are loading", () => {
  assert.equal(canApproveJoinRequest(true, "loading"), false);
});

test("TUL-1690: Approve works once the terms settle, including when no terms apply", () => {
  const settled: JoinTermsLoadState[] = ["ready", "owner_only", "off"];
  for (const s of settled) assert.equal(canApproveJoinRequest(true, s), true, s);
});

test("TUL-1690: a request whose terms step is not open yet cannot be approved (first click opens it)", () => {
  assert.equal(canApproveJoinRequest(false, "ready"), false);
});

test("TUL-1690: the list disables Approve until the terms load and guards a double click in decide()", () => {
  const src = read("src/components/admin/registration/JoinRequestsList.tsx");
  assert.match(src, /canApproveJoinRequest\(/);
  assert.match(src, /onLoadState=\{setTermsLoad\}/);
  // The click handler and the disabled flag both use the gate.
  assert.match(src, /disabled=\{rowBusy \|\| approveWaiting\}/);
  const decide = src.slice(src.indexOf("function decide("), src.indexOf("return (\n    <section"));
  assert.match(decide, /decision === "approve" && !canApproveJoinRequest\(/);
});

test("TUL-1690: the terms step reports its load state", () => {
  const src = read("src/components/admin/service-hub/JoinTermsStep.tsx");
  assert.match(src, /onLoadState\?: \(state: JoinTermsLoadState\) => void/);
  assert.match(src, /onLoadStateRef\.current\?\.\(load\.kind\)/);
});
