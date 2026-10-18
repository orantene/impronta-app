/**
 * TUL-1236: the booking sheet phone is "Teléfono / WhatsApp" (not "WhatsApp OPCIONAL") and the
 * who step carries an optional Notes box whose text rides on the brief even without a task.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { briefFromDetail } from "@/lib/talent/offering-task-brief";

import { CatalogWhoContact } from "./catalog-who-contact";

const base = {
  locale: "es", fallbackCountry: null, name: "", phone: "", email: "",
  setName: () => {}, setPhone: () => {}, setEmail: () => {},
  touched: false, nameValid: true, phoneValid: true, emailValid: true, askAttempted: false, chatPhoneValid: true,
};

test("ES phone label is Teléfono / WhatsApp with no WhatsApp OPCIONAL chip", () => {
  const html = renderToStaticMarkup(<CatalogWhoContact es {...base} />);
  assert.match(html, /Teléfono \/ WhatsApp/);
  assert.doesNotMatch(html, /WhatsApp <i>/);
  assert.doesNotMatch(html, /aria-label="WhatsApp"/);
  assert.match(html, /Opcional\. Para avisarte/);
});

test("EN phone label is Phone / WhatsApp", () => {
  const html = renderToStaticMarkup(<CatalogWhoContact es={false} {...base} locale="en" />);
  assert.match(html, /Phone \/ WhatsApp/);
  assert.match(html, /Optional\. If we need to reach you/);
});

test("Notes box renders when a setter is given and the note is not null", () => {
  const html = renderToStaticMarkup(<CatalogWhoContact es {...base} note="" setNote={() => {}} />);
  assert.match(html, /data-testid="cb-notes"/);
  assert.match(html, /Notas/);
});

test("Notes box is hidden for task sheets (note === null) and without a setter", () => {
  assert.doesNotMatch(renderToStaticMarkup(<CatalogWhoContact es {...base} note={null} setNote={() => {}} />), /cb-notes/);
  assert.doesNotMatch(renderToStaticMarkup(<CatalogWhoContact es {...base} />), /cb-notes/);
});

test("a sheet note rides on the brief without a task, and is dropped when keepNote is false", () => {
  assert.deepEqual(briefFromDetail({ note: "  Portón azul, tocar timbre  " }, true), { note: "Portón azul, tocar timbre" });
  assert.equal(briefFromDetail({ note: "hola" }, false), null);
  assert.equal(briefFromDetail({ note: "" }, true), null);
});

test("the sheet wires the notes box only when no task note exists", () => {
  const sheet = readFileSync(join(__dirname, "CatalogBookingSheet.tsx"), "utf8");
  assert.match(sheet, /note=\{detail\.task \? null : \(detail\.note \?\? ""\)\}/);
});

test("no em dashes in the contact copy", () => {
  const src = readFileSync(join(__dirname, "catalog-who-contact.tsx"), "utf8");
  assert.ok(!src.includes("—"));
});
