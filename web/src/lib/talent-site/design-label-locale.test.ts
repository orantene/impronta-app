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
  for (const s of ["Trabajos recientes", "Mi trabajo", "Hacer una pregunta", "El menú", "Servicios {i}y precios{/i}"]) {
    assert.ok(out.includes(s), s);
  }
  assert.ok(!out.includes("Recent work"));
});

test("en: tree returned unchanged", () => {
  assert.equal(localiseSeededDesignLabels(tree, "en"), tree);
});
