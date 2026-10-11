/**
 * TUL-392 — the Attention signals reach the count, the bell and the drawer,
 * and never hit the server mark-read action (they are states, not rows).
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/notifications/attention-signals-wiring.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("signals reach the bridge and the Atención bubble, not Hoy's needs-reply count", () => {
  const src = read("../../app/(workspace)/talent/_talent-layout-inner.tsx");
  assert.match(src, /loadTalentAttentionSignals\(talentSelfProfile\.id\)/);
  assert.match(
    src,
    /attention: sanitizeShellCount\(\s*talentInboxSummary\?\.needsReply \?\? countTalentAwaitingInquiries\(talentInquiries\),/,
  );
  assert.match(src, /talentAttentionSignals,/);
  const bubble = read("../../components/admin/shell/internal/shell-count-bubbles.tsx");
  assert.match(bubble, /const signals = inWorkspace \? 0 : \(bridgeTalentAttentionSignals\?\.length \?\? 0\);/);
});

test("server loader is read-only and never throws", () => {
  const src = read("../talent-site/attention-signals.server.ts");
  assert.match(src, /import "server-only"/);
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
  assert.match(src, /catch/);
});

test("bell shows signals on the talent surface only, with no server mark-read", () => {
  const src = read("../../components/admin/shell/internal/notifications-hub.tsx");
  assert.match(src, /state\.surface === "talent" \? bridgeTalentAttentionSignals : null/);
  assert.match(src, /talentNotifsFromSignals\(talentSignals \?\? \[\]/);
  assert.doesNotMatch(src, /withoutSignalledThemeRows/);
});

test("talent drawer renders signals and skips the server for signal ids", () => {
  const src = read("../../components/admin/shell/internal/wave2.tsx");
  assert.match(src, /talentDrawerNotifs\(bridgeUserNotifications, bridgeTalentAttentionSignals, locale, adminBasePath\)/);
  assert.match(src, /if \(!isLive \|\| id\.startsWith\("signal-"\)\) return/);
  assert.match(src, /!n\.id\.startsWith\("signal-"\)/);
});

test("site-publish resolves to the talent site page", () => {
  const src = read("../../components/admin/shell/internal/notification-drawer-targets.ts");
  assert.match(src, /"site-publish": \{ kind: "page", surface: "talent", path: "\/talent\/site" \}/);
});
