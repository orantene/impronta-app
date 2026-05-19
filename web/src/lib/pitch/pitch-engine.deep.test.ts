/**
 * DEEP CHARACTERIZATION TEST — pitch-engine.ts (DB-bound branches)
 *
 * Phase 0 safety-net, second pass (remediation-plan-2026-05-19 §3 + §5).
 *
 * Lane 2's first pass (`pitch-engine.test.ts`) characterizes ONLY the
 * pre-DB branches using a tripwire Proxy that throws on any Supabase
 * access. This file goes the rest of the way: it drives the engine
 * against an in-memory, stateful fake Supabase so the DB-bound state
 * machine itself is snapshotted —
 *
 *   - filterPublishableTalentIds : roster-membership + publishability
 *     intersection, order/duplicate semantics, the empty-set short-circuit
 *   - createPitchDraft / updatePitchDraft : insert + talent-row write,
 *     rollback-on-talent-error, dropped-count event payload, draft gate
 *   - sendPitch : re-validation, silent drop of newly-unpublishable
 *     talents, TTL derivation, status transition
 *   - cancelPitch : idempotency, already_converted, share_token_id rotation
 *   - loadPitchByToken : the full status/revocation/expiry decision tree
 *   - recordPitchView / removeTalentFromPitch / approve / decline :
 *     lifecycle transitions + idempotency + the loadPitchByToken gate
 *   - convertPitchToInquiry : idempotency short-circuit, talent resolution
 *     (client-removed exclusion), contact precedence, actor resolution,
 *     and the submitInquiry failure-surfacing contract
 *
 * NOTHING is fixed here. Quirks are pinned with explicit comments; genuine
 * untestable seams / suspected bugs are recorded as `it.skip` with a
 * refactor-owner note (mirrors the convention in pitch-engine.test.ts and
 * inquiry-engine-offers.test.ts).
 *
 * Run: npx tsx --test src/lib/pitch/pitch-engine.deep.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// signPitchToken/verifyPitchToken read PREVIEW_JWT_SECRET lazily; it must
// exist before the first sign. Mirrors pitch-share-token.test.ts.
if (!process.env.PREVIEW_JWT_SECRET) {
  process.env.PREVIEW_JWT_SECRET =
    "test-secret-test-secret-test-secret-test-secret-min-32-chars";
}

import {
  approvePitch,
  cancelPitch,
  convertPitchToInquiry,
  createPitchDraft,
  declinePitch,
  loadPitchByToken,
  recordPitchView,
  removeTalentFromPitch,
  sendPitch,
  updatePitchDraft,
} from "./pitch-engine";
import { signPitchToken } from "./pitch-share-token";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory, stateful fake Supabase.
//
// Generalises the repo's chainable-mock convention (see
// owning-party-resolver.test.ts) into a table/op-aware mini-store so
// state transitions are observable across an engine call: every
// .from(table).<op>().<filters>().<terminal> is recorded AND mutates /
// reads a real in-memory table.
//
// Filter semantics are JS-native: eq → ===, in → Array.includes,
// neq → !==, is(col,null) → null|undefined. NOTE: this diverges from
// Postgres three-valued logic for `.neq` on NULL columns — see the
// it.skip in the roster section. The engine delegates that semantic to
// Supabase, so the fake characterizes the *engine code path*, not PG.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Op = "select" | "insert" | "update" | "delete";
type Filter = ["eq" | "in" | "neq" | "is", string, unknown];

type RecordedCall = {
  table: string;
  op: Op;
  payload?: unknown;
  filters: Filter[];
  terminal: "then" | "maybeSingle" | "single";
};

type FakeOpts = {
  /** Force an error for a given `${table}:${op}` key. */
  errorOn?: Record<string, { message: string }>;
};

class FakeDb {
  readonly tables: Db;
  readonly calls: RecordedCall[] = [];
  private seq = 0;
  private opts: FakeOpts;

  constructor(seed: Db, opts: FakeOpts = {}) {
    // Deep-ish clone so a test's seed object isn't mutated by writes.
    this.tables = {};
    for (const [k, rows] of Object.entries(seed)) {
      this.tables[k] = rows.map((r) => ({ ...r }));
    }
    this.opts = opts;
  }

  client(): SupabaseClient {
    return { from: (table: string) => this.builder(table) } as unknown as SupabaseClient;
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? (this.tables[table] = []);
  }

  private match(table: string, filters: Filter[]): Row[] {
    return this.rows(table).filter((r) =>
      filters.every(([kind, col, val]) => {
        const cell = r[col];
        if (kind === "eq") return cell === val;
        if (kind === "neq") return cell !== val;
        if (kind === "in") return Array.isArray(val) && val.includes(cell);
        if (kind === "is") return cell === null || cell === undefined;
        return true;
      }),
    );
  }

  private builder(table: string) {
    let op: Op = "select";
    let payload: unknown;
    const filters: Filter[] = [];

    const resolve = (terminal: RecordedCall["terminal"]) => {
      this.calls.push({ table, op, payload, filters: [...filters], terminal });
      const forced = this.opts.errorOn?.[`${table}:${op}`];
      if (forced) {
        return { data: null, error: { message: forced.message } };
      }

      if (op === "select") {
        const matched = this.match(table, filters);
        if (terminal === "maybeSingle" || terminal === "single") {
          return { data: matched[0] ? { ...matched[0] } : null, error: null };
        }
        return { data: matched.map((r) => ({ ...r })), error: null };
      }

      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted = list.map((p) => {
          const row: Row = { ...(p as Row) };
          if (row.id === undefined) row.id = `${table}-${++this.seq}`;
          this.rows(table).push(row);
          return row;
        });
        return {
          data:
            terminal === "maybeSingle" || terminal === "single"
              ? { ...inserted[0] }
              : inserted.map((r) => ({ ...r })),
          error: null,
        };
      }

      if (op === "update") {
        const matched = this.match(table, filters);
        for (const r of matched) Object.assign(r, payload as Row);
        return {
          data:
            terminal === "maybeSingle" || terminal === "single"
              ? matched[0]
                ? { ...matched[0] }
                : null
              : matched.map((r) => ({ ...r })),
          error: null,
        };
      }

      // delete
      const keep = new Set(this.match(table, filters));
      this.tables[table] = this.rows(table).filter((r) => !keep.has(r));
      return { data: null, error: null };
    };

    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      insert(p: unknown) {
        op = "insert";
        payload = p;
        return chain;
      },
      update(p: unknown) {
        op = "update";
        payload = p;
        return chain;
      },
      delete() {
        op = "delete";
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push(["eq", col, val]);
        return chain;
      },
      in(col: string, val: unknown) {
        filters.push(["in", col, val]);
        return chain;
      },
      neq(col: string, val: unknown) {
        filters.push(["neq", col, val]);
        return chain;
      },
      is(col: string, val: unknown) {
        filters.push(["is", col, val]);
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(resolve("maybeSingle"));
      },
      single() {
        return Promise.resolve(resolve("single"));
      },
      then(
        onF: (v: unknown) => unknown,
        onR?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(resolve("then")).then(onF, onR);
      },
    };
    return chain;
  }
}

const TENANT = "11111111-1111-1111-1111-111111111111";
const ACTOR = "44444444-4444-4444-4444-444444444444";

function eventTypes(db: FakeDb): string[] {
  return db
    .rows("pitch_events")
    .map((r) => String((r as { event_type?: unknown }).event_type));
}

// ─────────────────────────────────────────────────────────────────────────────
// filterPublishableTalentIds — exercised via createPitchDraft (the talent
// list it inserts == the filter output) and the CREATED event payload
// (talentCount / droppedCount). This is the roster-membership +
// publishability security boundary.
// ─────────────────────────────────────────────────────────────────────────────

describe("filterPublishableTalentIds — roster + publishability intersection", () => {
  function seedFor(roster: Row[], profiles: Row[]): FakeDb {
    return new FakeDb({
      agency_talent_roster: roster,
      talent_profiles: profiles,
      pitches: [],
      pitch_talents: [],
      pitch_events: [],
    });
  }

  it("keeps only ids that are BOTH on-roster (status≠removed) AND approved+public+not-deleted", async () => {
    const db = seedFor(
      [
        { tenant_id: TENANT, talent_profile_id: "t-ok", status: "active" },
        { tenant_id: TENANT, talent_profile_id: "t-removed", status: "removed" },
        { tenant_id: TENANT, talent_profile_id: "t-notpublic", status: "active" },
        { tenant_id: TENANT, talent_profile_id: "t-deleted", status: "active" },
        // t-offroster intentionally absent from roster
      ],
      [
        { id: "t-ok", workflow_status: "approved", visibility: "public", deleted_at: null },
        { id: "t-removed", workflow_status: "approved", visibility: "public", deleted_at: null },
        { id: "t-notpublic", workflow_status: "approved", visibility: "unlisted", deleted_at: null },
        { id: "t-deleted", workflow_status: "approved", visibility: "public", deleted_at: "2026-01-01" },
        { id: "t-offroster", workflow_status: "approved", visibility: "public", deleted_at: null },
      ],
    );
    const res = await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["t-ok", "t-removed", "t-notpublic", "t-deleted", "t-offroster"],
    });
    assert.equal(res.ok, true);
    const inserted = db
      .rows("pitch_talents")
      .map((r) => (r as { talent_profile_id: string }).talent_profile_id);
    assert.deepEqual(inserted, ["t-ok"]);
    const created = db
      .rows("pitch_events")
      .find((e) => (e as { event_type?: string }).event_type === "created") as
      | { payload?: { talentCount?: number; droppedCount?: number } }
      | undefined;
    assert.equal(created?.payload?.talentCount, 1);
    assert.equal(created?.payload?.droppedCount, 4);
  });

  it("preserves INPUT order, not roster/profile order", async () => {
    const db = seedFor(
      [
        { tenant_id: TENANT, talent_profile_id: "a", status: "active" },
        { tenant_id: TENANT, talent_profile_id: "b", status: "active" },
        { tenant_id: TENANT, talent_profile_id: "c", status: "active" },
      ],
      [
        { id: "a", workflow_status: "approved", visibility: "public", deleted_at: null },
        { id: "b", workflow_status: "approved", visibility: "public", deleted_at: null },
        { id: "c", workflow_status: "approved", visibility: "public", deleted_at: null },
      ],
    );
    await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["c", "a", "b"],
    });
    const inserted = db
      .rows("pitch_talents")
      .sort(
        (x, y) =>
          (x as { position: number }).position - (y as { position: number }).position,
      )
      .map((r) => (r as { talent_profile_id: string }).talent_profile_id);
    assert.deepEqual(inserted, ["c", "a", "b"]);
  });

  it("QUIRK: duplicate input ids survive the filter (Array.filter keeps both) — they are inserted twice with distinct positions", async () => {
    const db = seedFor(
      [{ tenant_id: TENANT, talent_profile_id: "dup", status: "active" }],
      [{ id: "dup", workflow_status: "approved", visibility: "public", deleted_at: null }],
    );
    await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["dup", "dup"],
    });
    const inserted = db
      .rows("pitch_talents")
      .map((r) => (r as { talent_profile_id: string }).talent_profile_id);
    // Pinned as CURRENT behavior — no de-dupe anywhere in the pipeline.
    assert.deepEqual(inserted, ["dup", "dup"]);
  });

  it("empty roster intersection short-circuits BEFORE the talent_profiles query (no second read)", async () => {
    const db = seedFor(
      [{ tenant_id: TENANT, talent_profile_id: "x", status: "removed" }],
      [{ id: "x", workflow_status: "approved", visibility: "public", deleted_at: null }],
    );
    await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["x"],
    });
    const profileReads = db.calls.filter(
      (c) => c.table === "talent_profiles" && c.op === "select",
    );
    assert.equal(profileReads.length, 0, "talent_profiles must NOT be queried when roster set is empty");
  });

  it("cross-tenant id is dropped (roster is tenant-scoped) — defence-in-depth boundary", async () => {
    const db = seedFor(
      [{ tenant_id: "OTHER-TENANT", talent_profile_id: "leak", status: "active" }],
      [{ id: "leak", workflow_status: "approved", visibility: "public", deleted_at: null }],
    );
    const res = await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["leak"],
    });
    assert.equal(res.ok, true);
    assert.equal(db.rows("pitch_talents").length, 0);
  });

  it.skip("FLAG (untestable seam): roster `.neq('status','removed')` runs in Postgres, where `status IS NULL` rows are EXCLUDED (NULL ≠ 'removed' → unknown → filtered). The JS fake's `!==` INCLUDES null-status rows, so a null-status roster row would behave differently live vs here. Not a bug in pitch-engine (it delegates the predicate to Supabase); flagged so the gap is recorded. Refactor owner: cover via an integration test against a real PG, or normalise roster.status NOT NULL.", () => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// createPitchDraft — DB-bound branches past the two pre-DB guards.
// ─────────────────────────────────────────────────────────────────────────────

describe("createPitchDraft — insert, rollback, zero-talent draft", () => {
  function freshDb(extra: Partial<Db> = {}): FakeDb {
    return new FakeDb({
      agency_talent_roster: [
        { tenant_id: TENANT, talent_profile_id: "t1", status: "active" },
        { tenant_id: TENANT, talent_profile_id: "t2", status: "active" },
      ],
      talent_profiles: [
        { id: "t1", workflow_status: "approved", visibility: "public", deleted_at: null },
        { id: "t2", workflow_status: "approved", visibility: "public", deleted_at: null },
      ],
      pitches: [],
      pitch_talents: [],
      pitch_events: [],
      ...extra,
    });
  }

  it("a zero-eligible-talent draft STILL creates the pitch row (drafts may be composed iteratively) and emits created with talentCount:0", async () => {
    const db = freshDb({ agency_talent_roster: [], talent_profiles: [] });
    const res = await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["nope"],
    });
    assert.equal(res.ok, true);
    assert.equal(db.rows("pitches").length, 1);
    assert.equal(db.rows("pitch_talents").length, 0);
    const created = db.rows("pitch_events")[0] as {
      event_type: string;
      payload: { talentCount: number; droppedCount: number };
    };
    assert.equal(created.event_type, "created");
    assert.deepEqual(created.payload, { talentCount: 0, droppedCount: 1 });
  });

  it("inserts the pitch with status:'draft' and the documented defaults (recipient_contact:{}, brief:{}, nullable cols null)", async () => {
    const db = freshDb();
    await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["t1"],
    });
    const p = db.rows("pitches")[0] as Row;
    assert.equal(p.status, "draft");
    assert.deepEqual(p.recipient_contact, {});
    assert.deepEqual(p.brief, {});
    assert.equal(p.recipient_user_id, null);
    assert.equal(p.personal_note, null);
    assert.equal(p.expires_at, null);
    assert.equal(p.parent_pitch_id, null);
    assert.equal(p.created_by_user_id, ACTOR);
  });

  it("ROLLBACK: a pitch_talents insert error deletes the just-created pitch row (no orphan) and returns internal_error", async () => {
    const failing = new FakeDb(
      {
        agency_talent_roster: [
          { tenant_id: TENANT, talent_profile_id: "t1", status: "active" },
        ],
        talent_profiles: [
          { id: "t1", workflow_status: "approved", visibility: "public", deleted_at: null },
        ],
        pitches: [],
        pitch_talents: [],
        pitch_events: [],
      },
      { errorOn: { "pitch_talents:insert": { message: "talent insert boom" } } },
    );
    const res = await createPitchDraft(failing.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["t1"],
    });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "internal_error");
    assert.equal(res.ok === false && res.message, "talent insert boom");
    assert.equal(failing.rows("pitches").length, 0, "pitch row must be rolled back");
  });

  it("per-talent admin notes are written onto pitch_talents.admin_note keyed by talent id", async () => {
    const db = freshDb();
    await createPitchDraft(db.client(), {
      tenantId: TENANT,
      actorUserId: ACTOR,
      talentProfileIds: ["t1", "t2"],
      talentNotes: { t1: "lead choice" },
    });
    const byId = Object.fromEntries(
      db
        .rows("pitch_talents")
        .map((r) => [
          (r as { talent_profile_id: string }).talent_profile_id,
          (r as { admin_note: string | null }).admin_note,
        ]),
    );
    assert.equal(byId.t1, "lead choice");
    assert.equal(byId.t2, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updatePitchDraft — draft-only gate + the two talent-list code paths.
// ─────────────────────────────────────────────────────────────────────────────

describe("updatePitchDraft — draft gate, list-rewrite vs notes-only", () => {
  function dbWith(pitchStatus: string): FakeDb {
    return new FakeDb({
      pitches: [
        { id: "p1", tenant_id: TENANT, status: pitchStatus, share_token_id: "s1" },
      ],
      agency_talent_roster: [
        { tenant_id: TENANT, talent_profile_id: "t1", status: "active" },
        { tenant_id: TENANT, talent_profile_id: "t2", status: "active" },
      ],
      talent_profiles: [
        { id: "t1", workflow_status: "approved", visibility: "public", deleted_at: null },
        { id: "t2", workflow_status: "approved", visibility: "public", deleted_at: null },
      ],
      pitch_talents: [
        { id: "pt1", tenant_id: TENANT, pitch_id: "p1", talent_profile_id: "t1", position: 0, admin_note: null, removed_by_client_at: null },
      ],
      pitch_events: [],
    });
  }

  it("non-existent pitch → pitch_not_found", async () => {
    const db = new FakeDb({ pitches: [], pitch_events: [] });
    const res = await updatePitchDraft(db.client(), {
      tenantId: TENANT,
      pitchId: "missing",
      actorUserId: ACTOR,
    });
    assert.deepEqual(res, { ok: false, reason: "pitch_not_found" });
  });

  it("sent (non-draft) pitch → draft_required (no mutation, no event)", async () => {
    const db = dbWith("sent");
    const res = await updatePitchDraft(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
      personalNote: "should not apply",
    });
    assert.deepEqual(res, { ok: false, reason: "draft_required" });
    assert.equal((db.rows("pitches")[0] as Row).personal_note, undefined);
    assert.equal(eventTypes(db).length, 0);
  });

  it("talentProfileIds provided → full list rewrite (old rows deleted, eligible re-inserted) + updated event", async () => {
    const db = dbWith("draft");
    const res = await updatePitchDraft(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
      talentProfileIds: ["t2"],
    });
    assert.equal(res.ok, true);
    const ids = db
      .rows("pitch_talents")
      .map((r) => (r as { talent_profile_id: string }).talent_profile_id);
    assert.deepEqual(ids, ["t2"]);
    assert.ok(eventTypes(db).includes("updated"));
  });

  it("QUIRK: notes-only update (no talentProfileIds) patches admin_note IN PLACE without touching positions or deleting rows", async () => {
    const db = dbWith("draft");
    await updatePitchDraft(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
      talentNotes: { t1: "patched" },
    });
    const rows = db.rows("pitch_talents");
    assert.equal(rows.length, 1, "row not deleted/re-created on a notes-only update");
    assert.equal((rows[0] as { admin_note: string }).admin_note, "patched");
    assert.equal((rows[0] as { id: string }).id, "pt1", "same row id — in-place patch");
  });

  it("QUIRK: an empty updates object + no talent inputs still emits an 'updated' event (event is unconditional once the draft gate passes)", async () => {
    const db = dbWith("draft");
    await updatePitchDraft(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
    });
    assert.deepEqual(eventTypes(db), ["updated"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendPitch — re-validation at send time, silent drop of newly-unpublishable
// talents, status transition + share-link materialisation.
// ─────────────────────────────────────────────────────────────────────────────

const SEND_CLAIMS = {
  tenantId: TENANT,
  pitchId: "send-pitch-1",
  shareTokenId: "send-stid-1",
  issuerProfileId: ACTOR,
};

describe("sendPitch — validation gates", () => {
  it("non-existent pitch → pitch_not_found", async () => {
    const db = new FakeDb({ pitches: [], pitch_events: [] });
    const res = await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "missing",
      actorUserId: ACTOR,
      channel: "whatsapp",
    });
    assert.deepEqual(res, { ok: false, reason: "pitch_not_found" });
  });

  it("non-draft pitch → draft_required", async () => {
    const db = new FakeDb({
      pitches: [{ id: "p1", tenant_id: TENANT, status: "sent", share_token_id: "s1" }],
      pitch_events: [],
    });
    const res = await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
      channel: "email",
    });
    assert.deepEqual(res, { ok: false, reason: "draft_required" });
  });

  it("draft with NO talent rows → no_talents", async () => {
    const db = new FakeDb({
      pitches: [{ id: "p1", tenant_id: TENANT, status: "draft", share_token_id: "s1", expires_at: null }],
      pitch_talents: [],
      pitch_events: [],
    });
    const res = await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
      channel: "copy_link",
    });
    assert.deepEqual(res, { ok: false, reason: "no_talents" });
  });

  it("draft whose every talent fell out of publishability → no_talents (and the row stays draft)", async () => {
    const db = new FakeDb({
      pitches: [{ id: "p1", tenant_id: TENANT, status: "draft", share_token_id: "s1", expires_at: null }],
      pitch_talents: [
        { id: "pt1", tenant_id: TENANT, pitch_id: "p1", talent_profile_id: "gone" },
      ],
      agency_talent_roster: [
        { tenant_id: TENANT, talent_profile_id: "gone", status: "active" },
      ],
      talent_profiles: [
        // workflow_status flipped to draft after the pitch draft was composed
        { id: "gone", workflow_status: "draft", visibility: "public", deleted_at: null },
      ],
      pitch_events: [],
    });
    const res = await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
      channel: "whatsapp",
    });
    assert.deepEqual(res, { ok: false, reason: "no_talents" });
    assert.equal((db.rows("pitches")[0] as Row).status, "draft");
  });
});

describe("sendPitch — partial drop + success materialisation", () => {
  function sendableDb(): FakeDb {
    return new FakeDb({
      pitches: [
        {
          id: SEND_CLAIMS.pitchId,
          tenant_id: TENANT,
          status: "draft",
          share_token_id: SEND_CLAIMS.shareTokenId,
          expires_at: null,
          recipient_contact: { phone: "+39 333 1112222", email: "client@example.com" },
        },
      ],
      pitch_talents: [
        { id: "pt-keep", tenant_id: TENANT, pitch_id: SEND_CLAIMS.pitchId, talent_profile_id: "keep" },
        { id: "pt-drop", tenant_id: TENANT, pitch_id: SEND_CLAIMS.pitchId, talent_profile_id: "drop" },
      ],
      agency_talent_roster: [
        { tenant_id: TENANT, talent_profile_id: "keep", status: "active" },
        { tenant_id: TENANT, talent_profile_id: "drop", status: "active" },
      ],
      talent_profiles: [
        { id: "keep", workflow_status: "approved", visibility: "public", deleted_at: null },
        { id: "drop", workflow_status: "approved", visibility: "unlisted", deleted_at: null },
      ],
      agencies: [{ id: TENANT, display_name: "Atelier Roma" }],
      pitch_events: [],
    });
  }

  it("silently deletes the now-unpublishable talent, keeps the good one, transitions to sent, stamps channel + sent_at", async () => {
    const db = sendableDb();
    const res = await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: SEND_CLAIMS.pitchId,
      actorUserId: ACTOR,
      channel: "whatsapp",
    });
    assert.equal(res.ok, true);
    const remaining = db
      .rows("pitch_talents")
      .map((r) => (r as { talent_profile_id: string }).talent_profile_id);
    assert.deepEqual(remaining, ["keep"]);
    const p = db.rows("pitches")[0] as Row;
    assert.equal(p.status, "sent");
    assert.equal(p.share_channel, "whatsapp");
    assert.equal(typeof p.sent_at, "string");
  });

  it("returns share token + url + Date expiry + WhatsApp/email deep links built from recipient_contact + agency display_name", async () => {
    const db = sendableDb();
    const res = await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: SEND_CLAIMS.pitchId,
      actorUserId: ACTOR,
      channel: "whatsapp",
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.data.shareToken.split(".").length, 3);
    assert.match(res.data.shareUrl, /\/share\/pitch\//);
    assert.ok(res.data.expiresAt instanceof Date);
    assert.ok(res.data.expiresAt.getTime() > Date.now());
    assert.match(String(res.data.whatsappDeepLink), /^https:\/\/wa\.me\/393331112222\?text=/);
    assert.match(decodeURIComponent(String(res.data.whatsappDeepLink)), /Atelier Roma sent you a talent pitch/);
    assert.match(String(res.data.emailDeepLink), /^mailto:client%40example\.com\?subject=/);
  });

  it("SENT event payload carries channel + post-drop talentCount + ISO expiresAt", async () => {
    const db = sendableDb();
    await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: SEND_CLAIMS.pitchId,
      actorUserId: ACTOR,
      channel: "email",
    });
    const sent = db
      .rows("pitch_events")
      .find((e) => (e as { event_type?: string }).event_type === "sent") as
      | { payload?: { channel?: string; talentCount?: number; expiresAt?: string } }
      | undefined;
    assert.equal(sent?.payload?.channel, "email");
    assert.equal(sent?.payload?.talentCount, 1);
    assert.equal(typeof sent?.payload?.expiresAt, "string");
  });

  it("missing agencies row → WhatsApp copy falls back to 'your agency'", async () => {
    const db = sendableDb();
    db.tables.agencies = [];
    const res = await sendPitch(db.client(), {
      tenantId: TENANT,
      pitchId: SEND_CLAIMS.pitchId,
      actorUserId: ACTOR,
      channel: "whatsapp",
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.match(decodeURIComponent(String(res.data.whatsappDeepLink)), /your agency sent you a talent pitch/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancelPitch — idempotency, terminal guard, share_token_id rotation.
// ─────────────────────────────────────────────────────────────────────────────

describe("cancelPitch", () => {
  it("missing pitch → pitch_not_found", async () => {
    const db = new FakeDb({ pitches: [], pitch_events: [] });
    const res = await cancelPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "x",
      actorUserId: ACTOR,
    });
    assert.deepEqual(res, { ok: false, reason: "pitch_not_found" });
  });

  it("already cancelled → ok idempotent, NO second mutation, NO cancelled event", async () => {
    const db = new FakeDb({
      pitches: [{ id: "p1", tenant_id: TENANT, status: "cancelled", share_token_id: "s1" }],
      pitch_events: [],
    });
    const res = await cancelPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
    });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).share_token_id, "s1", "token NOT rotated on idempotent path");
    assert.equal(eventTypes(db).length, 0);
  });

  it("converted pitch → already_converted (cannot cancel a won pitch)", async () => {
    const db = new FakeDb({
      pitches: [{ id: "p1", tenant_id: TENANT, status: "converted", share_token_id: "s1" }],
      pitch_events: [],
    });
    const res = await cancelPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
    });
    assert.deepEqual(res, { ok: false, reason: "already_converted" });
  });

  it("success: status→cancelled, cancelled_at stamped, share_token_id ROTATED (revokes outstanding tokens), cancelled event emitted", async () => {
    const db = new FakeDb({
      pitches: [{ id: "p1", tenant_id: TENANT, status: "sent", share_token_id: "original-stid" }],
      pitch_events: [],
    });
    const res = await cancelPitch(db.client(), {
      tenantId: TENANT,
      pitchId: "p1",
      actorUserId: ACTOR,
    });
    assert.deepEqual(res, { ok: true, data: undefined });
    const p = db.rows("pitches")[0] as Row;
    assert.equal(p.status, "cancelled");
    assert.equal(typeof p.cancelled_at, "string");
    assert.notEqual(p.share_token_id, "original-stid", "share_token_id must rotate");
    assert.match(String(p.share_token_id), /^[0-9a-f-]{36}$/, "rotated to a uuid");
    assert.deepEqual(eventTypes(db), ["cancelled"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadPitchByToken — the full DB-bound status / revocation / expiry tree.
// (Lane 2's first pass covered only the pre-DB token-verify mapping.)
// ─────────────────────────────────────────────────────────────────────────────

describe("loadPitchByToken — status & revocation decision tree", () => {
  const CLAIMS = {
    tenantId: TENANT,
    pitchId: "load-p1",
    shareTokenId: "load-stid-1",
    issuerProfileId: ACTOR,
  };
  function token() {
    return signPitchToken(CLAIMS).token;
  }
  function dbWithPitch(over: Row): FakeDb {
    return new FakeDb({
      pitches: [
        {
          id: CLAIMS.pitchId,
          tenant_id: TENANT,
          share_token_id: CLAIMS.shareTokenId,
          status: "sent",
          expires_at: null,
          view_count: 0,
          first_viewed_at: null,
          ...over,
        },
      ],
      pitch_events: [],
    });
  }

  it("valid token, matching row, status sent → ok:true with the row", async () => {
    const db = dbWithPitch({ status: "sent" });
    const res = await loadPitchByToken(db.client(), token());
    assert.ok(res.ok);
    assert.equal(res.ok && (res.data as Row).id, CLAIMS.pitchId);
  });

  it("row absent for the token's pitchId/tenantId → pitch_not_found", async () => {
    const db = new FakeDb({ pitches: [], pitch_events: [] });
    const res = await loadPitchByToken(db.client(), token());
    assert.deepEqual(res, { ok: false, reason: "pitch_not_found" });
  });

  it("DB read error → internal_error (error.message forwarded)", async () => {
    const db = new FakeDb(
      { pitches: [], pitch_events: [] },
      { errorOn: { "pitches:select": { message: "pg down" } } },
    );
    const res = await loadPitchByToken(db.client(), token());
    assert.deepEqual(res, { ok: false, reason: "internal_error", message: "pg down" });
  });

  it("PRECEDENCE: a stale share_token_id (row rotated) → token_revoked, and this wins even when the pitch is also cancelled", async () => {
    const db = dbWithPitch({ status: "cancelled", share_token_id: "ROTATED-AWAY" });
    const res = await loadPitchByToken(db.client(), token());
    // token-revision check runs before the cancelled/draft/converted checks
    assert.deepEqual(res, { ok: false, reason: "token_revoked" });
  });

  it("status cancelled (token still valid) → cancelled", async () => {
    const db = dbWithPitch({ status: "cancelled" });
    const res = await loadPitchByToken(db.client(), token());
    assert.deepEqual(res, { ok: false, reason: "cancelled" });
  });

  it("status draft → pitch_not_found (drafts are NOT leaked via token)", async () => {
    const db = dbWithPitch({ status: "draft" });
    const res = await loadPitchByToken(db.client(), token());
    assert.deepEqual(res, { ok: false, reason: "pitch_not_found" });
  });

  it("status converted with a PAST expires_at → still ok:true (converted check precedes the expiry transition)", async () => {
    const db = dbWithPitch({
      status: "converted",
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const res = await loadPitchByToken(db.client(), token());
    assert.ok(res.ok);
    assert.equal((db.rows("pitches")[0] as Row).status, "converted", "no auto-expire on converted");
  });

  it("status declined → ok:true (declined is NOT special-cased — loadPitchByToken returns the row)", async () => {
    const db = dbWithPitch({ status: "declined" });
    const res = await loadPitchByToken(db.client(), token());
    assert.ok(res.ok);
    assert.equal(res.ok && (res.data as Row).status, "declined");
  });

  it("status sent + PAST expires_at → auto-transition to expired, emit 'expired', return reason:'expired'", async () => {
    const db = dbWithPitch({
      status: "sent",
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const res = await loadPitchByToken(db.client(), token());
    assert.deepEqual(res, { ok: false, reason: "expired" });
    assert.equal((db.rows("pitches")[0] as Row).status, "expired");
    assert.deepEqual(eventTypes(db), ["expired"]);
  });

  it("QUIRK: a row ALREADY status:'expired' with a past expires_at returns ok:true (the `status !== 'expired'` guard skips the transition AND the early returns don't catch 'expired' — it falls through to ok:true)", async () => {
    const db = dbWithPitch({
      status: "expired",
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const res = await loadPitchByToken(db.client(), token());
    assert.ok(res.ok, "expired-status row is returned as ok:true — pinned current behavior");
    assert.deepEqual(eventTypes(db), [], "no second 'expired' event");
  });

  it.skip("SUSPECTED BUG (consequence of the quirk above): because loadPitchByToken returns ok:true for a status:'expired' row, recordPitchView on an already-expired pitch still increments view_count and emits a 'viewed' event (expired is not in its converted|declined skip-set). Expected: an expired pitch should not accrue views. Pinned current behavior is in the recordPitchView section; this flags the intended fix. Refactor owner: add 'expired' to the loadPitchByToken early-return set OR to recordPitchView's terminal skip-set.", () => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// Token-gated lifecycle actions — DB-bound transitions, idempotency, and the
// loadPitchByToken gate they all delegate to.
// ─────────────────────────────────────────────────────────────────────────────

const LC = {
  tenantId: TENANT,
  pitchId: "lc-p1",
  shareTokenId: "lc-stid-1",
  issuerProfileId: ACTOR,
};
function lcToken() {
  return signPitchToken(LC).token;
}
function lcDb(pitchOver: Row, talents: Row[] = []): FakeDb {
  return new FakeDb({
    pitches: [
      {
        id: LC.pitchId,
        tenant_id: TENANT,
        share_token_id: LC.shareTokenId,
        status: "sent",
        expires_at: null,
        view_count: 0,
        first_viewed_at: null,
        recipient_user_id: null,
        created_by_user_id: ACTOR,
        recipient_contact: {},
        brief: {},
        personal_note: null,
        ...pitchOver,
      },
    ],
    pitch_talents: talents,
    pitch_events: [],
  });
}

describe("recordPitchView — first/subsequent view + terminal skip", () => {
  it("first view on a sent pitch: view_count→1, first_viewed_at set, status sent→viewed, 'viewed' event", async () => {
    const db = lcDb({ status: "sent" });
    const res = await recordPitchView(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: true, data: undefined });
    const p = db.rows("pitches")[0] as Row;
    assert.equal(p.view_count, 1);
    assert.equal(typeof p.first_viewed_at, "string");
    assert.equal(p.status, "viewed");
    const ev = db.rows("pitch_events")[0] as { event_type: string; payload: { viewCount: number } };
    assert.equal(ev.event_type, "viewed");
    assert.equal(ev.payload.viewCount, 1);
  });

  it("subsequent view: view_count increments, first_viewed_at NOT overwritten, status stays viewed", async () => {
    const db = lcDb({ status: "viewed", view_count: 3, first_viewed_at: "2026-01-01T00:00:00.000Z" });
    await recordPitchView(db.client(), { token: lcToken() });
    const p = db.rows("pitches")[0] as Row;
    assert.equal(p.view_count, 4);
    assert.equal(p.first_viewed_at, "2026-01-01T00:00:00.000Z");
    assert.equal(p.status, "viewed");
  });

  it("converted pitch → ok no-op (no increment, no event) — terminal skip", async () => {
    const db = lcDb({ status: "converted", view_count: 9 });
    const res = await recordPitchView(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).view_count, 9);
    assert.equal(eventTypes(db).length, 0);
  });

  it("QUIRK / current behavior (companion to the loadPitchByToken it.skip): an already-status:'expired' pitch STILL records a view + emits 'viewed' — expired is not in recordPitchView's converted|declined skip-set", async () => {
    const db = lcDb({ status: "expired", expires_at: new Date(Date.now() - 1000).toISOString(), view_count: 0 });
    const res = await recordPitchView(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).view_count, 1, "pinned: expired pitch accrued a view");
    assert.deepEqual(eventTypes(db), ["viewed"]);
  });
});

describe("removeTalentFromPitch — recipient pruning", () => {
  it("status sent: marks removed_by_client_at, transitions sent→edited, emits talent_removed", async () => {
    const db = lcDb({ status: "sent" }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: LC.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
      { id: "pt2", tenant_id: TENANT, pitch_id: LC.pitchId, talent_profile_id: "tB", removed_by_client_at: null },
    ]);
    const res = await removeTalentFromPitch(db.client(), { token: lcToken(), talentProfileId: "tA" });
    assert.deepEqual(res, { ok: true, data: undefined });
    const rowA = db.rows("pitch_talents").find((r) => (r as Row).talent_profile_id === "tA") as Row;
    assert.equal(typeof rowA.removed_by_client_at, "string");
    assert.equal((db.rows("pitches")[0] as Row).status, "edited");
    assert.deepEqual(eventTypes(db), ["talent_removed"]);
  });

  it("NOTABLE ASYMMETRY: status approved → invalid_status_transition (you can decline from approved but NOT prune a talent)", async () => {
    const db = lcDb({ status: "approved" }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: LC.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
    ]);
    const res = await removeTalentFromPitch(db.client(), { token: lcToken(), talentProfileId: "tA" });
    assert.deepEqual(res, { ok: false, reason: "invalid_status_transition" });
  });

  it("QUIRK: removing an already-removed talent → ok no-op (the `.is(removed_by_client_at,null)` filter matches nothing); status NOT flipped, NO event", async () => {
    const db = lcDb({ status: "viewed" }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: LC.pitchId, talent_profile_id: "tA", removed_by_client_at: "2026-01-01T00:00:00.000Z" },
    ]);
    const res = await removeTalentFromPitch(db.client(), { token: lcToken(), talentProfileId: "tA" });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).status, "viewed", "status unchanged on no-op");
    assert.equal(eventTypes(db).length, 0);
  });

  it("removing a talent that isn't on the pitch → ok no-op", async () => {
    const db = lcDb({ status: "sent" }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: LC.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
    ]);
    const res = await removeTalentFromPitch(db.client(), { token: lcToken(), talentProfileId: "not-on-pitch" });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal(eventTypes(db).length, 0);
  });

  it("status edited: removal recorded but status NOT re-written (stays edited), event still emitted", async () => {
    const db = lcDb({ status: "edited" }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: LC.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
    ]);
    const res = await removeTalentFromPitch(db.client(), { token: lcToken(), talentProfileId: "tA" });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).status, "edited");
    assert.deepEqual(eventTypes(db), ["talent_removed"]);
  });
});

describe("approvePitch / declinePitch — middle-step lifecycle (step-8)", () => {
  it("approve from sent → status approved, approved_at stamped, 'approved' event", async () => {
    const db = lcDb({ status: "sent" });
    const res = await approvePitch(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: true, data: undefined });
    const p = db.rows("pitches")[0] as Row;
    assert.equal(p.status, "approved");
    assert.equal(typeof p.approved_at, "string");
    assert.deepEqual(eventTypes(db), ["approved"]);
  });

  it("approve idempotent on already-approved → ok, NO event, NO re-stamp", async () => {
    const db = lcDb({ status: "approved", approved_at: "2026-01-01T00:00:00.000Z" });
    const res = await approvePitch(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).approved_at, "2026-01-01T00:00:00.000Z");
    assert.equal(eventTypes(db).length, 0);
  });

  it("approve on converted → ok success-already (no event, status unchanged)", async () => {
    const db = lcDb({ status: "converted" });
    const res = await approvePitch(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).status, "converted");
    assert.equal(eventTypes(db).length, 0);
  });

  it("approve on declined → invalid_status_transition", async () => {
    const db = lcDb({ status: "declined" });
    const res = await approvePitch(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: false, reason: "invalid_status_transition" });
  });

  it("decline from approved IS allowed (recipient may approve then change their mind) → status declined + 'declined' event with reason payload", async () => {
    const db = lcDb({ status: "approved" });
    const res = await declinePitch(db.client(), { token: lcToken(), reason: "budget cut" });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal((db.rows("pitches")[0] as Row).status, "declined");
    const ev = db.rows("pitch_events")[0] as { event_type: string; payload: { reason?: string } };
    assert.equal(ev.event_type, "declined");
    assert.equal(ev.payload.reason, "budget cut");
  });

  it("decline idempotent on already-declined → ok, NO new event", async () => {
    const db = lcDb({ status: "declined" });
    const res = await declinePitch(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: true, data: undefined });
    assert.equal(eventTypes(db).length, 0);
  });

  it("decline on converted → already_converted", async () => {
    const db = lcDb({ status: "converted" });
    const res = await declinePitch(db.client(), { token: lcToken() });
    assert.deepEqual(res, { ok: false, reason: "already_converted" });
  });

  it("decline with no reason → payload is {} (not {reason:null})", async () => {
    const db = lcDb({ status: "viewed" });
    await declinePitch(db.client(), { token: lcToken() });
    const ev = db.rows("pitch_events")[0] as { payload: Record<string, unknown> };
    assert.deepEqual(ev.payload, {});
  });
});

describe("CONTRACT PIN: all token-gated actions delegate status/revocation to loadPitchByToken", () => {
  for (const [name, run] of [
    ["recordPitchView", (s: SupabaseClient, t: string) => recordPitchView(s, { token: t })],
    ["removeTalentFromPitch", (s: SupabaseClient, t: string) => removeTalentFromPitch(s, { token: t, talentProfileId: "x" })],
    ["approvePitch", (s: SupabaseClient, t: string) => approvePitch(s, { token: t })],
    ["declinePitch", (s: SupabaseClient, t: string) => declinePitch(s, { token: t })],
    ["convertPitchToInquiry", (s: SupabaseClient, t: string) => convertPitchToInquiry(s, { token: t })],
  ] as const) {
    it(`${name}: cancelled pitch (valid token) → reason:'cancelled' (gate, not the action body)`, async () => {
      const db = lcDb({ status: "cancelled" });
      const res = await run(db.client(), lcToken());
      assert.equal(res.ok, false);
      assert.equal(res.ok === false && res.reason, "cancelled");
    });

    it(`${name}: rotated share_token_id → reason:'token_revoked'`, async () => {
      const db = lcDb({ status: "sent", share_token_id: "ROTATED" });
      const res = await run(db.client(), lcToken());
      assert.equal(res.ok, false);
      assert.equal(res.ok === false && res.reason, "token_revoked");
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// convertPitchToInquiry — the pitch→inquiry boundary. Everything UP TO the
// submitInquiry call is observable here; the success-path arg mapping is not
// (hard import + no node:test module-mock in Node 20.20 — see the it.skip).
// ─────────────────────────────────────────────────────────────────────────────

describe("convertPitchToInquiry — pre-submitInquiry behaviour (observable)", () => {
  const CV = { tenantId: TENANT, pitchId: "cv-p1", shareTokenId: "cv-stid", issuerProfileId: ACTOR };
  const cvToken = () => signPitchToken(CV).token;
  function cvDb(pitchOver: Row, talents: Row[] = []): FakeDb {
    return new FakeDb({
      pitches: [
        {
          id: CV.pitchId,
          tenant_id: TENANT,
          share_token_id: CV.shareTokenId,
          status: "approved",
          expires_at: null,
          recipient_user_id: null,
          created_by_user_id: ACTOR,
          converted_inquiry_id: null,
          recipient_contact: { name: "Mara", email: "mara@example.com" },
          brief: {},
          personal_note: null,
          ...pitchOver,
        },
      ],
      pitch_talents: talents,
      inquiries: [],
      pitch_events: [],
    });
  }

  it("IDEMPOTENT: status converted + converted_inquiry_id set → returns the existing inquiry id, does NOT call submitInquiry, writes nothing, emits nothing", async () => {
    const db = cvDb({ status: "converted", converted_inquiry_id: "inq-existing" });
    const res = await convertPitchToInquiry(db.client(), { token: cvToken() });
    assert.deepEqual(res, { ok: true, data: { inquiryId: "inq-existing", pitchId: CV.pitchId } });
    assert.equal(db.rows("inquiries").length, 0);
    assert.equal(eventTypes(db).length, 0);
    // pitch_talents was never even read on the idempotent short-circuit
    assert.equal(db.calls.filter((c) => c.table === "pitch_talents").length, 0);
  });

  it("QUIRK / SUSPECTED BUG: status converted but converted_inquiry_id NULL does NOT short-circuit (idempotency needs BOTH) — it falls through past the declined/cancelled/expired guard and proceeds toward a SECOND submitInquiry", async () => {
    const db = cvDb({ status: "converted", converted_inquiry_id: null }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: CV.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
    ]);
    const res = await convertPitchToInquiry(db.client(), { token: cvToken() });
    // Pinned current behavior: it did NOT return the idempotent shape and it
    // DID read pitch_talents (i.e. it entered the conversion body again).
    assert.equal(db.calls.some((c) => c.table === "pitch_talents" && c.op === "select"), true);
    assert.equal(res.ok, false); // submitInquiry fails under the fake — see contract test
  });

  it("declined pitch → invalid_status_transition (convert's own guard; load returns ok for declined)", async () => {
    const db = cvDb({ status: "declined" });
    const res = await convertPitchToInquiry(db.client(), { token: cvToken() });
    assert.deepEqual(res, { ok: false, reason: "invalid_status_transition" });
  });

  it("LEGACY PATH: status 'sent' (NOT 'approved') still converts — the engine does NOT enforce the approved-only step the public landing shows", async () => {
    const db = cvDb({ status: "sent" }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: CV.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
    ]);
    const res = await convertPitchToInquiry(db.client(), { token: cvToken() });
    // Reached the conversion body (talent resolution ran) — not gated on 'approved'.
    assert.equal(db.calls.some((c) => c.table === "pitch_talents" && c.op === "select"), true);
    assert.equal(res.ok, false); // fails downstream at submitInquiry under the fake
  });

  it("all talents removed_by_client → no_talents BEFORE submitInquiry", async () => {
    const db = cvDb({ status: "approved" }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: CV.pitchId, talent_profile_id: "tA", removed_by_client_at: "2026-01-01T00:00:00.000Z" },
    ]);
    const res = await convertPitchToInquiry(db.client(), { token: cvToken() });
    assert.deepEqual(res, { ok: false, reason: "no_talents" });
    assert.equal(db.rows("inquiries").length, 0);
  });

  it("missing contact name/email (no stored, no form) → validation_failed with the exact message, no inquiry created", async () => {
    const db = cvDb({ status: "approved", recipient_contact: {} }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: CV.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
    ]);
    const res = await convertPitchToInquiry(db.client(), { token: cvToken() });
    assert.deepEqual(res, {
      ok: false,
      reason: "validation_failed",
      message: "Contact name and email are required.",
    });
    assert.equal(db.rows("inquiries").length, 0);
  });

  it("no actor available (guest pitch: recipient_user_id null, created_by_user_id null, no recipientUserId) → internal_error 'No actor available…'", async () => {
    const db = cvDb({ status: "approved", recipient_user_id: null, created_by_user_id: null }, [
      { id: "pt1", tenant_id: TENANT, pitch_id: CV.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
    ]);
    const res = await convertPitchToInquiry(db.client(), { token: cvToken() });
    assert.deepEqual(res, {
      ok: false,
      reason: "internal_error",
      message: "No actor available to attribute this inquiry.",
    });
    assert.equal(db.rows("inquiries").length, 0);
  });
});

describe("convertPitchToInquiry — submitInquiry failure-surfacing contract", () => {
  // Distinct tenant/actor so submitInquiry's in-memory per-actor + per-tenant
  // rate-limiter buckets never collide with other suites in this process.
  const FT = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const FACTOR = "fa11ed00-0000-0000-0000-000000000001";
  const CV = { tenantId: FT, pitchId: "cvf-p1", shareTokenId: "cvf-stid", issuerProfileId: FACTOR };

  it("a failed submitInquiry surfaces as internal_error + non-empty message; the pitch is NOT marked converted and NO converted/trust-bypass events fire", async () => {
    const db = new FakeDb({
      pitches: [
        {
          id: CV.pitchId,
          tenant_id: FT,
          share_token_id: CV.shareTokenId,
          status: "approved",
          expires_at: null,
          recipient_user_id: FACTOR, // valid actor → passes actor-resolution
          created_by_user_id: FACTOR,
          converted_inquiry_id: null,
          recipient_contact: { name: "Mara", email: "mara@example.com" },
          brief: {},
          personal_note: null,
        },
      ],
      pitch_talents: [
        { id: "pt1", tenant_id: FT, pitch_id: CV.pitchId, talent_profile_id: "tA", removed_by_client_at: null },
      ],
      inquiries: [],
      pitch_events: [],
    });
    const res = await convertPitchToInquiry(db.client(), {
      token: signPitchToken(CV).token,
    });
    // submitInquiry (real import) runs against the fake and fails at its
    // permission gate (no profile row) → convert maps any failure to:
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "internal_error");
    assert.ok(res.ok === false && typeof res.message === "string" && res.message.length > 0);
    // The pitch-engine contract on failure: NO lineage stamp, NO terminal
    // transition, NO success/audit events. (These ARE pitch-engine's own
    // observable effects — distinct from submitInquiry internals.)
    assert.equal((db.rows("pitches")[0] as Row).status, "approved");
    assert.equal((db.rows("pitches")[0] as Row).converted_inquiry_id, null);
    const types = eventTypes(db);
    assert.equal(types.includes("converted"), false);
    assert.equal(types.includes("pitch_curated_override"), false);
  });

  it.skip("FLAG (untestable seam — coverage gap, not a bug): the convert→submitInquiry SUCCESS path is not unit-coverable here. `submitInquiry` is a hard ESM import and Node 20.20's node:test exposes no `mock.module`; driving the REAL submitInquiry to success would require faking ~10 inquiry tables and would characterize submitInquiry, not the pitch engine. UNCOVERED as a result: (1) source-attribution arg mapping — source_channel:'pitch', source_page:`pitch:<id>`, initiator_role:'admin', initiator_user_id, source_workspace_id:tenant; (2) the documented `origin_domain: null` drop-on-the-floor quirk (pitch-engine.ts:834); (3) trust_level_at_submission = clientUserId ? null : 'basic'; (4) message '(via pitch) <personal_note>' fallback + form>stored contact precedence; (5) post-success lineage stamping (inquiries.source_pitch_id, pitches.status='converted'+converted_inquiry_id+converted_at) and the CONVERTED + pitch_curated_override (TRUST_BYPASS) events. Refactor owner: introduce a submitInquiry injection seam (param/factory default-bound to the real impl) so this contract is assertable in isolation.", () => {});
});
