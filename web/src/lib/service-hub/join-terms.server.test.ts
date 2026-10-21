import { test } from "node:test";
import assert from "node:assert/strict";

import { JOIN_PATHS, joinTermsInputFor, type JoinPath } from "./join-terms";
import { loadJoinTermsContext, proposeTermsOnJoin } from "./join-terms.server";
import { resolveTalentTermsState, type WorkspaceTalentTermsRow } from "./terms";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TALENT = "33333333-3333-4333-8333-333333333333";

type RpcCall = { fn: string; args: Record<string, unknown> };
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Twin of propose_workspace_talent_terms (#4158): the caller must be owner/admin of the
 * tenant and the talent must be on THAT tenant's roster; a proposal is stored PENDING.
 */
function fakeDb(opts: { ownerOf?: string[]; rosterOf?: string[]; error?: RpcResult["error"] } = {}) {
  const calls: RpcCall[] = [];
  const rows: WorkspaceTalentTermsRow[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
      calls.push({ fn, args });
      if (opts.error) return { data: null, error: opts.error };
      const tenant = String(args.p_tenant_id);
      if (!(opts.ownerOf ?? [TENANT_A]).includes(tenant) || !(opts.rosterOf ?? [TENANT_A]).includes(tenant)) {
        return { data: null, error: { code: "42501", message: "not allowed" } };
      }
      const version = rows.filter((r) => r.tenantId === tenant).length + 1;
      rows.push({
        id: `t${version}`,
        tenantId: tenant,
        talentProfileId: String(args.p_talent_profile_id),
        version,
        status: "pending",
        proposedAt: "2026-10-20T00:00:00Z",
        workModel: args.p_work_model as WorkspaceTalentTermsRow["workModel"],
        shareKind: args.p_share_kind as WorkspaceTalentTermsRow["shareKind"],
        shareBps: args.p_share_bps as number | null,
        shareAmountCents: args.p_share_amount_cents as number | null,
        shareCurrency: args.p_share_currency as string | null,
        clientPriceMode: args.p_client_price_mode as WorkspaceTalentTermsRow["clientPriceMode"],
        showIdentity: args.p_show_identity as WorkspaceTalentTermsRow["showIdentity"],
        showContact: Boolean(args.p_show_contact),
        clientContact: args.p_client_contact as WorkspaceTalentTermsRow["clientContact"],
        exclusive: Boolean(args.p_exclusive),
        noPoaching: Boolean(args.p_no_poaching),
      });
      return { data: version, error: null };
    },
  };
  return { client, calls, rows };
}

function propose(client: Parameters<typeof proposeTermsOnJoin>[0], path: JoinPath, tenantId = TENANT_A) {
  return proposeTermsOnJoin(client, {
    tenantId,
    talentProfileId: TALENT,
    path,
    input: joinTermsInputFor("open_network"),
    defaultModel: "open_network",
  });
}

test("every join path creates a pending proposal through #4158's RPC", async () => {
  for (const path of JOIN_PATHS) {
    const db = fakeDb();
    assert.equal(await propose(db.client, path), "sent");
    assert.equal(db.calls.length, 1);
    assert.equal(db.calls[0].fn, "propose_workspace_talent_terms");
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0].status, "pending");
    assert.equal(db.rows[0].shareBps, 2000);
  }
});

test("no sale before acceptance: a proposal is never in force", async () => {
  const db = fakeDb();
  await propose(db.client, "invite");
  const state = resolveTalentTermsState(db.rows);
  assert.equal(state.inForce, null, "a freshly proposed version must not be in force");
  assert.equal(state.pending?.version, 1);
  // Only the propose RPC is ever called: never respond (accept) or any listing RPC.
  assert.deepEqual(db.calls.map((c) => c.fn), ["propose_workspace_talent_terms"]);
});

test("no sale before acceptance: new terms on top of accepted ones leave the old ones in force", async () => {
  const db = fakeDb();
  await propose(db.client, "direct_add");
  db.rows[0].status = "accepted"; // the talent accepted v1 on their card
  await proposeTermsOnJoin(db.client, {
    tenantId: TENANT_A,
    talentProfileId: TALENT,
    path: "discover_join",
    input: { ...joinTermsInputFor("open_network"), sharePercent: "30" },
    defaultModel: "open_network",
  });
  const state = resolveTalentTermsState(db.rows);
  assert.equal(state.inForce?.version, 1);
  assert.equal(state.inForce?.shareBps, 2000);
  assert.equal(state.pending?.version, 2);
  assert.equal(state.pending?.shareBps, 3000);
});

test("tenant scoping: the RPC gets exactly the scoped workspace, and another workspace is refused", async () => {
  const db = fakeDb({ ownerOf: [TENANT_A], rosterOf: [TENANT_A] });
  assert.equal(await propose(db.client, "invite", TENANT_A), "sent");
  assert.equal(db.calls[0].args.p_tenant_id, TENANT_A);
  assert.equal(db.calls[0].args.p_talent_profile_id, TALENT);
  // An owner of A cannot drop terms on B's talent: the DB answers 42501.
  assert.equal(await propose(db.client, "invite", TENANT_B), "not_allowed");
  assert.equal(db.rows.filter((r) => r.tenantId === TENANT_B).length, 0);
  // Owner of B, but the talent is not on B's roster: refused too.
  const db2 = fakeDb({ ownerOf: [TENANT_B], rosterOf: [TENANT_A] });
  assert.equal(await propose(db2.client, "discover_join", TENANT_B), "not_allowed");
});

test("bad ids, skips and invalid shares never reach the database", async () => {
  const db = fakeDb();
  assert.equal(await proposeTermsOnJoin(db.client, { tenantId: "x", talentProfileId: TALENT, path: "invite", input: joinTermsInputFor("open_network"), defaultModel: "open_network" }), "invalid");
  assert.equal(await proposeTermsOnJoin(db.client, { tenantId: TENANT_A, talentProfileId: TALENT, path: "invite", input: null, defaultModel: "open_network" }), "skipped");
  assert.equal(await proposeTermsOnJoin(db.client, { tenantId: TENANT_A, talentProfileId: TALENT, path: "invite", input: { ...joinTermsInputFor("open_network"), send: false }, defaultModel: "open_network" }), "skipped");
  assert.equal(await proposeTermsOnJoin(db.client, { tenantId: TENANT_A, talentProfileId: TALENT, path: "invite", input: { ...joinTermsInputFor("open_network"), sharePercent: "99" }, defaultModel: "open_network" }), "invalid");
  assert.equal(db.calls.length, 0);
});

test("missing migration answers unavailable; other errors fail without throwing", async () => {
  assert.equal(await propose(fakeDb({ error: { code: "PGRST202" } }).client, "invite"), "unavailable");
  assert.equal(await propose(fakeDb({ error: { code: "42883" } }).client, "invite"), "unavailable");
  assert.equal(await propose(null, "invite"), "unavailable");
  assert.equal(await propose(fakeDb({ error: { code: "57014", message: "timeout" } }).client, "invite"), "failed");
});

type Eq = [string, unknown];

function fakeAdmin(byTable: Record<string, { data: unknown; error: { code?: string } | null }>) {
  const eqs: Record<string, Eq[]> = {};
  const admin = {
    from(table: string) {
      eqs[table] = eqs[table] ?? [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => (eqs[table].push([col, val]), q),
        maybeSingle: async () => byTable[table] ?? { data: null, error: null },
      };
      return q;
    },
  };
  return { admin: admin as never, eqs };
}

test("context: the workspace's model and an owner/admin check, both scoped to the tenant", async () => {
  const f = fakeAdmin({
    workspace_hub_defaults: { data: { work_model: "rental_studio" }, error: null },
    agency_memberships: { data: { role: "owner" }, error: null },
    agencies: { data: { settings: { display_currency: "mxn" } }, error: null },
  });
  assert.deepEqual(await loadJoinTermsContext(f.admin, TENANT_A, "u1"), { defaultModel: "rental_studio", canPropose: true, workspaceCurrency: "MXN" });
  assert.deepEqual(f.eqs.agencies, [["id", TENANT_A]]);
  assert.deepEqual(f.eqs.agency_memberships, [["tenant_id", TENANT_A], ["profile_id", "u1"], ["status", "active"]]);
  assert.deepEqual(f.eqs.workspace_hub_defaults, [["tenant_id", TENANT_A]]);

  const staff = fakeAdmin({ agency_memberships: { data: { role: "coordinator" }, error: null } });
  assert.deepEqual(await loadJoinTermsContext(staff.admin, TENANT_A, "u1"), { defaultModel: "coordinator_agency", canPropose: false, workspaceCurrency: null });

  const broken = fakeAdmin({ agency_memberships: { data: null, error: { code: "57014" } } });
  assert.equal((await loadJoinTermsContext(broken.admin, TENANT_A, "u1")).canPropose, false);
});

test("workspace currency is read like #4200: explicit only, fail closed, never USD", async () => {
  const cases: Array<[{ data: unknown; error: { code?: string } | null }, string | null]> = [
    [{ data: { settings: { display_currency: " eur " } }, error: null }, "EUR"],
    [{ data: { settings: {} }, error: null }, null],
    [{ data: { settings: { display_currency: "dollars" } }, error: null }, null],
    [{ data: { settings: null }, error: null }, null],
    [{ data: null, error: null }, null],
    [{ data: null, error: { code: "57014" } }, null],
  ];
  for (const [agencies, want] of cases) {
    const f = fakeAdmin({ agencies, agency_memberships: { data: { role: "owner" }, error: null } });
    assert.equal((await loadJoinTermsContext(f.admin, TENANT_A, "u1")).workspaceCurrency, want);
  }
});
