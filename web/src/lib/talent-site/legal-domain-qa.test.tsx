/** Legal/domain QA fixes: banner page locale, socket launcher clearance, ES domain copy. */
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { pageLocaleOverride } from "@/components/analytics/analytics-consent-banner";
import { TalentSiteSocket, SOCKET_LAUNCHER_CLEARANCE_CSS } from "@/components/talent-site/talent-site-socket";
import { buildSocketModel } from "./footer-socket";
import { DOMAIN_ERRORS_ES_TEXT } from "@/components/admin/shell/internal/dashboard-i18n-domain-errors";
import { RAIL_ES_TEXT } from "@/components/admin/shell/internal/dashboard-i18n-rail";

function sock(locale: string) {
  return buildSocketModel({
    locale,
    publicPathPrefix: "",
    consentTooling: true,
    showCredit: true,
    whitelabel: false,
    supportedLocales: [locale],
  } as Parameters<typeof buildSocketModel>[0]);
}

test("socket marks the locale the site rendered in", () => {
  const html = renderToStaticMarkup(<TalentSiteSocket model={sock("es")} />);
  assert.match(html, /data-site-locale="es"/);
});

test("banner follows the page marker, else the root locale", () => {
  const root = { querySelector: () => ({ getAttribute: () => "es" }) } as unknown as ParentNode;
  assert.equal(pageLocaleOverride(root), "es");
  const none = { querySelector: () => null } as unknown as ParentNode;
  assert.equal(pageLocaleOverride(none), null);
});

test("socket clears the desktop guest-chat launcher", () => {
  assert.match(SOCKET_LAUNCHER_CLEARANCE_CSS, /min-width:768px/);
  assert.match(SOCKET_LAUNCHER_CLEARANCE_CSS, /194px/);
  assert.match(renderToStaticMarkup(<TalentSiteSocket model={sock("en")} clearDock={false} />), /data-guest-chat-launcher/);
});

test("domain drawer strings are in the Spanish dictionary", () => {
  assert.equal(RAIL_ES_TEXT["yourname.com"], "tunombre.com");
  assert.equal(RAIL_ES_TEXT["Download my data"], "Descargar mis datos");
  for (const [k, v] of Object.entries(DOMAIN_ERRORS_ES_TEXT)) assert.ok(v && v !== k || k === "x", k);
  assert.equal(
    RAIL_ES_TEXT["Domains need at least one dot, like example.com."],
    "El dominio necesita al menos un punto, como ejemplo.com.",
  );
});
