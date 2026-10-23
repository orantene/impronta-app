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

test("TUL-676: offer bells (title + body, stored in English) render in ES", () => {
  const t = (s: string) => localizeNotificationText(s, "es");
  assert.equal(t("Offer pending approval"), "Oferta pendiente de aprobación");
  assert.equal(
    t("MXN 300.00 for QA Guest Grok. Open the Offer tab to review and approve."),
    "MXN 300.00 para QA Guest Grok. Abre la pestaña Oferta para revisarla y aprobarla.",
  );
  assert.equal(
    t("MXN 300.00. Open the Offer tab to review and approve."),
    "MXN 300.00. Abre la pestaña Oferta para revisarla y aprobarla.",
  );
  assert.equal(
    t("An offer with your rate is ready. Open the Offer tab to review and approve."),
    "Una oferta con tu tarifa está lista. Abre la pestaña Oferta para revisarla y aprobarla.",
  );
  assert.equal(
    t("QA Guest Grok: MXN 300.00. Waiting on approvals."),
    "QA Guest Grok: MXN 300.00. Esperando aprobaciones.",
  );
  assert.equal(
    t("QA Guest Grok: offer sent. Waiting on approvals."),
    "QA Guest Grok: oferta enviada. Esperando aprobaciones.",
  );
  assert.equal(
    t("An offer was sent and is waiting on approvals."),
    "Se envió una oferta y está esperando aprobaciones.",
  );
  assert.equal(t("Offer pending approval"), "Oferta pendiente de aprobación");
  assert.equal(
    localizeNotificationText("MXN 300.00 for QA Guest Grok. Open the Offer tab to review and approve.", "en"),
    "MXN 300.00 for QA Guest Grok. Open the Offer tab to review and approve.",
  );
});

// TUL-721: the day-of reminder bell stayed English with a raw ISO date.
test("TUL-721: day-of reminder bells localize title and body, with a readable date", () => {
  assert.equal(localizeNotificationText("Your event is tomorrow", "es"), "Tu evento es mañana");
  assert.equal(localizeNotificationText("Your appointment is tomorrow", "es"), "Tu cita es mañana");
  assert.equal(localizeNotificationText("Your booking is tomorrow.", "es"), "Tu reserva es mañana.");
  const body = localizeNotificationText("Your booking on 2026-10-15 is tomorrow.", "es");
  assert.doesNotMatch(body, /2026-10-15|Your/);
  assert.match(body, /15 de octubre/);
  assert.equal(
    localizeNotificationText("Your booking on 2026-10-15 is tomorrow.", "en"),
    "Your booking on 2026-10-15 is tomorrow.",
  );
});

// TUL-391 (ES half): support-ticket bells stayed English in an ES dashboard.
test("TUL-391: support-ticket bells render in ES, subject text untouched", () => {
  const t = (s: string) => localizeNotificationText(s, "es");
  assert.equal(t("Resolved: QA- Batch4 ticket TUL-51"), "Resuelto: QA- Batch4 ticket TUL-51");
  assert.equal(t("Rate how it went if you have a moment."), "Cuéntanos cómo te fue si tienes un momento.");
  assert.equal(t("Ticket #12 needs you"), "El ticket #12 te necesita");
  assert.equal(t("Reply on #12"), "Respuesta en #12");
  assert.equal(t("Your ticket needs you"), "Tu ticket te necesita");
  assert.equal(t("Support replied to your ticket."), "Soporte respondió a tu ticket.");
  assert.equal(t("Tulala Support replied - Billing"), "Tulala Support respondió - Billing");
  assert.equal(localizeNotificationText("Your ticket needs you", "en"), "Your ticket needs you");
  assert.equal(t("Still need help on #12?"), "¿Sigues necesitando ayuda con #12?");
  assert.equal(t("A proposed fix on #12 expired"), "Venció una corrección propuesta en #12");
  assert.equal(t("Weekly support digest"), "Resumen semanal de soporte");
  assert.equal(localizeNotificationText("Resolved: QA ticket", "en"), "Resolved: QA ticket");
});

test("TUL-1928: roster and join-request bells render in Spanish for an ES viewer", () => {
  assert.equal(localizeNotificationText("Ana requested to join your roster", "es"), "Ana pidió unirse a tu lista");
  assert.equal(localizeNotificationText("You're on Studio Luz's roster", "es"), "Estás en la lista de Studio Luz");
  assert.equal(localizeNotificationText("You're now part of the team roster.", "es"), "Ya formas parte de la lista del equipo.");
  assert.equal(localizeNotificationText("Update on your roster request", "es"), "Novedades sobre tu solicitud para unirte a la lista");
  assert.equal(
    localizeNotificationText("Studio Luz isn't able to add you to their roster right now.", "es"),
    "Studio Luz no puede agregarte a su lista por ahora.",
  );
  assert.equal(localizeNotificationText("Your profile is approved", "es"), "Tu perfil fue aprobado");
  assert.equal(localizeNotificationText("Ana requested to join your roster", "en"), "Ana requested to join your roster");
});
