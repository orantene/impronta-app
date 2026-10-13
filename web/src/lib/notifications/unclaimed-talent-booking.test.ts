import test from "node:test";
import assert from "node:assert/strict";

import { NOTIFICATION_CATALOG } from "./catalog";
import {
  loadUnclaimedBookingView,
  unclaimedTalentNames,
  unclaimedTalentWorkspaceStaff,
} from "./catalog-audiences-unclaimed";
import { getEmailCopy } from "./email-copy";
import type { AudienceContext, NotificationEvent } from "./types";

type Rows = { table: string; data: unknown; error?: unknown };

function fakeCtx(rows: Rows[]): { ctx: AudienceContext; tables: string[] } {
  const tables: string[] = [];
  const ctx = {
    admin: {
      from: (table: string) => {
        tables.push(table);
        const hit = rows.find((r) => r.table === table);
        const result = { data: hit?.data ?? null, error: hit?.error ?? null };
        const q: Record<string, unknown> = {};
        const chain = () => q;
        for (const k of ["select", "eq", "neq", "in"]) q[k] = chain;
        q.maybeSingle = async () => result;
        q.then = (res: (v: typeof result) => unknown) => Promise.resolve(result).then(res);
        return q;
      },
    },
  } as unknown as AudienceContext;
  return { ctx, tables };
}

const ev = (payload: Record<string, unknown>): NotificationEvent =>
  ({ inquiryId: "i1", tenantId: "t1", payload }) as unknown as NotificationEvent;

test("unclaimedTalentNames flags only profiles with no account", () => {
  const names = unclaimedTalentNames([
    { user_id: null, talent_profiles: { user_id: null, display_name: "Ana" } },
    { user_id: null, talent_profiles: [{ user_id: "u2", display_name: "Bea" }] },
    { user_id: "u3", talent_profiles: { user_id: null, display_name: "Cy" } },
  ]);
  assert.deepEqual(names, ["Ana"]);
});

test("workspace staff are the audience only when a talent is unclaimed", async () => {
  const staff = [{ profile_id: "owner-1" }, { profile_id: "coord-1" }];
  const { ctx } = fakeCtx([{ table: "agency_memberships", data: staff }]);
  assert.deepEqual(await unclaimedTalentWorkspaceStaff(ev({ unclaimedTalentCount: 0 }), ctx), []);
  const out = await unclaimedTalentWorkspaceStaff(ev({ unclaimedTalentCount: 1 }), ctx);
  assert.deepEqual(
    out.map((m) => (m.kind === "user" ? m.userId : null)),
    ["owner-1", "coord-1"],
  );
});

test("the audience never includes the profile's invitation email", async () => {
  const { ctx, tables } = fakeCtx([{ table: "agency_memberships", data: [{ profile_id: "o" }] }]);
  const out = await unclaimedTalentWorkspaceStaff(ev({ unclaimedTalentCount: 2, invitationEmail: "x@y.co" }), ctx);
  assert.ok(out.every((m) => m.kind === "user"));
  assert.ok(!tables.includes("talent_profiles"));
});

test("hydrate degrades to the base view when the roster read errors", async () => {
  const { ctx } = fakeCtx([{ table: "inquiry_participants", data: null, error: { message: "boom" } }]);
  const view = await loadUnclaimedBookingView(ev({}), ctx);
  assert.equal(view.unclaimedTalentCount, undefined);
});

test("hydrate counts unclaimed talents from the roster", async () => {
  const { ctx } = fakeCtx([
    {
      table: "inquiry_participants",
      data: [{ user_id: null, talent_profiles: { user_id: null, display_name: "Ana" } }],
    },
  ]);
  const view = await loadUnclaimedBookingView(ev({}), ctx);
  assert.equal(view.unclaimedTalentCount, 1);
  assert.equal(view.unclaimedTalentNames, "Ana");
});

test("entry is registered with in-app + email and EN/ES copy", () => {
  const entry = NOTIFICATION_CATALOG.find((e) => e.id === "booking.confirmed.unclaimed_talent");
  assert.ok(entry?.in_app && entry.email);
  assert.deepEqual(entry.triggers, ["booking.confirmed"]);
  for (const l of ["en", "es"]) {
    const t = getEmailCopy(l)["workspace.unclaimed_talent_booking"];
    assert.match(t.intro, /\{talent\}/);
  }
  const recipient = { locale: "es" } as never;
  const e = ev({ unclaimedTalentNames: "Ana" });
  assert.match(entry.in_app.body!(e, recipient) ?? "", /no ha reclamado/);
  assert.match(entry.in_app.body!(e, { locale: "en" } as never) ?? "", /hasn't claimed/);
});
