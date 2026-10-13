import assert from "node:assert/strict";
import { test } from "node:test";

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

test("sdb-1011-01: theme-update bells stored in either language render in the viewer's", () => {
  assert.equal(localizeNotificationText("Maison v2 tiene una actualización", "en"), "Maison v2 has an update");
  assert.equal(localizeNotificationText("Maison v2 has an update", "es"), "Maison v2 tiene una actualización");
  assert.equal(
    localizeNotificationText(
      "Mira qué hay de nuevo y pruébala en tu sitio antes de aplicarla. Tu contenido y tus cambios se conservan.",
      "en",
    ),
    "See what is new and preview it on your site before you apply it. Your content and your edits are kept.",
  );
  assert.equal(localizeNotificationText("Maison v2 has an update", "en"), "Maison v2 has an update");
});
