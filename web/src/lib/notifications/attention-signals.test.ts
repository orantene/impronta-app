/**
 * TUL-392 — talent Attention signal (site needs publishing): copy, ids, and the
 * drawer/bell row mapping.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/notifications/attention-signals.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTalentAttentionSignals, pickSignalText } from "./attention-signals";
import { talentDrawerNotifs } from "@/components/admin/shell/internal/talent-notification-rows";
import type { UserNotification } from "@/components/admin/shell/internal/data-bridge";

test("unpublished changes: one site-publish signal whose id carries the draft rev", () => {
  const signals = buildTalentAttentionSignals({ sitePublish: { draftRev: 12, firstPublish: false } });
  assert.deepEqual(
    signals.map((s) => [s.id, s.kind, s.targetDrawer]),
    [["site-publish:12", "site-publish", "site-publish"]],
  );
  assert.equal(pickSignalText(signals[0]!.title, "es-AR"), "Tu sitio tiene cambios sin publicar");
  assert.equal(pickSignalText(signals[0]!.title, "en"), "Your site has unpublished changes");
});

test("never-published site gets the first-publish copy; nothing pending = no signals", () => {
  const first = buildTalentAttentionSignals({ sitePublish: { draftRev: 1, firstPublish: true } });
  assert.equal(pickSignalText(first[0]!.title, "en"), "Your site is not live yet");
  assert.equal(pickSignalText(first[0]!.title, "es"), "Tu sitio aún no está publicado");
  assert.deepEqual(buildTalentAttentionSignals({ sitePublish: null }), []);
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

test("talentDrawerNotifs: signal first as a sticky action row to /talent/site; stored rows all kept", () => {
  const signals = buildTalentAttentionSignals({ sitePublish: { draftRev: 3, firstPublish: false } });
  const out = talentDrawerNotifs([row("a", "theme-update"), row("b", null)], signals, "es", "/admin");
  assert.deepEqual(out.map((n) => n.id), ["signal-site-publish:3", "a", "b"]);
  assert.equal(out[0]!.category, "action");
  assert.equal(out[0]!.sticky, true);
  assert.equal(out[0]!.title, "Tu sitio tiene cambios sin publicar");
  assert.equal(out[0]!.target?.targetHref, "/talent/site");
  assert.equal(out[1]!.target?.targetHref, "/talent/site?themeUpdate=open");
});

test("null signals: drawer shows the stored rows unchanged", () => {
  assert.deepEqual(talentDrawerNotifs([row("a", null)], null, "en", "/admin").map((n) => n.id), ["a"]);
});
