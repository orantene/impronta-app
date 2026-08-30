import assert from "node:assert/strict";
import { test } from "node:test";

import { loadOwnedGuestTicket } from "./guest-access";
import type { SupabaseClient } from "@supabase/supabase-js";

const TICKET_A = {
  id: "11111111-1111-4111-8111-111111111111",
  ticket_number: 1,
  tenant_id: null,
  surface: "guest",
  requester_user_id: null,
  guest_session_id: "session-owner",
  talent_profile_id: null,
  client_profile_id: null,
  subject: "Question",
  category: null,
  tags: [],
  origin_surface_slug: "/",
  status: "open",
  waiting_on: "support",
  priority: "normal",
  handled_by: "ai",
  escalated_at: null,
  escalation_reason: null,
  assignee_user_id: null,
  contact_email: "a@example.com",
  contact_name: null,
  contact_phone: null,
  callback_requested: false,
  callback_pref: null,
  last_message_at: new Date().toISOString(),
  last_message_preview: "hi",
  message_count: 1,
  first_human_response_at: null,
  resolved_at: null,
  closed_at: null,
  reopened_count: 0,
  satisfaction_rating: null,
  satisfaction_comment: null,
  rated_at: null,
  root_cause: null,
  long_term_fix: null,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function mockAdmin(row: Record<string, unknown> | null): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: row, error: null }),
      };
    },
  } as unknown as SupabaseClient;
}

test("loadOwnedGuestTicket allows the owning session", async () => {
  const ticket = await loadOwnedGuestTicket(mockAdmin(TICKET_A), TICKET_A.id, {
    guestSessionId: "session-owner",
    userId: null,
  });
  assert.ok(ticket);
  assert.equal(ticket.id, TICKET_A.id);
});

test("loadOwnedGuestTicket denies a different session", async () => {
  const ticket = await loadOwnedGuestTicket(mockAdmin(TICKET_A), TICKET_A.id, {
    guestSessionId: "session-other",
    userId: null,
  });
  assert.equal(ticket, null);
});

test("loadOwnedGuestTicket ignores a client-supplied session field", async () => {
  const ticket = await loadOwnedGuestTicket(mockAdmin(TICKET_A), TICKET_A.id, {
    guestSessionId: "attacker-session",
    userId: null,
    // @ts-expect-error client must never supply this
    clientGuestSessionId: "session-owner",
  });
  assert.equal(ticket, null);
});

test("loadOwnedGuestTicket allows the requester user branch", async () => {
  const row = { ...TICKET_A, requester_user_id: "user-1", guest_session_id: "session-old" };
  const ticket = await loadOwnedGuestTicket(mockAdmin(row), TICKET_A.id, {
    guestSessionId: "session-new-device",
    userId: "user-1",
  });
  assert.ok(ticket);
  assert.equal(ticket.requesterUserId, "user-1");
});
