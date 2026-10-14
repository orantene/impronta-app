import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// TUL-620: support copy shipped without accents (ES "conversacion",
// "Telefono", "dias"; FR "echoue", "reessayez"). Scans the ES support panel
// copy and the FR adminSupport block for known unaccented spellings.

const WEB = join(__dirname, "..", "..", "..");

const ES_BAD =
  /\b(conversacion|telefono|dias|sesion|pagina|codigo|envio|venci[oó]|tambien|numero|facil)\b/i;
const FR_BAD =
  /\b(recents?|dernieres|resolus?|ecrire|ecrit|telephone|categorie|apres-midi|creer|reponses?|repond\w*|reessay\w+|echou\w+|envoye|numero|ete|probleme|verification|redaction|general|reservations?|developpeur|securite|ferme|ecran|arreter|journalise|idee|idees|editeur|medias|mise a jour|ou dans|est a|parler a|ecrire a|aider a|continuer a|toujours la|sommes la|livre|signale)\b/i;

function esStrings(): string[] {
  const src = readFileSync(join(WEB, "src/lib/marketing/support-copy.ts"), "utf8");
  const es = src.slice(src.indexOf("const es:"), src.indexOf("export function"));
  return [...es.matchAll(/:\s*\n?\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]);
}

function frStrings(): Array<[string, string]> {
  const json = JSON.parse(readFileSync(join(WEB, "messages/fr.json"), "utf8")) as {
    dashboard: { adminSupport: Record<string, unknown> };
  };
  return Object.entries(json.dashboard.adminSupport).filter(
    (e): e is [string, string] => typeof e[1] === "string",
  );
}

describe("support copy carries its accents (TUL-620)", () => {
  it("ES marketing support panel has no unaccented words", () => {
    const strings = esStrings();
    assert.ok(strings.length > 40);
    const bad = strings.filter((s) => ES_BAD.test(s) || /^Quieres /.test(s));
    assert.deepEqual(bad, []);
  });
  it("FR adminSupport has no unaccented words", () => {
    const strings = frStrings();
    assert.ok(strings.length > 100);
    const bad = strings.filter(([, v]) => FR_BAD.test(v)).map(([k, v]) => `${k}: ${v}`);
    assert.deepEqual(bad, []);
  });
});
