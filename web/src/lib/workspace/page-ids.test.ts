import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DESTINATIONS, DESTINATION_IDS, DESTINATION_LIST } from "./destinations";
import {
  WORKSPACE_PAGE_IDS,
  isWorkspacePage,
  liveWorkspacePage,
  navWorkspacePages,
  resolveWorkspacePageId,
} from "./page-ids";
import type { WorkspacePage } from "@/components/admin/shell/internal/state/types";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const TYPES = "src/components/admin/shell/internal/state/types.ts";

// ── The union and the runtime set are the same thing ─────────────────

test("WORKSPACE_PAGE_IDS is exactly the registry's ids plus its aliases", () => {
  const expected = new Set<string>([
    ...DESTINATION_IDS,
    ...DESTINATION_LIST.flatMap((d) => d.aliases),
  ]);
  assert.deepEqual(new Set(WORKSPACE_PAGE_IDS), expected);
  assert.equal(WORKSPACE_PAGE_IDS.length, expected.size, "the list has duplicates");
});

test("the WorkspacePage union covers the runtime set, member for member", () => {
  // `isWorkspacePage` is a type predicate: TypeScript takes its word for it.
  // This is the check that makes that word good. A destination or alias added
  // to the registry without a `LegacyWorkspacePage` entry fails here rather
  // than passing a string into a Record<WorkspacePage, …> at runtime.
  const src = read(TYPES);
  const legacyStart = src.indexOf("export type LegacyWorkspacePage");
  const legacyBlock = src.slice(legacyStart, src.indexOf(";", legacyStart));
  const legacy = [...legacyBlock.matchAll(/^\s*\|\s*"([a-z-]+)"/gm)].map((m) => m[1]);
  const union = new Set<string>([...DESTINATION_IDS, ...legacy]);
  assert.deepEqual(new Set(WORKSPACE_PAGE_IDS), union);
  for (const page of WORKSPACE_PAGE_IDS) assert.ok(isWorkspacePage(page), page);
  for (const alien of ["bookings", "account", "triage", "activity-log", "", "Overview"]) {
    assert.equal(isWorkspacePage(alien), false, alien);
  }
});

// ── Live route, not canonical segment ────────────────────────────────

test("a renamed-but-not-moved destination reports the page it renders as", () => {
  const cases: ReadonlyArray<readonly [string, WorkspacePage]> = [
    ["appts", "sessions"],
    ["catalog", "menu"],
    ["people", "roster"],
    ["spaces", "tables"],
    ["issues", "exceptions"],
    ["overview", "overview"],
    ["messages", "messages"],
  ];
  for (const [id, page] of cases) {
    const destination = DESTINATIONS[id as keyof typeof DESTINATIONS];
    assert.equal(liveWorkspacePage(destination), page, id);
  }
});

test("a destination with no route at all reports null, not a guess", () => {
  assert.equal(liveWorkspacePage(DESTINATIONS.mywork), null);
});

// ── Resolution ───────────────────────────────────────────────────────

test("every legacy URL opens the page it always opened", () => {
  const cases: ReadonlyArray<readonly [string, WorkspacePage]> = [
    ["inbox", "messages"],
    ["work", "messages"],
    ["talent", "roster"],
    ["site", "website"],
    ["billing", "settings"],
    ["workspace", "settings"],
    ["menu", "menu"],
    ["sessions", "sessions"],
    ["roster", "roster"],
    ["tables", "tables"],
    ["financials", "financials"],
    ["orders", "orders"],
    ["", "overview"],
  ];
  for (const [raw, page] of cases) {
    assert.equal(resolveWorkspacePageId(raw), page, raw);
  }
});

test("payouts is the one legacy id that keeps its own body", () => {
  // The registry folds it into `payments` (live route: financials). The SPA
  // still has a `payouts` case and /admin/payouts has no canonical matcher, so
  // folding it would render nothing at all.
  assert.equal(resolveWorkspacePageId("payouts"), "payouts");
  assert.equal(resolveWorkspacePageId("payments"), "financials");
});

test("anything the registry does not describe lands on overview", () => {
  for (const raw of ["bookings", "account", "triage", "activity-log", "nonsense"]) {
    assert.equal(resolveWorkspacePageId(raw), "overview", raw);
  }
});

// ── The nav list ─────────────────────────────────────────────────────

test("navWorkspacePages is one entry per built destination, in registry order", () => {
  const pages = navWorkspacePages();
  assert.deepEqual(new Set(pages).size, pages.length, "duplicate nav pages");
  const built = DESTINATION_LIST.filter((d) => d.built);
  assert.equal(pages.length, built.length);
  assert.deepEqual(
    pages,
    built.map((d) => liveWorkspacePage(d)),
    "nav order must follow the registry, which is the rail order",
  );
  // Unbuilt destinations are absent: a rail row for Projects would be a second
  // door onto Messages, and one for Payments a second door onto Financials.
  for (const absent of ["projects", "payments", "mywork"] as WorkspacePage[]) {
    assert.ok(!pages.includes(absent), `${absent} is not built and must not be a nav page`);
  }
});
