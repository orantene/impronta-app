/**
 * TUL-392 — talent Attention signals (theme update waiting, site needs
 * publishing): selection, copy, ids, and the drawer/bell row mapping.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/notifications/attention-signals.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTalentAttentionSignals,
  pickOpenThemeUpdates,
  pickSignalText,
} from "./attention-signals";
import {
  talentDrawerNotifs,
  withoutSignalledThemeRows,
} from "@/components/admin/shell/internal/talent-notification-rows";
import type { UserNotification } from "@/components/admin/shell/internal/data-bridge";

const rel = (design_slug: string, to_version: number, channel = "default", status = "published") => ({
  design_slug,
  to_version,
  channel,
  status,
});

test("pickOpenThemeUpdates keeps the newest published open-channel release above the pin", () => {
  const out = pickOpenThemeUpdates(
    [
      rel("maison", 3),
      rel("maison", 4),
      rel("maison", 5, "draft"),
      rel("maison", 6, "default", "scheduled"),
      rel("atelier", 2, "optin"),
      rel("old", 1),
    ],
    1,
    new Map([["maison", "Maison"]]),
  );
  assert.deepEqual(out, [
    { designSlug: "atelier", designTitle: "atelier", toVersion: 2 },
    { designSlug: "maison", designTitle: "Maison", toVersion: 4 },
  ]);
});

test("pickOpenThemeUpdates with no pin keeps every open release", () => {
  assert.equal(pickOpenThemeUpdates([rel("maison", 1)], null, new Map()).length, 1);
});

test("buildTalentAttentionSignals: one per theme update plus the site signal, ids carry state", () => {
  const signals = buildTalentAttentionSignals({
    themeUpdates: [{ designSlug: "maison", designTitle: "Maison", toVersion: 4 }],
    sitePublish: { draftRev: 12, firstPublish: false },
  });
  assert.deepEqual(
    signals.map((s) => [s.id, s.kind, s.targetDrawer]),
    [
      ["theme-update:maison:4", "theme-update", "theme-update"],
      ["site-publish:12", "site-publish", "site-publish"],
    ],
  );
  assert.equal(pickSignalText(signals[0]!.title, "es"), "Maison tiene una actualización");
  assert.equal(pickSignalText(signals[0]!.title, "en"), "Maison has an update");
  assert.equal(pickSignalText(signals[1]!.title, "es-AR"), "Tu sitio tiene cambios sin publicar");
});

test("buildTalentAttentionSignals: never-published site gets the first-publish copy; nothing pending = no signals", () => {
  const first = buildTalentAttentionSignals({
    themeUpdates: [],
    sitePublish: { draftRev: 1, firstPublish: true },
  });
  assert.equal(pickSignalText(first[0]!.title, "en"), "Your site is not live yet");
  assert.deepEqual(buildTalentAttentionSignals({ themeUpdates: [], sitePublish: null }), []);
});

const row = (id: string, targetDrawer: string | null, kind = "system"): UserNotification =>
  ({
    id,
    kind,
    surface: "talent",
    title: id,
    body: null,
    ts: "1h ago",
    createdAt: "2026-10-10T00:00:00Z",
    read: false,
    targetDrawer,
    targetPayload: null,
    originInquiryId: null,
  }) as unknown as UserNotification;

test("withoutSignalledThemeRows drops stored theme bells only when signals loaded", () => {
  const rows = [row("a", "theme-update"), row("b", "talent-inquiry")];
  assert.deepEqual(withoutSignalledThemeRows(rows, []).map((r) => r.id), ["b"]);
  assert.deepEqual(withoutSignalledThemeRows(rows, null).map((r) => r.id), ["a", "b"]);
});

test("talentDrawerNotifs: signals first as sticky action rows that link to the site page", () => {
  const signals = buildTalentAttentionSignals({
    themeUpdates: [{ designSlug: "maison", designTitle: "Maison", toVersion: 4 }],
    sitePublish: { draftRev: 3, firstPublish: false },
  });
  const out = talentDrawerNotifs([row("a", "theme-update"), row("b", null)], signals, "es", "/admin");
  assert.deepEqual(
    out.map((n) => n.id),
    ["signal-theme-update:maison:4", "signal-site-publish:3", "b"],
  );
  assert.equal(out[0]!.category, "action");
  assert.equal(out[0]!.sticky, true);
  assert.equal(out[0]!.title, "Maison tiene una actualización");
  assert.equal(out[0]!.target?.targetHref, "/talent/site?themeUpdate=open");
  assert.equal(out[1]!.target?.targetHref, "/talent/site");
});
