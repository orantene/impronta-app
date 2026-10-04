import assert from "node:assert/strict";
import { test } from "node:test";

import { themeTemplateEditHref } from "./types";

test("themeTemplateEditHref points at the talent-designs route", () => {
  assert.equal(
    themeTemplateEditHref("folio"),
    "/platform/admin/builder-lab/talent-designs/folio/edit",
  );
});

test("themeTemplateEditHref keeps home implicit and encodes params", () => {
  assert.equal(
    themeTemplateEditHref("maison-v2", { tree: "shell", subject: "TAL-93020", look: "rose", lang: "es" }),
    "/platform/admin/builder-lab/talent-designs/maison-v2/edit?tree=shell&subject=TAL-93020&look=rose&lang=es",
  );
  assert.equal(
    themeTemplateEditHref("folio", { tree: "home", subject: "TAL-93011" }),
    "/platform/admin/builder-lab/talent-designs/folio/edit?subject=TAL-93011",
  );
});
