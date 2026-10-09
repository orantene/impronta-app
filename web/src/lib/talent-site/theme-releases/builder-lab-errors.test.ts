import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { AUTHORED_GATE_COPY } from "../theme-catalog/authored-sync-rule";
import {
  BUILDER_LAB_ERROR_ES,
  BUILDER_LAB_ERROR_ES_EXTRA_KEYS,
  localizeBuilderLabError,
} from "./builder-lab-errors";

const WEB = process.cwd();
const read = (f: string) => readFileSync(join(WEB, f), "utf8");

/** Every file whose literal `error: "..."` strings reach a Builder Lab operator. */
const ERROR_SOURCES = [
  "src/app/(workspace)/platform/admin/builder-lab/themes/actions.ts",
  "src/app/(workspace)/platform/admin/builder-lab/themes/demo-rebuild-actions.ts",
  "src/app/(workspace)/platform/admin/builder-lab/talent-designs/publish-actions.ts",
  "src/app/(workspace)/platform/admin/builder-lab/looks/actions.ts",
  "src/lib/talent-site/theme-releases/manager/channel.ts",
  "src/lib/talent-site/theme-releases/manager/dry-run.ts",
  "src/lib/talent-site/theme-releases/manager/release-manager.server.ts",
  "src/lib/talent-site/theme-releases/manager/merge-site.server.ts",
  "src/lib/talent-site/theme-releases/release-design.server.ts",
  "src/lib/talent-site/theme-template/new-design.server.ts",
  "src/lib/talent-site/theme-catalog/authored-sync-rule.ts",
] as const;

/** Plain `error: "text"` literals, plus template literals with their `${...}` replaced by a sample. */
function literalErrors(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\berror: "([^"\n]+)"/g)) out.push(m[1]!);
  for (const m of src.matchAll(/\berror: `([^`\n]+)`/g)) {
    out.push(
      m[1]!.replace(/\$\{[^}]+\}/g, (e) =>
        /errors|length/.test(e)
          ? "3"
          : /channel/.test(e)
            ? "demos"
            : /version|catalogVersion|toVersion|to_version/.test(e)
              ? "5"
              : /displayName|talentProfileId|profileCode/.test(e)
                ? "TAL-93020"
                : "details",
      ),
    );
  }
  return out;
}

test("every operator-facing Builder Lab error literal has a Spanish translation (parity guard)", () => {
  const missing: string[] = [];
  let seen = 0;
  for (const f of ERROR_SOURCES) {
    for (const e of literalErrors(read(f))) {
      seen++;
      if (localizeBuilderLabError(e, "es") === e) missing.push(`${f}: ${e}`);
    }
  }
  assert.ok(seen >= 30, `expected to scan the action sources, found only ${seen} literals`);
  assert.deepEqual(missing, [], `these errors have no Spanish in builder-lab-errors.ts:\n${missing.join("\n")}`);
});

test("the table has no stale entries: every key is still used by an action source or is an allow-listed fallback", () => {
  const all = ERROR_SOURCES.map(read).join("\n");
  const extra = new Set<string>(BUILDER_LAB_ERROR_ES_EXTRA_KEYS);
  const unused = Object.keys(BUILDER_LAB_ERROR_ES).filter((k) => !extra.has(k) && !all.includes(k));
  assert.deepEqual(unused, []);
});

test("English is returned unchanged, Spanish prefers the server's errorEs, then the table, then patterns", () => {
  assert.equal(localizeBuilderLabError("Not signed in.", "en"), "Not signed in.");
  assert.equal(localizeBuilderLabError("Not signed in.", "es"), "No has iniciado sesión.");
  assert.equal(localizeBuilderLabError("Not signed in.", "es", "Texto del servidor"), "Texto del servidor");
  assert.equal(localizeBuilderLabError("Not signed in.", "es", "  "), "No has iniciado sesión.");
  assert.equal(localizeBuilderLabError("3 site(s) failed the dry run. Fix or rerun.", "es"), "3 sitio(s) fallaron en la prueba. Corrige o vuelve a probar.");
  assert.equal(localizeBuilderLabError("Move one step at a time: draft to the next channel.", "es"), "Avanza un paso a la vez: de draft al siguiente canal.");
  assert.equal(localizeBuilderLabError("Catalog is at v4, release targets v5.", "es"), "El catálogo está en la v4, la entrega apunta a la v5.");
  assert.equal(localizeBuilderLabError("Base build failed: a; b", "es"), "Falló la compilación base: a; b");
  assert.equal(
    localizeBuilderLabError("Hydration tokens unavailable for TAL-93020; refusing empty apply.", "es"),
    "Tokens de hidratación no disponibles para TAL-93020; se rechaza una aplicación vacía.",
  );
  assert.equal(
    localizeBuilderLabError("The catalog is already at v5; making v4 the default would move it backward. This release is superseded.", "es"),
    "El catálogo ya está en la v5; hacer predeterminada la v4 lo movería hacia atrás. Esta entrega quedó superada.",
  );
  assert.equal(
    localizeBuilderLabError("No snapshot for v5; run the catalog sync first.", "es"),
    "No hay captura para la v5; sincroniza el catálogo primero.",
  );
  assert.equal(localizeBuilderLabError("v5 payload is invalid: bad tree", "es"), "La carga de la v5 no es válida: bad tree");
  assert.equal(localizeBuilderLabError(AUTHORED_GATE_COPY.en, "es"), AUTHORED_GATE_COPY.es);
  assert.equal(localizeBuilderLabError("draft revision unknown", "es"), "revisión del borrador desconocida");
});

test("an unknown error is never hidden: it falls back to the original text", () => {
  assert.equal(localizeBuilderLabError("TAL-93020: boom", "es"), "TAL-93020: boom");
});

test("the Spanish screens read their errors through the localizer", () => {
  for (const f of [
    "src/app/(workspace)/platform/admin/builder-lab/themes/[releaseId]/release-panel.tsx",
    "src/components/builder-lab/talent-factory/publish-design-button.tsx",
    "src/app/(workspace)/platform/admin/builder-lab/themes/demo-rebuild-panel.tsx",
    "src/components/builder-lab/talent-factory/save-as-new-design-dialog.tsx",
    "src/app/(workspace)/platform/admin/builder-lab/themes/stale-drafts-panel.tsx",
    "src/app/(workspace)/platform/admin/builder-lab/looks/look-import-panel.tsx",
  ]) {
    assert.match(read(f), /localizeBuilderLabError\(/, f);
  }
});

test("no Spanish translation uses an em dash (product copy rule)", () => {
  for (const v of Object.values(BUILDER_LAB_ERROR_ES)) assert.doesNotMatch(v, /—/);
  assert.doesNotMatch(AUTHORED_GATE_COPY.es, /—/);
});
