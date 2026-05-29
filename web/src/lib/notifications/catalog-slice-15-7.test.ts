import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReactElement } from "react";
import { findCatalogEntries, findCatalogEntryById } from "./catalog";
import { workspaceAdmins } from "./catalog-audiences";
import type { NotificationEvent, ResolvedRecipient } from "./types";

/**
 * Slice 15.7 — workspace.over_seat_limit (the last non-Stripe §6 entry).
 *
 * Split out of `catalog.test.ts` to keep that file under the 800-line cap (the
 * same sibling-extraction convention the catalog source modules use). Guards the
 * catalog wiring (id, category, channels, surface routing) and a render
 * smoke-test. The populated `workspaceAdmins` resolver is DB-backed (it reads
 * `agency_memberships` via the service role) and exercised at the integration
 * level; only its deterministic, DB-free guard branch is asserted here.
 */

const brand = {
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
};

function workspaceRecipient(): ResolvedRecipient {
  return {
    userId: "owner-1",
    email: "owner@tulala.digital",
    displayName: "Giulia Conti",
    locale: "en",
    isPlatformAdmin: false,
    role: "workspace_member",
    dedupeId: "owner-1",
  };
}

function seatEvent(payload: Record<string, unknown>): NotificationEvent {
  return {
    type: "workspace.over_seat_limit",
    tenantId: "tenant-1",
    eventId: "seat-limit:tenant-1:2026-05-28",
    payload,
  };
}

// ─── workspace.over_seat_limit (email + in_app, workspace surface) ─────────────
//
// Direct-dispatch from the usage-audit cron (NOT the engine notifyUsers path),
// so the single entry owns both email + in_app with no double-notify. Audience
// is the workspace owners/admins; the in-app bell routes to the admin surface
// and the CTA points at the account + billing page.

test("catalog: workspace.over_seat_limit is workspace_activity, email + in_app, workspace surface", () => {
  const entry = findCatalogEntryById("workspace.over_seat_limit");
  assert.ok(entry, "missing workspace.over_seat_limit");
  assert.equal(entry!.category, "workspace_activity");
  assert.equal(entry!.required, false);
  assert.deepEqual(entry!.defaultChannels, ["email", "in_app"]);
  assert.ok(entry!.email, "should have an email config");
  assert.ok(entry!.in_app, "should have an in_app config");
  assert.equal(entry!.in_app!.surface, "workspace");
  assert.equal(entry!.in_app!.kind, "system");
});

test("catalog: workspace.over_seat_limit trigger routes to exactly the one entry", () => {
  const ids = findCatalogEntries("workspace.over_seat_limit").map((e) => e.id);
  assert.deepEqual(ids, ["workspace.over_seat_limit"]);
});

test("catalog: workspace.over_seat_limit email CTA points at the account page + carries the overage", () => {
  const entry = findCatalogEntryById("workspace.over_seat_limit")!;
  const event = seatEvent({
    workspaceName: "Impronta Models",
    planLabel: "Studio",
    activeCount: 27,
    seatLimit: 25,
  });
  const r = workspaceRecipient();
  const el = entry.email!.render({ event, recipient: r, brand }) as ReactElement<{
    accountUrl: string;
    activeCount: number | null;
    seatLimit: number | null;
    workspaceName: string | null;
    planLabel: string | null;
    recipientName: string | null;
  }>;
  assert.match(el.props.accountUrl, /\/admin\/account$/, "CTA → account page");
  assert.equal(el.props.activeCount, 27, "active headcount passthrough");
  assert.equal(el.props.seatLimit, 25, "seat limit passthrough");
  assert.equal(el.props.workspaceName, "Impronta Models");
  assert.equal(el.props.planLabel, "Studio");
  // In-app bell names the overage when both numbers are present.
  assert.match(entry.in_app!.title(event, r), /plan limit/i);
  const body = entry.in_app!.body?.(event, r) ?? "";
  assert.match(body, /27/);
  assert.match(body, /25/);
});

test("catalog: workspace.over_seat_limit renders + bells fall back gracefully on an empty payload", () => {
  const entry = findCatalogEntryById("workspace.over_seat_limit")!;
  const r = workspaceRecipient();
  const event = seatEvent({});
  assert.ok(entry.email!.subject(event, r).length > 0, "subject empty");
  const el = entry.email!.render({ event, recipient: r, brand }) as ReactElement<{
    activeCount: number | null;
    seatLimit: number | null;
  }>;
  // Non-numeric payload → null props (template hides the FieldTable rows), never NaN.
  assert.equal(el.props.activeCount, null, "no NaN for missing headcount");
  assert.equal(el.props.seatLimit, null, "no NaN for missing limit");
  assert.ok(entry.in_app!.title(event, r).length > 0, "in_app title empty");
  assert.ok((entry.in_app!.body?.(event, r) ?? "").length > 0, "in_app body empty");
});

test("catalog: workspace.over_seat_limit audience returns [] without a tenant scope (guard)", async () => {
  const noTenant: NotificationEvent = {
    type: "workspace.over_seat_limit",
    tenantId: null,
    eventId: "seat-limit:guard",
    payload: { activeCount: 27, seatLimit: 25 },
  };
  // Missing tenantId → no audience (deterministic, DB-free guard branch).
  assert.deepEqual(await workspaceAdmins(noTenant, {} as never), []);
});
