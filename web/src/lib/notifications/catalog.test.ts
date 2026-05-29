import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReactElement } from "react";
import { NOTIFICATION_CATALOG, findCatalogEntries, findCatalogEntryById } from "./catalog";
import type { NotificationEvent, ResolvedRecipient } from "./types";

// ─── Phase 10 — platform admin alerts ───────────────────────────────────────
//
// These guard the catalog wiring (category, channels, trigger routing) for the
// three platform-alert entries. The audience resolver (`platformAdmins`) hits
// the DB so it isn't unit-tested here; the render smoke-test below proves the
// payload reads + brand link building don't throw.

const PLATFORM_IDS = [
  "platform.new_workspace",
  "platform.workspace_over_quota",
  "platform.workspace_signup_failed",
] as const;

const brand = {
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
};

function recipient(): ResolvedRecipient {
  return {
    userId: "admin-1",
    email: "admin@tulala.digital",
    displayName: "Admin",
    locale: "en",
    isPlatformAdmin: true,
    role: "platform_admin",
    dedupeId: "admin-1",
  };
}

test("catalog: the three Phase 10 platform entries are registered as platform_alerts", () => {
  for (const id of PLATFORM_IDS) {
    const entry = findCatalogEntryById(id);
    assert.ok(entry, `missing catalog entry ${id}`);
    assert.equal(entry!.category, "platform_alerts");
    assert.equal(entry!.required, false);
    assert.ok(entry!.email, `${id} should have an email config`);
  }
});

test("catalog: platform entries declare the spec's channels", () => {
  assert.deepEqual(findCatalogEntryById("platform.new_workspace")!.defaultChannels, [
    "email",
    "in_app",
  ]);
  assert.deepEqual(findCatalogEntryById("platform.workspace_over_quota")!.defaultChannels, [
    "email",
  ]);
  assert.deepEqual(findCatalogEntryById("platform.workspace_signup_failed")!.defaultChannels, [
    "email",
  ]);
  // Only new_workspace gets an in-app card (spec §6.7).
  assert.ok(findCatalogEntryById("platform.new_workspace")!.in_app);
  assert.equal(findCatalogEntryById("platform.workspace_over_quota")!.in_app, undefined);
});

test("catalog: platform-alert triggers route to their entries (incl. aliases)", () => {
  const routes = (event: string, id: string) =>
    findCatalogEntries(event).some((e) => e.id === id);

  assert.ok(routes("platform.new_workspace", "platform.new_workspace"));
  assert.ok(routes("workspace.created", "platform.new_workspace"));
  assert.ok(routes("platform.workspace_over_quota", "platform.workspace_over_quota"));
  // signup-failed subscribes to the platform.* event AND the §6.6 alias.
  assert.ok(routes("platform.workspace_signup_failed", "platform.workspace_signup_failed"));
  assert.ok(routes("workspace.signup_failed", "platform.workspace_signup_failed"));
});

test("catalog: all entry ids are globally unique", () => {
  const ids = NOTIFICATION_CATALOG.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("catalog: platform email subject + render build without throwing", () => {
  const r = recipient();
  const payload = {
    workspaceName: "Acme Studio",
    ownerEmail: "owner@acme.test",
    planLabel: "Agency",
    metricLabel: "storage",
    usageLabel: "12 GB of 10 GB",
    attemptedEmail: "fail@acme.test",
    reason: "Stripe checkout abandoned",
  };
  for (const id of PLATFORM_IDS) {
    const entry = findCatalogEntryById(id)!;
    const event: NotificationEvent = { type: id, tenantId: null, eventId: `evt-${id}`, payload };
    assert.ok(entry.email!.subject(event, r).length > 0, `${id} subject empty`);
    assert.ok(entry.email!.render({ event, recipient: r, brand }), `${id} render falsy`);
  }
});

test("catalog: platform renders fall back gracefully on an empty payload", () => {
  const r = recipient();
  for (const id of PLATFORM_IDS) {
    const entry = findCatalogEntryById(id)!;
    const event: NotificationEvent = { type: id, tenantId: null, eventId: id, payload: {} };
    assert.ok(entry.email!.subject(event, r).length > 0);
    assert.ok(entry.email!.render({ event, recipient: r, brand }));
  }
});

// ─── Slice 15.1 — workspace / participant inquiry-engine email entries ────────
//
// Guards the catalog wiring (id, category, channels, trigger routing) for the
// six entries added in Slice 15.1, plus a render smoke-test proving the
// templates build for both a populated and an empty payload. The audience
// resolvers (assignedCoordinator / workspaceAdmins / clientAndRosterTalent)
// read the DB, so they're not unit-tested here.

const SLICE_15_1: Array<{ id: string; trigger: string; category: string }> = [
  {
    id: "coordinator.assigned.coordinator",
    trigger: "coordinator.assigned",
    category: "workspace_activity",
  },
  { id: "offer.declined.workspace", trigger: "offer.client_rejected", category: "offers" },
  { id: "offer.accepted.workspace", trigger: "approval.all_complete", category: "offers" },
  {
    id: "coordinator.assignment_timed_out.workspace",
    trigger: "coordinator.assignment_timed_out",
    category: "workspace_activity",
  },
  {
    id: "roster.talent_declined.coordinator",
    trigger: "roster.talent_declined",
    category: "roster_activity",
  },
  { id: "inquiry.cancelled.participants", trigger: "inquiry.cancelled", category: "inquiry_updates" },
];

function recipientWithRole(role: ResolvedRecipient["role"]): ResolvedRecipient {
  return {
    userId: "user-1",
    email: "person@tulala.digital",
    displayName: "Giulia Conti",
    locale: "en",
    isPlatformAdmin: false,
    role,
    dedupeId: "user-1",
  };
}

test("catalog: Slice 15.1 entries are email-only, optional, and have an email config", () => {
  for (const { id, category } of SLICE_15_1) {
    const entry = findCatalogEntryById(id);
    assert.ok(entry, `missing catalog entry ${id}`);
    assert.equal(entry!.category, category);
    assert.equal(entry!.required, false);
    assert.deepEqual(entry!.defaultChannels, ["email"]);
    assert.ok(entry!.email, `${id} should have an email config`);
    // In-app for these events is emitted by the engine's notifyUsers path;
    // routing in_app here too would double-notify.
    assert.equal(entry!.in_app, undefined, `${id} must not also route in_app`);
  }
});

test("catalog: Slice 15.1 triggers route to their entries", () => {
  for (const { id, trigger } of SLICE_15_1) {
    assert.ok(
      findCatalogEntries(trigger).some((e) => e.id === id),
      `${trigger} should route to ${id}`,
    );
  }
});

test("catalog: Slice 15.1 subject + render build without throwing", () => {
  const payload = {
    contactName: "Sofia's Wedding",
    eventDate: "14 Jun 2026",
    eventLocation: "Lake Como, Italy",
    offerTotal: "EUR 4,500.00",
    talentName: "Marco Rossi",
  };
  for (const { id, trigger } of SLICE_15_1) {
    const entry = findCatalogEntryById(id)!;
    const r = recipientWithRole(
      id === "inquiry.cancelled.participants" ? "client" : "workspace_member",
    );
    const event: NotificationEvent = {
      type: trigger,
      tenantId: "tenant-1",
      inquiryId: "inq-1",
      eventId: `evt-${id}`,
      payload,
    };
    assert.ok(entry.email!.subject(event, r).length > 0, `${id} subject empty`);
    assert.ok(entry.email!.render({ event, recipient: r, brand }), `${id} render falsy`);
  }
});

test("catalog: Slice 15.1 renders fall back gracefully on an empty payload", () => {
  for (const { id, trigger } of SLICE_15_1) {
    const entry = findCatalogEntryById(id)!;
    const r = recipientWithRole("workspace_member");
    const event: NotificationEvent = {
      type: trigger,
      tenantId: "tenant-1",
      inquiryId: "inq-1",
      eventId: id,
      payload: {},
    };
    assert.ok(entry.email!.subject(event, r).length > 0);
    assert.ok(entry.email!.render({ event, recipient: r, brand }));
  }
});

test("catalog: inquiry.cancelled link points at the recipient's own surface", () => {
  const entry = findCatalogEntryById("inquiry.cancelled.participants")!;
  const event: NotificationEvent = {
    type: "inquiry.cancelled",
    tenantId: "tenant-1",
    inquiryId: "inq-42",
    eventId: "evt-cancel",
    payload: { contactName: "Sofia's Wedding" },
  };
  const clientEl = entry.email!.render({
    event,
    recipient: recipientWithRole("client"),
    brand,
  }) as ReactElement<{ inquiryUrl: string }>;
  const talentEl = entry.email!.render({
    event,
    recipient: recipientWithRole("talent"),
    brand,
  }) as ReactElement<{ inquiryUrl: string }>;
  assert.match(clientEl.props.inquiryUrl, /\/client\/inquiries\/inq-42$/);
  assert.match(talentEl.props.inquiryUrl, /\/talent\/inquiries\/inq-42$/);
});

// ─── Slice 15.3b — roster claim-invite + team-invite (§12 conversions) ────────
//
// These two replace direct sendEmail calls with dispatcher-routed email to an
// email-only (guest) recipient. Unlike the inquiry resolvers, the audience
// resolvers here read only the event payload (no DB), so they ARE unit-tested.

const SLICE_15_3: Array<{ id: string; trigger: string; category: string }> = [
  { id: "roster.claim_invite.talent", trigger: "roster.claim_invite_requested", category: "roster_activity" },
  { id: "workspace.team_invite.invitee", trigger: "workspace.team_invite_sent", category: "workspace_activity" },
];

test("catalog: Slice 15.3 invite entries are email-only, optional, no in_app", () => {
  for (const { id, category } of SLICE_15_3) {
    const entry = findCatalogEntryById(id);
    assert.ok(entry, `missing catalog entry ${id}`);
    assert.equal(entry!.category, category);
    assert.equal(entry!.required, false);
    assert.deepEqual(entry!.defaultChannels, ["email"]);
    assert.ok(entry!.email, `${id} should have an email config`);
    // Guests have no in-app surface; these must be email-only.
    assert.equal(entry!.in_app, undefined, `${id} must not route in_app`);
  }
});

test("catalog: Slice 15.3 triggers route to their entries", () => {
  for (const { id, trigger } of SLICE_15_3) {
    assert.ok(
      findCatalogEntries(trigger).some((e) => e.id === id),
      `${trigger} should route to ${id}`,
    );
  }
});

test("catalog: Slice 15.3 audience resolves the payload email as a guest", async () => {
  for (const { id } of SLICE_15_3) {
    const entry = findCatalogEntryById(id)!;
    const withEmail: NotificationEvent = {
      type: id,
      tenantId: "tenant-1",
      eventId: `evt-${id}`,
      payload: { inviteeEmail: "invitee@acme.test", inviteeName: "Tina Rossi" },
    };
    // ctx is unused by these payload-only resolvers.
    const members = await entry.resolveAudience(withEmail, {} as never);
    assert.equal(members.length, 1, `${id} should resolve one recipient`);
    assert.equal(members[0]!.kind, "guest");
    assert.equal(
      members[0]!.kind === "guest" ? members[0]!.email : null,
      "invitee@acme.test",
    );

    // No email on the payload → no recipient (defensive, never throws).
    const noEmail: NotificationEvent = { type: id, tenantId: "t", eventId: id, payload: {} };
    assert.deepEqual(await entry.resolveAudience(noEmail, {} as never), []);
  }
});

test("catalog: claim-invite resolves an absolute redeem link + reminder subject", () => {
  const entry = findCatalogEntryById("roster.claim_invite.talent")!;
  const recip: ResolvedRecipient = {
    userId: null,
    email: "tina@acme.test",
    displayName: "Tina Rossi",
    locale: "en",
    isPlatformAdmin: false,
    role: "talent",
    dedupeId: "guest:tina@acme.test",
  };

  // Token-based resend: carries redeemPath + expiry + isResend.
  const resend: NotificationEvent = {
    type: "roster.claim_invite_requested",
    tenantId: "tenant-1",
    eventId: "talent-claim:abc",
    payload: {
      workspaceName: "Impronta Models",
      inviteeEmail: "tina@acme.test",
      redeemPath: "/register?invitation=abc",
      expiresAtIso: "2026-06-05T00:00:00.000Z",
      isResend: true,
    },
  };
  assert.match(entry.email!.subject(resend, recip), /^Reminder · /);
  const el = entry.email!.render({ event: resend, recipient: recip, brand }) as ReactElement<{
    redeemUrl: string;
    expiresLabel?: string;
  }>;
  assert.equal(el.props.redeemUrl, "https://tulala.digital/register?invitation=abc");
  assert.ok(el.props.expiresLabel, "resend should carry an expiry label");

  // Roster-add path: no token, defaults to /get-started, no expiry line.
  const initial: NotificationEvent = {
    type: "roster.claim_invite_requested",
    tenantId: "tenant-1",
    eventId: "roster-claim:xyz",
    payload: { workspaceName: "Impronta Models", inviteeEmail: "tina@acme.test" },
  };
  assert.doesNotMatch(entry.email!.subject(initial, recip), /^Reminder · /);
  const el2 = entry.email!.render({ event: initial, recipient: recip, brand }) as ReactElement<{
    redeemUrl: string;
    expiresLabel?: string;
  }>;
  assert.equal(el2.props.redeemUrl, "https://tulala.digital/get-started");
  assert.equal(el2.props.expiresLabel, undefined);
});

test("catalog: team-invite renders the redeem path + role on the branded host", () => {
  const entry = findCatalogEntryById("workspace.team_invite.invitee")!;
  const recip: ResolvedRecipient = {
    userId: null,
    email: "newhire@acme.test",
    displayName: null,
    locale: "en",
    isPlatformAdmin: false,
    role: "guest",
    dedupeId: "guest:newhire@acme.test",
  };
  const event: NotificationEvent = {
    type: "workspace.team_invite_sent",
    tenantId: "tenant-1",
    eventId: "team-invite:tok-1",
    payload: {
      inviterName: "Giulia Conti",
      workspaceName: "Impronta Models",
      roleLabel: "Manager",
      inviteeEmail: "newhire@acme.test",
      redeemPath: "/team-invite/tok-1",
      expiresAtIso: "2026-06-05T00:00:00.000Z",
    },
  };
  assert.ok(entry.email!.subject(event, recip).length > 0);
  const el = entry.email!.render({ event, recipient: recip, brand }) as ReactElement<{
    redeemUrl: string;
    roleLabel: string;
    expiresLabel: string;
  }>;
  assert.equal(el.props.redeemUrl, "https://tulala.digital/team-invite/tok-1");
  assert.equal(el.props.roleLabel, "Manager");
  assert.ok(el.props.expiresLabel.length > 0);
});

test("catalog: Slice 15.3 renders fall back gracefully on an empty payload", () => {
  const recip: ResolvedRecipient = {
    userId: null,
    email: "x@acme.test",
    displayName: null,
    locale: "en",
    isPlatformAdmin: false,
    role: "guest",
    dedupeId: "guest:x@acme.test",
  };
  for (const { id, trigger } of SLICE_15_3) {
    const entry = findCatalogEntryById(id)!;
    const event: NotificationEvent = { type: trigger, tenantId: "t", eventId: id, payload: {} };
    assert.ok(entry.email!.subject(event, recip).length > 0, `${id} subject empty`);
    assert.ok(entry.email!.render({ event, recipient: recip, brand }), `${id} render falsy`);
  }
});
