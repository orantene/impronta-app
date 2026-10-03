/**
 * ServicesHome editor save: Save draft forces draft; Save changes on live
 * keeps published (Codex P1 on #2495).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  localizeOfferingSaveError,
  resolveOfferingEditorSaveStatus,
} from "./offering-editor-save";

const src = readFileSync(
  join(process.cwd(), "src/components/talent/services/ServicesHome.tsx"),
  "utf8",
);

test("ServicesHome uses resolveOfferingEditorSaveStatus (not blind draft)", () => {
  assert.match(src, /resolveOfferingEditorSaveStatus\(/);
  assert.doesNotMatch(
    src,
    /status:\s*publish\s*\?\s*"published"\s*:\s*"draft"/,
  );
  assert.doesNotMatch(
    src,
    /status:\s*publish\s*\?\s*"published"\s*:\s*next\.status/,
  );
});

test("Save draft forces draft for new / non-live rows", () => {
  assert.equal(
    resolveOfferingEditorSaveStatus({
      publish: false,
      offeringId: "",
      currentStatus: "published",
    }),
    "draft",
  );
  assert.equal(
    resolveOfferingEditorSaveStatus({
      publish: false,
      offeringId: "o1",
      currentStatus: "draft",
    }),
    "draft",
  );
});

test("Save changes on live preserves published", () => {
  assert.equal(
    resolveOfferingEditorSaveStatus({
      publish: false,
      offeringId: "o1",
      currentStatus: "published",
    }),
    "published",
  );
});

test("Publish always publishes", () => {
  assert.equal(
    resolveOfferingEditorSaveStatus({
      publish: true,
      offeringId: "",
      currentStatus: "draft",
    }),
    "published",
  );
});

test("Spanish save errors localize exact + title templates", () => {
  const dict: Record<string, string> = {
    "Server configuration error.": "Error de configuración del servidor.",
    "Give it a name (e.g. “60-min massage”).": "Ponle un nombre (p. ej. “Masaje de 60 min”).",
  };
  const t = (v: string) => dict[v] ?? v;
  const generic = "No se guardó.";

  assert.equal(
    localizeOfferingSaveError("Server configuration error.", {
      isSpanish: true,
      t,
      generic,
    }),
    "Error de configuración del servidor.",
  );
  assert.equal(
    localizeOfferingSaveError(
      "“Manicure Gel” needs a price — or switch it to “Contact for price.”",
      { isSpanish: true, t, generic },
    ),
    "“Manicure Gel” necesita un precio — o cámbialo a “Consultar precio.”",
  );
  assert.equal(
    localizeOfferingSaveError("Some unknown English blow-up", {
      isSpanish: true,
      t,
      generic,
    }),
    generic,
  );
  assert.equal(
    localizeOfferingSaveError("Some unknown English blow-up", {
      isSpanish: false,
      t,
      generic,
    }),
    "Some unknown English blow-up",
  );
});
