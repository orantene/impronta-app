import test from "node:test";
import assert from "node:assert/strict";

import {
  hasContactChannel,
  hasContactEnrichment,
  shouldSeedContactPage,
} from "./contact-details-presence";

/**
 * D7's second condition, pinned: the test is "has real details to render", not
 * "row exists". If any of these invert, the seeder has rebuilt the
 * owner-rejected placeholder page with extra steps.
 */

test("an identity row that exists but is empty seeds NOTHING", () => {
  // The load-bearing case. Every workspace gets a row at signup, so keying on
  // the row's existence would publish an empty Contact page on every new site.
  const emptyRows = [
    {},
    { contact_email: "", contact_phone: "", whatsapp: "" },
    { contact_email: "   ", contact_phone: "\t", whatsapp: "\n" },
    { contact_email: null, contact_phone: null, whatsapp: null },
  ];
  for (const row of emptyRows) {
    assert.equal(shouldSeedContactPage(row), false);
  }
});

test("a missing row seeds nothing rather than throwing", () => {
  assert.equal(shouldSeedContactPage(null), false);
  assert.equal(shouldSeedContactPage(undefined), false);
});

test("any single real channel is enough", () => {
  assert.equal(shouldSeedContactPage({ contact_email: "hola@casarizo.mx" }), true);
  assert.equal(shouldSeedContactPage({ contact_phone: "+52 984 111 2233" }), true);
  assert.equal(shouldSeedContactPage({ whatsapp: "+52 984 111 2233" }), true);
});

test("enrichment alone does NOT justify a page", () => {
  // A page headed "Contact" whose only content is a city and an Instagram link
  // is a placeholder with decoration, and the nav promises a way to get in
  // touch that the page does not deliver.
  const enrichedButUnreachable = {
    address_city: "Tulum",
    address_country: "Mexico",
    service_area: "Riviera Maya",
    social_instagram: "https://instagram.com/casarizo",
  };
  assert.equal(hasContactEnrichment(enrichedButUnreachable), true);
  assert.equal(hasContactChannel(enrichedButUnreachable), false);
  assert.equal(shouldSeedContactPage(enrichedButUnreachable), false);
});

test("a public name counts for nothing", () => {
  // It is set from the signup form on effectively every workspace, so admitting
  // it would make this return true always and restore the rejected behaviour.
  assert.equal(
    shouldSeedContactPage({ contact_email: null } as Record<string, null>),
    false,
  );
  // Even alongside enrichment, still no channel, still no page.
  assert.equal(
    shouldSeedContactPage({ address_city: "Tulum", contact_email: "" }),
    false,
  );
});

test("a channel plus enrichment is the good case", () => {
  const real = {
    contact_email: "hola@casarizo.mx",
    contact_phone: "+52 984 111 2233",
    address_city: "Tulum",
    social_instagram: "https://instagram.com/casarizo",
  };
  assert.equal(shouldSeedContactPage(real), true);
  assert.equal(hasContactEnrichment(real), true);
});

test("non-string junk in the column cannot be mistaken for a value", () => {
  // The row comes from the database and a hand-edited or migrated value can be
  // anything. Only a non-blank string counts.
  for (const junk of [0, 1, true, {}, [], { a: 1 }]) {
    assert.equal(
      shouldSeedContactPage({ contact_email: junk as unknown as string }),
      false,
    );
  }
});

// ─── The page the seeder actually builds ─────────────────────────────────

test("the page renders only fields the operator supplied", async () => {
  const { buildContactPageTree } = await import("./onboard-contact-page");
  const tree = buildContactPageTree({
    contact_email: "hola@casarizo.mx",
    contact_phone: "   ",
    address_city: "Tulum",
  });
  const json = JSON.stringify(tree);

  assert.ok(json.includes("hola@casarizo.mx"), "the supplied email must render");
  assert.ok(json.includes("Tulum"), "the supplied city must render");
  // A blank field produces NO row rather than an empty "Phone: " line.
  assert.ok(!json.includes("Phone:"), "a blank phone must not render a label");
  assert.ok(!json.includes("WhatsApp:"), "an absent field must not render a label");
});

test("the page always offers a live way to start a conversation", async () => {
  const { buildContactPageTree } = await import("./onboard-contact-page");
  // Even the thinnest qualifying page carries the chat cue, so a contact page
  // built from one email can never be a dead end. `?inquiry=open` is
  // path-relative, so `prefixPublicHref` leaves it alone on every host shape.
  const json = JSON.stringify(buildContactPageTree({ contact_email: "a@b.mx" }));
  assert.ok(json.includes("?inquiry=open"));
  assert.ok(!json.includes('"/contact"'), "the page must not link to itself");
});
