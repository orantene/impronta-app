import assert from "node:assert/strict";
import { test } from "node:test";

import { renderDeletionEmail, sendDeletionEmail } from "./deletion-email";

test("requested email: en and es, with the deletion date", () => {
  const en = renderDeletionEmail("requested", { locale: "en", scheduledFor: "2026-10-15T10:00:00.000Z" });
  assert.match(en.subject, /request to delete your account/);
  assert.match(en.html, /October 15, 2026/);
  const es = renderDeletionEmail("requested", { locale: "es", scheduledFor: "2026-10-15T10:00:00.000Z" });
  assert.match(es.subject, /solicitud para eliminar tu cuenta/);
  assert.match(es.html, /15 de octubre de 2026/);
});

test("completed email: unknown language carries both, no em dashes anywhere", () => {
  const both = renderDeletionEmail("completed", { locale: "both" });
  assert.match(both.html, /has been deleted/);
  assert.match(both.html, /fue eliminada/);
  for (const m of [both, renderDeletionEmail("requested", { locale: "both" })]) {
    assert.ok(!m.subject.includes("—") && !m.html.includes("—"));
  }
});

test("sendDeletionEmail calls the sender with recipient, subject and html", async () => {
  const calls: Array<{ to: string; subject: string; html: string }> = [];
  const ok = await sendDeletionEmail("completed", { to: "a@b.com", locale: "es" }, async (m) => {
    calls.push(m);
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, "a@b.com");
  assert.equal(calls[0].subject, "Tu cuenta fue eliminada");
});

test("sendDeletionEmail is best effort: no recipient or a throwing sender never throws", async () => {
  assert.equal(await sendDeletionEmail("requested", { to: null, locale: "en" }, async () => assert.fail("no send")), false);
  assert.equal(
    await sendDeletionEmail("requested", { to: "a@b.com", locale: "en" }, async () => {
      throw new Error("boom");
    }),
    false,
  );
});
