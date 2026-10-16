import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HeaderSiteLocales } from "./header-site-chrome";

test("TUL-793: the ?locale= switch link is nofollow, the clean prefixed link is not", () => {
  const html = renderToStaticMarkup(
    <HeaderSiteLocales
      locales={["es", "en"]}
      hrefs={{ es: "/servicio-corte-3fa91c2b?locale=es", en: "/en/servicio-corte-3fa91c2b" }}
      locale="en"
      attrs={{}}
    />,
  );
  assert.match(html, /href="\/servicio-corte-3fa91c2b\?locale=es"[^>]*rel="nofollow"|rel="nofollow"[^>]*href="\/servicio-corte-3fa91c2b\?locale=es"/);
  assert.doesNotMatch(html, /href="\/en\/servicio-corte-3fa91c2b"[^>]*rel=/);
});
