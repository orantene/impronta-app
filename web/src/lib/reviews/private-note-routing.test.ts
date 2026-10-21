/**
 * TUL-1686: in a team studio the client's private review note goes to the
 * workspace, not the talent. Every other work model is unchanged.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  loadTalentPrivateNotes,
  loadWorkspacePrivateNotes,
  privateNoteGoesToWorkspace,
  readTalentPrivateNotes,
  readNoteWorkspace,
  readWorkspacePrivateNotes,
  teamStudioTenantIds,
} from "./private-note-routing";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };

function fakeDb(replies: Record<string, Reply>) {
  const seen: Array<{ table: string; op: string; args: unknown[] }> = [];
  return {
    seen,
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "neq", "order", "limit", "not"]) {
        q[op] = (...args: unknown[]) => {
          seen.push({ table, op, args });
          return q;
        };
      }
      q.maybeSingle = () => {
        seen.push({ table, op: "maybeSingle", args: [] });
        const r = replies[table] ?? { data: null, error: null };
        const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return Promise.resolve({ data: d, error: r.error ?? null });
      };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(replies[table] ?? { data: [], error: null }).then(res);
      return q;
    },
  };
}

function fakeRpc(reply: Reply) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    rpc(fn: string, args: unknown) {
      calls.push({ fn, args });
      return Promise.resolve(reply);
    },
  };
}

const MISSING = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };

const REVIEWS = [
  { id: "r-studio", tenant_id: "t-studio", talent_profile_id: "tal", private_note: "Late, but kind.", created_at: "2026-10-03" },
  { id: "r-coord", tenant_id: "t-coord", talent_profile_id: "tal", private_note: "Bring more towels.", created_at: "2026-10-02" },
  { id: "r-open", tenant_id: "t-open", talent_profile_id: "tal", private_note: "  Great energy  ", created_at: "2026-10-01" },
  { id: "r-none", tenant_id: null, talent_profile_id: "tal", private_note: "Direct booking note.", created_at: "2026-09-30" },
];
const AGENCIES = [
  { id: "t-studio", work_model: "team_studio" },
  { id: "t-coord", work_model: "coordinator_agency" },
  { id: "t-open", work_model: "open_network" },
];

describe("the rule", () => {
  test("only team_studio sends the note to the workspace", () => {
    assert.equal(privateNoteGoesToWorkspace("team_studio"), true);
    for (const m of ["coordinator_agency", "open_network", "rental_studio", "friends_collective", null, undefined, ""]) {
      assert.equal(privateNoteGoesToWorkspace(m), false, String(m));
    }
  });

  test("team studio tenants: the set; column missing: none; other errors: unknown (null)", async () => {
    assert.deepEqual([...((await teamStudioTenantIds(fakeDb({ agencies: { data: AGENCIES } }) as never, ["t-studio", "t-coord"])) ?? [])], ["t-studio"]);
    assert.deepEqual([...((await teamStudioTenantIds(fakeDb({ agencies: { data: null, error: { code: "42703" } } }) as never, ["t"])) ?? ["x"])], []);
    assert.equal(await teamStudioTenantIds(fakeDb({ agencies: { data: null, error: { message: "down" } } }) as never, ["t"]), null);
  });
});

describe("talent side: a talent never gets a team-studio note", () => {
  test("fallback read drops the team-studio review and keeps every other model", async () => {
    const db = fakeDb({ talent_reviews: { data: REVIEWS }, agencies: { data: AGENCIES } });
    const notes = await readTalentPrivateNotes(db as never, "tal", 6);
    assert.deepEqual(notes.map((n) => n.reviewId), ["r-coord", "r-open", "r-none"]);
    assert.ok(!notes.some((n) => n.note.includes("Late, but kind")));
    assert.equal(notes.find((n) => n.reviewId === "r-open")?.note, "Great energy");
  });

  test("fails closed: workspace models unreadable keeps only workspace-less notes", async () => {
    const db = fakeDb({ talent_reviews: { data: REVIEWS }, agencies: { data: null, error: { message: "timeout" } } });
    assert.deepEqual((await readTalentPrivateNotes(db as never, "tal", 6)).map((n) => n.reviewId), ["r-none"]);
  });

  test("before the work_model column exists, no team studio can exist: nothing is dropped", async () => {
    const db = fakeDb({ talent_reviews: { data: REVIEWS }, agencies: { data: null, error: { code: "42703" } } });
    assert.equal((await readTalentPrivateNotes(db as never, "tal", 6)).length, 4);
  });

  test("respects the limit after filtering", async () => {
    const db = fakeDb({ talent_reviews: { data: REVIEWS }, agencies: { data: AGENCIES } });
    assert.deepEqual((await readTalentPrivateNotes(db as never, "tal", 2)).map((n) => n.reviewId), ["r-coord", "r-open"]);
  });

  test("the DB reader is used when the migration is applied, and the fallback is not touched", async () => {
    const rpc = fakeRpc({ data: [{ review_id: "r-coord", private_note: "Bring more towels.", created_at: "2026-10-02" }], error: null });
    const db = fakeDb({ talent_reviews: { data: REVIEWS }, agencies: { data: AGENCIES } });
    const notes = await loadTalentPrivateNotes(rpc as never, db as never, "tal", 6);
    assert.deepEqual(notes.map((n) => n.reviewId), ["r-coord"]);
    assert.deepEqual(rpc.calls, [{ fn: "review_private_notes_for_talent", args: { p_talent_profile_id: "tal", p_limit: 6 } }]);
    assert.equal(db.seen.length, 0);
  });

  test("migration held (function missing): falls back to the same rule in code", async () => {
    const db = fakeDb({ talent_reviews: { data: REVIEWS }, agencies: { data: AGENCIES } });
    const notes = await loadTalentPrivateNotes(fakeRpc(MISSING) as never, db as never, "tal", 6);
    assert.deepEqual(notes.map((n) => n.reviewId), ["r-coord", "r-open", "r-none"]);
  });

  test("any other DB reader error shows nothing (never falls back to the wide read)", async () => {
    const db = fakeDb({ talent_reviews: { data: REVIEWS }, agencies: { data: AGENCIES } });
    assert.deepEqual(await loadTalentPrivateNotes(fakeRpc({ data: null, error: { code: "42501", message: "denied" } }) as never, db as never, "tal"), []);
    assert.equal(db.seen.length, 0);
  });
});

describe("workspace side: team-studio staff get the notes, other models get none", () => {
  test("team studio: every note earned in the workspace", async () => {
    const studioRows = [
      { id: "r1", talent_profile_id: "tal-a", private_note: "Late, but kind.", created_at: "2026-10-03" },
      { id: "r2", talent_profile_id: "tal-b", private_note: "   ", created_at: "2026-10-02" },
    ];
    const db = fakeDb({ agencies: { data: [{ id: "t-studio", work_model: "team_studio" }] }, talent_reviews: { data: studioRows } });
    const notes = await readWorkspacePrivateNotes(db as never, "t-studio");
    assert.deepEqual(notes, [{ reviewId: "r1", talentProfileId: "tal-a", note: "Late, but kind.", createdAt: "2026-10-03" }]);
    assert.ok(db.seen.some((s) => s.table === "talent_reviews" && s.op === "eq" && s.args[0] === "tenant_id" && s.args[1] === "t-studio"));
  });

  test("any other model: none, and talent_reviews is never read", async () => {
    for (const work_model of ["coordinator_agency", "open_network", "rental_studio", "friends_collective", null]) {
      const db = fakeDb({ agencies: { data: [{ id: "t", work_model }] }, talent_reviews: { data: REVIEWS } });
      assert.deepEqual(await readWorkspacePrivateNotes(db as never, "t"), [], String(work_model));
      assert.ok(!db.seen.some((s) => s.table === "talent_reviews"));
    }
  });

  test("unreadable model or missing column: none", async () => {
    for (const reply of [{ data: null, error: { message: "down" } }, { data: null, error: { code: "42703" } }]) {
      assert.deepEqual(await readWorkspacePrivateNotes(fakeDb({ agencies: reply, talent_reviews: { data: REVIEWS } }) as never, "t"), []);
    }
  });

  test("the DB reader is used when applied; held migration falls back; other errors show nothing", async () => {
    const rpc = fakeRpc({ data: [{ review_id: "r1", talent_profile_id: "tal-a", private_note: "Late, but kind.", created_at: "2026-10-03" }], error: null });
    const db = fakeDb({});
    assert.equal((await loadWorkspacePrivateNotes(rpc as never, db as never, "t-studio")).length, 1);
    assert.deepEqual(rpc.calls, [{ fn: "review_private_notes_for_workspace", args: { p_tenant_id: "t-studio", p_limit: 20 } }]);

    const fb = fakeDb({ agencies: { data: [{ id: "t-studio", work_model: "team_studio" }] }, talent_reviews: { data: [{ id: "r9", talent_profile_id: "x", private_note: "n", created_at: "d" }] } });
    assert.deepEqual((await loadWorkspacePrivateNotes(fakeRpc(MISSING) as never, fb as never, "t-studio")).map((n) => n.reviewId), ["r9"]);

    assert.deepEqual(await loadWorkspacePrivateNotes(fakeRpc({ data: null, error: { message: "boom" } }) as never, fb as never, "t-studio"), []);
  });
});

describe("the forms' workspace read (private-note label)", () => {
  test("team studio: model and name", async () => {
    const db = fakeDb({ agencies: { data: [{ work_model: "team_studio", display_name: " Salón Luna " }] } });
    assert.deepEqual(await readNoteWorkspace(db as never, "t"), { workModel: "team_studio", name: "Salón Luna" });
  });
  test("other model or no model set: read as is (the label stays the talent's)", async () => {
    assert.deepEqual(await readNoteWorkspace(fakeDb({ agencies: { data: [{ work_model: null, display_name: "Biz" }] } }) as never, "t"), { workModel: null, name: "Biz" });
  });
  test("missing work_model column: no team studio can exist, so not unknown", async () => {
    assert.deepEqual(await readNoteWorkspace(fakeDb({ agencies: { data: null, error: { code: "42703" } } }) as never, "t"), { workModel: null, name: null });
  });
  test("any other failure, no row, or no tenant: unknown (null), the label names no one", async () => {
    assert.equal(await readNoteWorkspace(fakeDb({ agencies: { data: null, error: { message: "down" } } }) as never, "t"), null);
    assert.equal(await readNoteWorkspace(fakeDb({ agencies: { data: null } }) as never, "t"), null);
    assert.equal(await readNoteWorkspace(fakeDb({}) as never, null), null);
  });
});
