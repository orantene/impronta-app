/**
 * TUL-1926 — the Personas (TalentPage) toolbar's "Team" drawer button was a
 * hardcoded English literal (`<GhostButton>Team</GhostButton>`) instead of
 * going through the dashboard translator, so it stayed "Team" even when the
 * rest of the toolbar ("Invitar", "Agregar talento", …) read in Spanish.
 *
 * Static, source-text guard (no React render / i18n runtime needed): asserts
 * the call site reads the catalog key, and that the key resolves to the
 * right string in both locales.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(here, "..", "..", "..", "..", "..", "..");

test("TUL-1926: the admin Personas toolbar's Team button reads the i18n catalog, not a literal", () => {
  const src = readFileSync(join(here, "TalentPage-1.tsx"), "utf8");
  assert.match(
    src,
    /<GhostButton onClick=\{\(\) => openDrawer\("team"\)\}>\{t\("admin\.roster\.list\.team"\)\}<\/GhostButton>/,
    "the Team drawer button must render t(\"admin.roster.list.team\"), not a hardcoded 'Team' literal",
  );
  assert.doesNotMatch(
    src,
    />Team<\/GhostButton>/,
    "no hardcoded English 'Team' literal should remain on the toolbar",
  );
});

test("TUL-1926: admin.roster.list.team resolves to 'Team' (en) / 'Equipo' (es)", () => {
  const en = JSON.parse(readFileSync(join(WEB_ROOT, "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(join(WEB_ROOT, "messages/es.json"), "utf8"));
  assert.equal(en.admin.roster.list.team, "Team");
  assert.equal(es.admin.roster.list.team, "Equipo");
});
