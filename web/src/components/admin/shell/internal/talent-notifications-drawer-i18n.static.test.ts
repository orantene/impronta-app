/**
 * TUL-389 FAIL (Grok PM, Jorgelina, ES): the talent notifications panel showed
 * "Notifications / Recent / Archive / Notification settings" in English. Every
 * chrome string of `TalentNotificationsDrawer` now reads a
 * `dashboard.talentNotifications.*` key with a Spanish translation.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/components/admin/shell/internal/talent-notifications-drawer-i18n.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createTranslator } from "@/i18n/messages";
import { NOTIF_CATEGORY_META } from "./talent-notification-rows";

const src = readFileSync(new URL("./wave2.tsx", import.meta.url), "utf8");
const drawer = src.slice(
  src.indexOf("const NOTIF_ROWS"),
  src.indexOf("export function TalentShareCardDrawer"),
);
const es = createTranslator("es");
const en = createTranslator("en");

test("drawer chrome has no hard-coded English labels", () => {
  for (const literal of [
    'title="Notifications"',
    ">Event<",
    "Notification settings\n",
    "Email + push per event\n",
    "oldest {oldestForCategory",
    'label: "New offer"',
  ]) {
    assert.ok(!drawer.includes(literal), `still hard-coded: ${literal}`);
  }
});

test("every drawer key resolves in English and is translated in Spanish", () => {
  const keys = new Set(drawer.match(/dashboard\.talentNotifications\.[A-Za-z]+/g) ?? []);
  for (const meta of Object.values(NOTIF_CATEGORY_META)) {
    keys.add(meta.label);
    keys.add(meta.hint);
  }
  assert.ok(keys.size >= 30, `expected the full key set, got ${keys.size}`);
  const sameInBoth = new Set([
    "dashboard.talentNotifications.colEmail",
    "dashboard.talentNotifications.colPush",
  ]);
  for (const key of keys) {
    assert.notEqual(en(key), key, `missing en: ${key}`);
    assert.notEqual(es(key), key, `missing es: ${key}`);
    if (!sameInBoth.has(key)) assert.notEqual(es(key), en(key), `untranslated es: ${key}`);
  }
});

test("Spanish panel reads Notificaciones / Recientes / Archivo / Ajustes", () => {
  assert.equal(es("dashboard.talentNotifications.title"), "Notificaciones");
  assert.equal(es("dashboard.talentNotifications.tabRecent"), "Recientes");
  assert.equal(es("dashboard.talentNotifications.tabArchive"), "Archivo");
  assert.equal(es("dashboard.talentNotifications.settingsTitle"), "Ajustes de notificaciones");
});
