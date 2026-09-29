import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localiseSeededDesignLabels } from "./design-label-locale";

const tree = [
  {
    id: "c",
    kind: "container",
    props: {},
    children: [
      { id: "h", kind: "heading", props: { text: "Recent work", level: 2 } },
      { id: "e", kind: "heading", props: { text: "Mi trabajo", level: 2 } },
      { id: "b", kind: "button", props: { label: "Ask a question", href: "#talent-ask" } },
      { id: "s", kind: "services_catalog", props: { eyebrow: "The menu", title: "Services {i}and prices{/i}" } },
    ],
  },
] as unknown as BuilderNode[];

test("es: seeded labels localise, talent-edited text is untouched", () => {
  const out = JSON.stringify(localiseSeededDesignLabels(tree, "es-MX"));
  for (const s of ["Trabajo reciente", "Mi trabajo", "Hacer una pregunta", "El menú", "Servicios {i}y precios{/i}"]) {
    assert.ok(out.includes(s), s);
  }
  assert.ok(!out.includes("Recent work"));
});

test("en: tree returned unchanged", () => {
  assert.equal(localiseSeededDesignLabels(tree, "en"), tree);
});

test("Maison v2 hero primary follows the booking mode (EN + ES)", () => {
  const one = [
    { id: "b", kind: "button", props: { label: "Reserve a time", href: "#services" } },
    { id: "a", kind: "button", props: { label: "Ask", href: "#ask" } },
  ] as unknown as BuilderNode[];
  const label = (t: BuilderNode[], i: number) => (t[i]!.props as { label: string }).label;
  assert.equal(label(localiseSeededDesignLabels(one, "es", "instant"), 0), "Reservar");
  assert.equal(label(localiseSeededDesignLabels(one, "en", "instant"), 0), "Book now");
  assert.equal(label(localiseSeededDesignLabels(one, "es", "request"), 0), "Solicitar cita");
  assert.equal(label(localiseSeededDesignLabels(one, "en", "inquiry"), 0), "Ask for a quote");
  assert.equal(label(localiseSeededDesignLabels(one, "es", null), 1), "Pregunta");
});

test("hydrated seeded labels with a token localise as patterns", async () => {
  const { localiseSeededDesignLabel } = await import("./design-label-locale");
  assert.equal(localiseSeededDesignLabel("Hello, I'm Alba", "es"), "Hola, soy Alba");
  assert.equal(localiseSeededDesignLabel("Hello, I'm Alba", "en"), "Hello, I'm Alba");
  assert.equal(localiseSeededDesignLabel("Before you come", "es"), "Antes de venir");
  assert.equal(localiseSeededDesignLabel("Menu and prices", "es"), "Menú y precios");
});
