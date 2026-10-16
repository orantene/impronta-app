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
  it("ES adminSupport catalog has no unaccented words (TUL-602)", () => {
    const json = JSON.parse(readFileSync(join(WEB, "messages/es.json"), "utf8")) as {
      dashboard: { adminSupport: Record<string, unknown> };
    };
    const strings = Object.values(json.dashboard.adminSupport).filter(
      (v): v is string => typeof v === "string",
    );
    assert.ok(strings.length > 100);
    assert.deepEqual(strings.filter((s) => ES_BAD.test(s)), []);
    assert.doesNotMatch(esStrings().join("\n"), /\bTelefono\b/);
  });
  it("FR adminSupport has no unaccented words", () => {
    const strings = frStrings();
    assert.ok(strings.length > 100);
    const bad = strings.filter(([, v]) => FR_BAD.test(v)).map(([k, v]) => `${k}: ${v}`);
    assert.deepEqual(bad, []);
  });

  // TUL-1104: guest-corpus ES and the rest of the FR support areas.
  it("guest corpus ES block has no unaccented words", () => {
    const src = readFileSync(join(WEB, "src/lib/support/guest-corpus.ts"), "utf8");
    const es = src.slice(src.indexOf('if (locale === "es") {'), src.indexOf('slug: "sales-free-plan"', src.indexOf('sales-what-is-tulala')));
    const GUEST_ES_BAD =
      /\b(pagina|paginas|direccion|dias|Cuanto|Como|Donde|Que es|espanol|ingles|Mexico|pequena|esta entre|instalacion|calculo)\b/;
    assert.deepEqual(es.match(new RegExp(GUEST_ES_BAD.source, "g")) ?? [], []);
    assert.match(es, /¿Cuánto cuesta el plan gratis\?/);
    assert.match(es, /Soporte en español e inglés/);
    assert.match(es, /hoja de cálculo/);
  });
  it("FR platform support and guest chat carry their accents", () => {
    const json = JSON.parse(readFileSync(join(WEB, "messages/fr.json"), "utf8")) as {
      dashboard: { platform: { support: Record<string, unknown> } };
      public: { guestChat: Record<string, unknown> };
    };
    const FR_BAD2 =
      /\b(Reponses?|reponses?|predefinies|Resum\w+|precedents?|dernieres?|Resolus?|resoudre|Echecs|reseau|Repondre|repondre|telephone|deplacer|Invites|etes|pret|Envoye|reessayer|demarre|reservation|generalement|Approuve|Idees|Planifiee|Livree?|Refusee|Prevenir|equipes?)\b/;
    const all = [...Object.entries(json.dashboard.platform.support), ...Object.entries(json.public.guestChat)].filter(
      (e): e is [string, string] => typeof e[1] === "string",
    );
    assert.ok(all.length > 150);
    assert.deepEqual(all.filter(([, v]) => FR_BAD2.test(v)).map(([k, v]) => `${k}: ${v}`), []);
    assert.equal(json.dashboard.platform.support.reply, "Répondre");
    assert.equal(json.dashboard.platform.support.statusResolved, "Résolu");
    assert.equal(json.public.guestChat.stripBooked, "Réservé. Tout est prêt");
  });
});
