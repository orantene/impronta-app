/**
 * FORMS-3 — the renderer must never offer an upload it cannot keep.
 *
 * The bug this feature closes was not "files aren't supported"; it was that
 * the form ASKED for a file, said thank you, and dropped it. So the honest
 * negative cases are worth as much test weight as the positive one, which
 * lives beside the other section-render assertions in
 * `sections/node-presentation-render.test.ts`.
 *
 * Uploads are real only on the lane that can store them: our own endpoint,
 * over POST, recording a cms_form_submissions row. These two cases pin the
 * ways that lane is not in play.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { ContactFormComponent } from "./Component";
import type { ContactFormV1 } from "./schema";

function baseProps(over: Partial<ContactFormV1>): ContactFormV1 {
  return {
    action: "internal",
    method: "POST",
    fields: [{ name: "brief", label: "Brief", type: "file", required: false }],
    submitLabel: "Send",
    honeypot: "website",
    successMessage: "Thanks!",
    variant: "card",
    captcha: "none",
    presentation: {},
    ...over,
  } as ContactFormV1;
}

test("FORMS-3: a form that cannot store a file says so instead of offering one", () => {
  // No sectionId, so `useInternal` is false and the form posts somewhere we do
  // not control. Rendering an upload control here would repeat the original
  // bug: take the file, report success, discard the bytes.
  const html = renderToStaticMarkup(
    createElement(ContactFormComponent, {
      props: baseProps({ action: "https://formspree.io/f/abc" }),
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );
  assert.doesNotMatch(html, /type="file"/);
  assert.doesNotMatch(html, /enctype/i);
  assert.match(html, /data-attachment-unavailable/);
});

test("FORMS-3: inquiry-routing forms do not offer an upload they cannot keep", () => {
  // routingMode "inquiry" replaces the cms_form_submissions row with an
  // inquiry, so there is no submission for an attachment to belong to. The
  // submit route refuses a file posted to such a form for the same reason.
  const html = renderToStaticMarkup(
    createElement(ContactFormComponent, {
      props: baseProps({ routingMode: "inquiry" }),
      sectionId: "00000000-0000-0000-0000-0000000000aa",
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );
  assert.doesNotMatch(html, /type="file"/);
  assert.match(html, /data-attachment-unavailable/);
});

test("FORMS-3: a GET form never renders an upload control", () => {
  // A GET submission cannot carry a body, so the file would be dropped by the
  // browser before the request even left.
  const html = renderToStaticMarkup(
    createElement(ContactFormComponent, {
      props: baseProps({ action: "https://example.test/f", method: "GET" }),
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );
  assert.doesNotMatch(html, /type="file"/);
  assert.match(html, /data-attachment-unavailable/);
});
