import assert from "node:assert/strict";
import { test } from "node:test";

import { themeUpdateCopy } from "@/lib/talent-site/theme-releases/manager/notify";

import { formatNotificationAge, localizeNotificationText } from "./notification-localize";

const now = new Date("2026-10-07T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

test("formatNotificationAge localizes via Intl in ES and EN", () => {
  const fiveDays = ago(5 * 86_400_000);
  assert.match(formatNotificationAge(fiveDays, "es", now), /5/);
  assert.doesNotMatch(formatNotificationAge(fiveDays, "es", now), /ago/);
  assert.match(formatNotificationAge(fiveDays, "en", now), /5/);
  assert.match(formatNotificationAge(ago(2 * 3_600_000), "es", now), /2/);
  assert.equal(formatNotificationAge("", "es", now), "");
  assert.equal(formatNotificationAge("not-a-date", "es", now), "");
});

test("formatNotificationAge falls back to a short date after a week", () => {
  const out = formatNotificationAge(ago(20 * 86_400_000), "es", now);
  assert.doesNotMatch(out, /hace|ago/);
});

test("localizeNotificationText translates catalog titles in ES, leaves EN and unknown text", () => {
  assert.equal(localizeNotificationText("You have an offer to review", "es"), "Tienes una oferta por revisar");
  assert.equal(localizeNotificationText("New message", "es"), "Mensaje nuevo");
  assert.equal(localizeNotificationText("You have an offer to review", "en"), "You have an offer to review");
  assert.equal(localizeNotificationText("Marta says hi", "es"), "Marta says hi");
  assert.equal(localizeNotificationText("New support ticket #42", "es"), "Nuevo ticket de soporte #42");
});

test("sdb-1011-01: a theme-update bell written in Spanish reads in English for an EN viewer, and back", () => {
  const es = themeUpdateCopy("Maison v2", "es");
  const en = themeUpdateCopy("Maison v2", "en");
  assert.equal(localizeNotificationText(es.title, "en"), en.title);
  assert.equal(localizeNotificationText(es.body, "en"), en.body);
  assert.equal(localizeNotificationText(en.title, "es"), es.title);
  assert.equal(localizeNotificationText(en.body, "es"), es.body);
  assert.equal(localizeNotificationText(es.title, "es"), es.title);
});
