import test from "node:test";
import assert from "node:assert/strict";

import { sectionNameForKey } from "@/lib/talent-site/history/draft-diff";
import { addBlockSummary, releaseVersionLabel } from "./copy";
import { placementOptions } from "./view";

test("F86: picker + add-block names are in the talent's language for every kit section", () => {
  const node = (layerLabel: string) => ({ id: layerLabel, kind: "container", props: { layerLabel } }) as never;
  const es: Record<string, string> = {
    Hero: "Portada",
    "Ticker and recent work": "Novedades y trabajos recientes",
    Menu: "Menú",
    Reviews: "Reseñas",
    About: "Sobre mí",
    Visit: "Tu visita",
    FAQ: "Preguntas frecuentes",
    "Before and after": "Antes y después",
    Aftercare: "Cuidados posteriores",
  };
  for (const [en, label] of Object.entries(es)) {
    const [opt] = placementOptions([node(en)]);
    assert.equal(opt!.label, en);
    assert.equal(opt!.labelEs, label);
  }
  assert.equal(addBlockSummary("Maison v2", { en: "Before and after", es: "Antes y después" }).es, "Agregaste el bloque Antes y después de Maison v2");
  assert.equal(sectionNameForKey("before_after", "es"), "Antes y después");
  assert.equal(sectionNameForKey("aftercare", "es"), "Cuidados posteriores");
});

test("F114/summary: release version label comes from the notes", () => {
  assert.equal(releaseVersionLabel({ en: "Maison v2 2.2: tighter headings." }), "2.2");
  assert.equal(releaseVersionLabel({ en: "", es: "Maison v2 2.1: un nuevo bloque." }), "2.1");
  assert.equal(releaseVersionLabel({ en: "Tighter headings." }), null);
});
