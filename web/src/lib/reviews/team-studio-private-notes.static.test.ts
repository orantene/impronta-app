/**
 * TUL-1686: pins the held migration that routes team-studio client private notes
 * to the workspace, and the app wiring that uses it. Source-reading, no DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const sql = read("../supabase/migrations/_pending_pm/20261231422900_team_studio_review_private_notes_tul1686.sql");

function fnBody(name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} is defined`);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end);
}

test("header names the dependency and a rollback for every function", () => {
  assert.match(sql, /Depends on 20261231420200_agencies_work_model_tul1374\.sql/);
  assert.match(sql, /Rollback/);
  for (const sig of ["review_private_notes_for_talent(uuid, integer)", "review_private_notes_for_workspace(uuid, integer)", "review_note_goes_to_workspace(uuid)"]) {
    assert.ok(sql.includes(`--   DROP FUNCTION IF EXISTS public.${sig};`), `rollback drops ${sig}`);
  }
  assert.match(sql, /^BEGIN;$/m);
  assert.match(sql, /^COMMIT;$/m);
});

test("the rule reads agencies.work_model = 'team_studio', the same source as the collective split", () => {
  const rule = fnBody("review_note_goes_to_workspace");
  assert.match(rule, /FROM public\.agencies a/);
  assert.match(rule, /a\.work_model = 'team_studio'/);
  assert.match(rule, /p_tenant_id IS NOT NULL/);
});

test("talent reader: owner only, team-studio reviews excluded", () => {
  const fn = fnBody("review_private_notes_for_talent");
  assert.match(fn, /tp\.user_id = auth\.uid\(\)/);
  assert.match(fn, /AND NOT public\.review_note_goes_to_workspace\(r\.tenant_id\)/);
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = public/);
});

test("workspace reader: ACTIVE owner/admin of that tenant only (not is_staff_of_tenant), team studio only", () => {
  const fn = fnBody("review_private_notes_for_workspace");
  assert.match(fn, /r\.tenant_id = p_tenant_id/);
  assert.doesNotMatch(fn, /is_staff_of_tenant|is_platform_admin/, "staff helper admits viewer/editor/pending seats");
  assert.match(fn, /FROM public\.agency_memberships m/);
  assert.match(fn, /m\.tenant_id\s+= p_tenant_id/);
  assert.match(fn, /m\.profile_id = auth\.uid\(\)/);
  assert.match(fn, /m\.role IN \('owner', 'admin'\)/);
  assert.match(fn, /m\.status = 'active'/);
  assert.doesNotMatch(fn, /pending_acceptance|'viewer'|'editor'|'manager'/);
  assert.match(fn, /public\.review_note_goes_to_workspace\(p_tenant_id\)/);
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = public/);
});

test("column-safe: no row policy, column grant or column change; is_staff_of_tenant is never revoked", () => {
  assert.doesNotMatch(sql, /^\s*(CREATE|DROP|ALTER) POLICY/im);
  assert.doesNotMatch(sql, /^\s*ALTER TABLE/im);
  assert.doesNotMatch(sql, /^\s*GRANT SELECT/im);
  assert.doesNotMatch(sql, /REVOKE[^;]*is_staff_of_tenant/);
});

test("grants: PUBLIC and anon revoked by name, signed-in readers granted, and both asserted", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.review_private_notes_for_talent\(uuid, integer\) FROM PUBLIC, anon;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.review_private_notes_for_workspace\(uuid, integer\) FROM PUBLIC, anon;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.review_note_goes_to_workspace\(uuid\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.review_private_notes_for_talent\(uuid, integer\) TO authenticated, service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.review_private_notes_for_workspace\(uuid, integer\) TO authenticated, service_role;/);
  assert.match(sql, /has_column_privilege\('authenticated', 'public\.talent_reviews', 'private_note', 'SELECT'\)/);
  assert.match(sql, /has_column_privilege\('anon', 'public\.talent_reviews', 'private_note', 'SELECT'\)/);
  assert.match(sql, /has_function_privilege\('anon', 'public\.review_private_notes_for_talent\(uuid, integer\)', 'EXECUTE'\)/);
});

test("the talent Growth-notes loader goes through the routed reader, never a wide private_note select", () => {
  const src = read("src/lib/reviews/load-reviews.ts");
  const fn = src.slice(src.indexOf("export async function loadOwnerPrivateNoteThemes"));
  assert.match(fn, /return loadTalentPrivateNotes\(supabase, svc, talentProfileId, limit\);/);
  assert.doesNotMatch(src, /\.select\("id, private_note, created_at"\)/);
  // The ownership check stays in front of it.
  assert.ok(fn.indexOf("profileRow.user_id !== user.id") < fn.indexOf("loadTalentPrivateNotes("));
});

test("the workspace Reviews page shows team-studio notes behind the staff gate", () => {
  const loaders = read("src/lib/reviews/review-moderation-loaders.ts");
  const fn = loaders.slice(loaders.indexOf("export async function loadWorkspaceReviewPrivateNotes"));
  assert.ok(fn.indexOf("gateModeration(tenantId)") >= 0 && fn.indexOf("gateModeration(tenantId)") < fn.indexOf("loadWorkspacePrivateNotes("));
  assert.match(fn, /loadWorkspacePrivateNotes\(session, gate\.svc, gate\.tid, gate\.userId, limit\)/);
  const routing = read("src/lib/reviews/private-note-routing.ts");
  const ws = routing.slice(routing.indexOf("export async function loadWorkspacePrivateNotes"));
  assert.ok(ws.indexOf("isWorkspaceNoteReader(svc, tenantId, userId)") < ws.indexOf("session.rpc("), "role check runs before any read");
  assert.match(routing, /WORKSPACE_NOTE_READER_ROLES = \["owner", "admin"\] as const/);
  assert.match(routing, /row\.status === "active"/);
  assert.match(read("src/lib/reviews/review-moderation-queue-actions.ts"), /export async function loadWorkspaceReviewPrivateNotesAction/);
  assert.match(read("src/components/admin/shell/internal/page-modules/ReviewsPage.tsx"), /<WorkspacePrivateNotesCard tenantId=\{tenantId\} \/>/);
  const card = read("src/components/admin/shell/internal/page-modules/WorkspacePrivateNotesCard.tsx");
  assert.match(card, /if \(notes\.length === 0\) return null;/);
  for (const loc of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${loc}.json`)).dashboard.adminReviews;
    for (const k of ["privateNotesTitle", "privateNotesHint", "privateNotesWith"]) assert.ok(typeof m[k] === "string" && m[k].length > 0, `${loc}.${k}`);
    assert.ok(!/—/.test(m.privateNotesHint), "no em dash in copy");
  }
});
