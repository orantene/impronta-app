import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyNestedI18nOverlay, isNestedOverlayKey } from "./nested-i18n";

const CHAIN = ["es", "en"] as const;
const apply = <T,>(tree: T, locale = "es") =>
  applyNestedI18nOverlay(tree, locale, "en", CHAIN);

/** The real shape that regressed: the contact form's field array. */
const formNode = () => ({
  id: "rb-contact-form",
  kind: "form",
  props: {
    fields: [
      { name: "name", label: "Name", placeholder: "Your name" },
      { name: "brief", label: "What are you booking?" },
    ],
  },
  i18n: {
    es: {
      "fields.0.label": "Nombre",
      "fields.0.placeholder": "Tu nombre",
      "fields.1.label": "¿Qué quieres reservar?",
    },
  },
});

describe("applyNestedI18nOverlay", () => {
  it("translates nested form-field labels and placeholders", () => {
    const out = apply(formNode()) as ReturnType<typeof formNode>;
    assert.equal(out.props.fields[0].label, "Nombre");
    assert.equal(out.props.fields[0].placeholder, "Tu nombre");
    assert.equal(out.props.fields[1].label, "¿Qué quieres reservar?");
  });

  it("leaves the default locale byte-identical", () => {
    const input = formNode();
    const out = applyNestedI18nOverlay(input, "en", "en", ["en", "es"]);
    assert.equal(out, input);
  });

  it("translates a nested object prop (requestCta.label)", () => {
    const node = {
      kind: "section",
      props: { requestCta: { href: "/contact", label: "Request" } },
      i18n: { es: { "requestCta.label": "Solicitar" } },
    };
    const out = apply(node) as typeof node;
    assert.equal(out.props.requestCta.label, "Solicitar");
    assert.equal(out.props.requestCta.href, "/contact", "href untouched");
  });

  it("does not mutate the input tree", () => {
    const input = formNode();
    apply(input);
    assert.equal(input.props.fields[0].label, "Name");
  });

  it("recurses into children", () => {
    const tree = [
      {
        kind: "container",
        props: {},
        children: [
          {
            kind: "form",
            props: { fields: [{ label: "Name" }] },
            i18n: { es: { "fields.0.label": "Nombre" } },
          },
        ],
      },
    ];
    const out = apply(tree) as typeof tree;
    assert.equal(out[0].children[0].props.fields[0].label, "Nombre");
  });

  it("SKIPS a stale path instead of creating structure", () => {
    const node = {
      kind: "form",
      props: { fields: [{ label: "Name" }] },
      i18n: { es: { "fields.7.label": "Fantasma", "nope.deep.key": "x" } },
    };
    const out = apply(node) as typeof node;
    assert.equal(out.props.fields.length, 1);
    assert.equal(out.props.fields[0].label, "Name");
    assert.ok(!("nope" in out.props));
  });

  it("falls back through the chain when the locale has no value", () => {
    const node = {
      kind: "form",
      props: { fields: [{ label: "Name" }] },
      i18n: { es: { "fields.0.label": "Nombre" } },
    };
    // fr → chain [fr, en]: no fr overlay, so the base (en) copy renders.
    const out = applyNestedI18nOverlay(node, "fr", "en", ["fr", "en"]) as typeof node;
    assert.equal(out.props.fields[0].label, "Name");
  });

  it("ignores blank overlay values rather than blanking the UI", () => {
    const node = {
      kind: "form",
      props: { fields: [{ label: "Name" }] },
      i18n: { es: { "fields.0.label": "   " } },
    };
    const out = apply(node) as typeof node;
    assert.equal(out.props.fields[0].label, "Name");
  });

  it("leaves TOP-LEVEL keys to the renderer (only dotted keys applied here)", () => {
    const node = {
      kind: "heading",
      props: { text: "Hello" },
      i18n: { es: { text: "Hola" } },
    };
    const out = apply(node) as typeof node;
    assert.equal(out.props.text, "Hello");
  });

  it("tolerates nodes with no overlay, no props, and non-object input", () => {
    assert.deepEqual(apply([{ kind: "heading", props: { text: "x" } }]), [
      { kind: "heading", props: { text: "x" } },
    ]);
    assert.equal(apply(null), null);
    assert.equal(apply("str"), "str");
  });

  it("isNestedOverlayKey distinguishes dotted paths", () => {
    assert.equal(isNestedOverlayKey("fields.0.label"), true);
    assert.equal(isNestedOverlayKey("text"), false);
  });
});
