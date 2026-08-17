/**
 * Wiring guards — the mapping helpers are useless if no render path calls them.
 *
 * Captcha has burned this project before precisely because it renders through
 * MORE THAN ONE call site (2026-08-16, improntamodels.com: the curated
 * `contact_form` section and the freeform `form` node are separate renderers
 * with duplicated markup, and only one of them was fixed). So both are pinned
 * here, in one file, side by side. If a third render path appears, it belongs
 * in this list too.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { ContactFormComponent } from "@/lib/site-admin/sections/contact_form/Component";
import { MapOverlayComponent } from "@/lib/site-admin/sections/map_overlay/Component";

// ─── render path 1 · the freeform `form` builder node ─────────────────────────

const formNode: BuilderNode = {
  id: "form-1",
  kind: "form",
  props: {
    sectionId: "11111111-2222-3333-4444-555555555555",
    fields: [{ id: "send", type: "submit", name: "send", label: "Send" }],
  },
} as unknown as BuilderNode;

function renderFormNode(
  provider: "hcaptcha" | "turnstile",
  visitorLocale: string | undefined,
): string {
  return renderToStaticMarkup(
    renderBuilderNodes([formNode], {
      mode: "freeform",
      includeRendererStyles: false,
      captcha: { provider, siteKey: "key-1" },
      visitorLocale,
    }) as ReactElement,
  );
}

test("form node · hCaptcha carries data-hl for the page locale", () => {
  assert.match(renderFormNode("hcaptcha", "es"), /data-hl="es"/);
  assert.match(renderFormNode("hcaptcha", "en"), /data-hl="en"/);
});

test("form node · Turnstile carries data-language for the page locale", () => {
  assert.match(renderFormNode("turnstile", "es"), /data-language="es"/);
});

test("form node · no locale → no language attribute at all", () => {
  // Provider default, never an empty or invented tag.
  const html = renderFormNode("hcaptcha", undefined);
  assert.ok(html.includes("h-captcha"), "widget must still render");
  assert.ok(!html.includes("data-hl"), "must not emit an empty data-hl");
});

test("form node · an unmappable locale emits no language attribute", () => {
  assert.ok(!renderFormNode("turnstile", "klingon").includes("data-language"));
});

// ─── render path 2 · the curated `contact_form` section ───────────────────────

function renderContactForm(
  provider: "hcaptcha" | "turnstile",
  locale: string,
): string {
  return renderToStaticMarkup(
    ContactFormComponent({
      props: {
        headline: "Contact",
        fields: [{ id: "email", type: "email", name: "email", label: "Email" }],
        submitLabel: "Send",
        action: "internal",
        method: "post",
        captcha: provider,
      },
      tenantId: "tenant-1",
      locale,
      preview: false,
      sectionId: "22222222-3333-4444-5555-666666666666",
      captcha: { provider, siteKey: "key-1" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test shape
    } as any) as ReactElement,
  );
}

test("contact_form section · both providers get the section locale, not the browser", () => {
  assert.match(renderContactForm("hcaptcha", "es"), /data-hl="es"/);
  assert.match(renderContactForm("turnstile", "es"), /data-language="es"/);
});

test("contact_form section · a garbage locale emits no language attribute", () => {
  const html = renderContactForm("hcaptcha", "not-a-locale");
  assert.ok(html.includes("h-captcha"), "widget must still render");
  assert.ok(!html.includes("data-hl"));
});

// ─── render path 3 · the `map_overlay` section iframe ─────────────────────────

function renderMapOverlay(mapEmbedUrl: string, locale: string): string {
  return renderToStaticMarkup(
    MapOverlayComponent({
      props: {
        headline: "Find us",
        mapEmbedUrl,
        card: { title: "Studio", address: "", hours: "", body: "" },
        side: "left",
        ratio: "16 / 9",
      },
      tenantId: "tenant-1",
      locale,
      preview: false,
      sectionId: "33333333-4444-5555-6666-777777777777",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test shape
    } as any) as ReactElement,
  );
}

test("map_overlay · hl is added to the operator's embed URL", () => {
  const html = renderMapOverlay("https://www.google.com/maps/embed?pb=demo", "es");
  assert.ok(html.includes("hl=es-419"), "map iframe must carry hl");
  assert.ok(html.includes("pb=demo"), "the operator's own params must survive");
});

test("map_overlay · an operator URL that already sets hl is not overruled", () => {
  const html = renderMapOverlay("https://www.google.com/maps/embed?pb=demo&hl=fr", "es");
  assert.ok(html.includes("hl=fr"));
  assert.ok(!html.includes("es-419"), "must not append a second hl");
});
