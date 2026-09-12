import assert from "node:assert/strict";
import { test } from "node:test";

import { claimInquiriesByConfirmedEmail, type ClaimByEmailAdmin } from "./claim-by-email";

type Row = Record<string, unknown>;

function makeAdmin(seed: {
  profileId: string | null;
  inquiries: Row[];
  relationships?: Row[];
}): ClaimByEmailAdmin & { inserts: Record<string, Row[]>; updates: Record<string, Row[]>; inquiryFilters: string[] } {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};
  const inquiryFilters: string[] = [];
  const participants: Row[] = [];
  const relationships: Row[] = [...(seed.relationships ?? [])];
  const approvals: Row[] = [];

  const tableRows = (table: string): Row[] => {
    if (table === "inquiries") return seed.inquiries;
    if (table === "inquiry_participants") return participants;
    if (table === "agency_client_relationships") return relationships;
    if (table === "inquiry_approvals") return approvals;
    return [];
  };

  const matches = (row: Row, filters: Array<[string, unknown]>) =>
    filters.every(([key, value]) => row[key] === value || (value === null && row[key] == null));

  return {
    inserts,
    updates,
    inquiryFilters,
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const ilikes: Array<[string, string]> = [];
      let orClient: { nullOk: boolean; userId?: string } | null = null;
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, value: unknown) {
          filters.push([col, value]);
          return builder;
        },
        is(col: string, value: unknown) {
          filters.push([col, value]);
          return builder;
        },
        ilike(col: string, value: unknown) {
          if (table === "inquiries") inquiryFilters.push(`${col}:${String(value)}`);
          ilikes.push([col, String(value).toLowerCase()]);
          return builder;
        },
        or(expr: string) {
          const userMatch = /client_user_id\.eq\.([^,]+)/.exec(expr);
          orClient = { nullOk: expr.includes("client_user_id.is.null"), userId: userMatch?.[1] };
          return builder;
        },
        async maybeSingle() {
          if (table === "client_profiles") {
            if (!seed.profileId) return { data: null, error: null };
            return { data: { id: seed.profileId }, error: null };
          }
          const rows = tableRows(table).filter((row) => {
            if (table === "inquiries" && orClient) {
              const uid = row.client_user_id as string | null;
              if (!(orClient.nullOk && uid == null) && uid !== orClient.userId) return false;
            }
            if (ilikes.some(([col, value]) => String(row[col] ?? "").toLowerCase() !== value)) return false;
            return matches(row, filters);
          });
          return { data: rows[0] ?? null, error: null };
        },
        async then(resolve: (value: { data: Row[] | null; error: null }) => void) {
          const rows = tableRows(table).filter((row) => {
            if (table === "inquiries" && orClient) {
              const uid = row.client_user_id as string | null;
              if (!(orClient.nullOk && uid == null) && uid !== orClient.userId) return false;
            }
            if (ilikes.some(([col, value]) => String(row[col] ?? "").toLowerCase() !== value)) return false;
            return matches(row, filters);
          });
          resolve({ data: rows, error: null });
        },
        update(patch: Row) {
          updates[table] = [...(updates[table] ?? []), patch];
          const apply = () => {
            for (const row of tableRows(table)) {
              if (matches(row, filters)) Object.assign(row, patch);
            }
            return { error: null };
          };
          return {
            eq(col: string, value: unknown) {
              filters.push([col, value]);
              return this;
            },
            is(col: string, value: unknown) {
              filters.push([col, value]);
              return this;
            },
            then(resolve: (value: { error: null }) => void) {
              resolve(apply());
            },
          };
        },
        async insert(row: Row) {
          inserts[table] = [...(inserts[table] ?? []), row];
          tableRows(table).push({ id: `${table}-${tableRows(table).length + 1}`, ...row });
          return { error: null };
        },
      };
      return builder;
    },
  };
}

test("claim-by-email seats a later-claimed guest on the inquiry and relationship", async () => {
  const admin = makeAdmin({
    profileId: "cp-1",
    inquiries: [
      {
        id: "inq-1",
        tenant_id: "t1",
        client_user_id: null,
        contact_email: "Guest@Impronta.test",
        origin_domain: "impronta.test",
        source_workspace_id: "t1",
        current_offer_id: "off-1",
      },
    ],
  });

  const result = await claimInquiriesByConfirmedEmail({
    admin,
    userId: "user-1",
    verifiedEmail: "guest@impronta.test",
  });

  assert.equal(result.claimed, 1);
  assert.equal(result.linkedParticipants, 1);
  assert.equal(result.linkedRelationships, 1);
  assert.equal(admin.updates.inquiries?.[0]?.client_user_id, "user-1");
  assert.equal(admin.inserts.inquiry_participants?.[0]?.user_id, "user-1");
  assert.equal(admin.inserts.agency_client_relationships?.[0]?.client_profile_id, "cp-1");
  assert.equal(admin.inserts.inquiry_approvals?.[0]?.offer_id, "off-1");
  assert.ok(
    admin.inquiryFilters.some((entry) => entry.startsWith("contact_email:guest@impronta.test")),
    "email must be filtered in PostgREST, not after the 1000-row cap",
  );
});

test("claim-by-email ignores a different contact email", async () => {
  const admin = makeAdmin({
    profileId: "cp-1",
    inquiries: [
      {
        id: "inq-1",
        tenant_id: "t1",
        client_user_id: null,
        contact_email: "other@impronta.test",
        origin_domain: null,
        source_workspace_id: null,
        current_offer_id: null,
      },
    ],
  });

  const result = await claimInquiriesByConfirmedEmail({
    admin,
    userId: "user-1",
    verifiedEmail: "guest@impronta.test",
  });

  assert.equal(result.claimed, 0);
  assert.equal(admin.inserts.inquiry_participants, undefined);
});

test("already-owned inquiry does not rewrite relationship activity", async () => {
  const admin = makeAdmin({
    profileId: "cp-1",
    inquiries: [
      {
        id: "inq-1",
        tenant_id: "t1",
        client_user_id: "user-1",
        contact_email: "guest@impronta.test",
        origin_domain: "later.test",
        source_workspace_id: "later",
        current_offer_id: null,
      },
    ],
    relationships: [
      {
        id: "rel-1",
        tenant_id: "t1",
        client_profile_id: "cp-1",
        first_inquiry_id: "inq-old",
        last_interaction_at: "2026-01-01T00:00:00Z",
        origin_domain: "original.test",
        source_workspace_id: "orig",
      },
    ],
  });

  const result = await claimInquiriesByConfirmedEmail({
    admin,
    userId: "user-1",
    verifiedEmail: "guest@impronta.test",
  });

  assert.equal(result.claimed, 0);
  assert.equal(result.linkedRelationships, 1);
  assert.equal(admin.updates.agency_client_relationships, undefined);
});
