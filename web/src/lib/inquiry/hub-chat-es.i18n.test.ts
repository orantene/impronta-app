/**
 * TUL-518: hub `/t/<code>` chat chrome must ship Spanish for the labels QA
 * named (Inquire about / Talk / Talent & services / Yours / Write a reply).
 * A missing key would silently fall back to English on `?lang=es`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { chatItemsLabel } from "@/lib/words/chat-items-label";
import { resolveWords } from "@/lib/words/resolve";

function words(locale: "en" | "es") {
  return resolveWords({ presetId: "agency", terminologyId: null }, locale);
}

describe("hub chat Spanish chrome (TUL-518)", () => {
  it("Inquire about / Talk / Yours / Write a reply… differ in es", () => {
    const en = createTranslator("en");
    const es = createTranslator("es");
    assert.equal(
      interpolate(en("public.profileCta.inquireAbout"), { name: "Sofía" }),
      "Inquire about Sofía",
    );
    assert.equal(
      interpolate(es("public.profileCta.inquireAbout"), { name: "Sofía" }),
      "Consultar sobre Sofía",
    );
    assert.equal(en("public.guestChat.dockNavChat"), "Talk");
    assert.equal(es("public.guestChat.dockNavChat"), "Hablar");
    assert.equal(en("public.guestChat.dockNavProjects"), "Yours");
    assert.equal(es("public.guestChat.dockNavProjects"), "Mis citas");
    assert.equal(en("public.guestChat.composerReply"), "Write a reply…");
    assert.equal(es("public.guestChat.composerReply"), "Escribe una respuesta…");
  });

  it("Talent & services words label is Spanish when locale is es", () => {
    assert.equal(chatItemsLabel(words("en")), "Talent & services");
    assert.equal(chatItemsLabel(words("es")), "Talento y servicios");
  });
});
