/**
 * G.1 — Federated people loader smoke test.
 *
 * Validates the core dedup invariant of loadPlatformPeopleFederated:
 *  • Talent profiles with user_id = null → appear as kind:"unclaimed_talent"
 *  • Talent profiles with user_id matching a profile → folded into the human
 *    row (kind:"human", talentProfileId set) and NOT emitted as a separate row
 *  • Output row count = humans + unclaimed_talent (no double-counting)
 *  • Human row with claimed talent exposes talentProfileId, talentSlug, etc.
 */

import { describe, it, expect, vi } from "vitest";
import { loadPlatformPeopleFederated } from "@/app/(workspace)/platform/platform-users-data";

// ─── Minimal mock data ────────────────────────────────────────────────────────

const HUMAN_ID = "aaaa-0001";
const TALENT_CLAIMED_ID = "bbbb-0001";
const TALENT_UNCLAIMED_ID = "cccc-0001";
const EMAIL = "test@example.com";

// Profile rows returned by the `profiles` Supabase query
const mockProfiles = [
  {
    id: HUMAN_ID,
    display_name: "Alice Human",
    app_role: "talent",
    account_status: "active",
    created_at: "2024-01-15T10:00:00Z",
    is_test_account: false,
    origin_kind: "self_signup",
    origin_workspace_id: null,
    origin_created_by_user_id: null,
  },
];

// Talent profile rows — one claimed (user_id set), one unclaimed (user_id null)
const mockTalentRows = [
  {
    id: TALENT_CLAIMED_ID,
    display_name: "Alice Talent",
    first_name: "Alice",
    last_name: "Talent",
    slug: "alice-talent",
    user_id: HUMAN_ID,  // claimed by HUMAN_ID
    workflow_status: "published",
    published_globally: true,
    is_test_account: false,
    origin_kind: null,
    origin_workspace_id: null,
    origin_created_by_user_id: null,
    created_at: "2024-01-16T10:00:00Z",
    talent_plan_key: "talent_basic",
  },
  {
    id: TALENT_UNCLAIMED_ID,
    display_name: "Bob Unclaimed",
    first_name: "Bob",
    last_name: "Unclaimed",
    slug: "bob-unclaimed",
    user_id: null,  // unclaimed
    workflow_status: "draft",
    published_globally: false,
    is_test_account: false,
    origin_kind: "agency_signup",
    origin_workspace_id: "wid-001",
    origin_created_by_user_id: "uid-001",
    created_at: "2024-01-17T10:00:00Z",
    talent_plan_key: "talent_basic",
  },
];

// Membership rows (empty for this test)
const mockMemberships: unknown[] = [];

// auth.admin.listUsers response
const mockAuthUsers = {
  users: [
    {
      id: HUMAN_ID,
      email: EMAIL,
      email_confirmed_at: "2024-01-15T12:00:00Z",
      last_sign_in_at: "2024-06-01T08:00:00Z",
    },
  ],
};

// ─── Module mock ──────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const data =
        table === "profiles"
          ? mockProfiles
          : table === "talent_profiles"
            ? mockTalentRows
            : table === "agency_memberships"
              ? mockMemberships
              : [];

      const builder: Record<string, unknown> = {
        select: () => builder,
        in: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
        then: (res: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data, error: null }).then(res),
      };
      return builder;
    },
    auth: {
      admin: {
        listUsers: () => Promise.resolve({ data: mockAuthUsers, error: null }),
      },
    },
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loadPlatformPeopleFederated — dedup invariants", () => {
  it("returns exactly 2 rows: 1 human + 1 unclaimed_talent", async () => {
    const rows = await loadPlatformPeopleFederated();
    expect(rows).toHaveLength(2);
  });

  it("claimed talent does NOT appear as a separate unclaimed_talent row", async () => {
    const rows = await loadPlatformPeopleFederated();
    const unclaimedRows = rows.filter((r) => r.kind === "unclaimed_talent");
    expect(unclaimedRows).toHaveLength(1);
    expect(unclaimedRows[0].id).toBe(TALENT_UNCLAIMED_ID);
  });

  it("human row has talentProfileId set to the claimed talent's id", async () => {
    const rows = await loadPlatformPeopleFederated();
    const human = rows.find((r) => r.kind === "human");
    expect(human).toBeDefined();
    expect(human?.talentProfileId).toBe(TALENT_CLAIMED_ID);
  });

  it("human row exposes correct email from auth.admin.listUsers", async () => {
    const rows = await loadPlatformPeopleFederated();
    const human = rows.find((r) => r.kind === "human");
    expect(human?.kind).toBe("human");
    if (human?.kind === "human") {
      expect(human.email).toBe(EMAIL);
      expect(human.emailConfirmed).toBe(true);
    }
  });

  it("human row isTalent = true when it has a claimed talent profile", async () => {
    const rows = await loadPlatformPeopleFederated();
    const human = rows.find((r) => r.kind === "human");
    expect(human?.isTalent).toBe(true);
  });

  it("unclaimed_talent row has correct slug and workflow status", async () => {
    const rows = await loadPlatformPeopleFederated();
    const unclaimed = rows.find(
      (r) => r.kind === "unclaimed_talent" && r.id === TALENT_UNCLAIMED_ID,
    );
    expect(unclaimed).toBeDefined();
    expect(unclaimed?.talentSlug).toBe("bob-unclaimed");
    expect(unclaimed?.talentWorkflowStatus).toBe("draft");
  });

  it("unclaimed_talent row has email = null (no login)", async () => {
    const rows = await loadPlatformPeopleFederated();
    const unclaimed = rows.find((r) => r.kind === "unclaimed_talent");
    expect(unclaimed?.email).toBeNull();
    expect(unclaimed?.lastSignInAt).toBeNull();
  });

  it("human row publishedGlobally reflects claimed talent profile", async () => {
    const rows = await loadPlatformPeopleFederated();
    const human = rows.find((r) => r.kind === "human");
    expect(human?.publishedGlobally).toBe(true);
  });
});
