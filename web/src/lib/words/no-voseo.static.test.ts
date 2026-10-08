/**
 * Platform Spanish is Mexican tú, never Argentine voseo ("Elegí", "Tenés").
 * The booking sheet shipped voseo ("Elegí una fecha"), so this guard now covers
 * every source file with Spanish copy (the booking sheet, chat, dock, the talent
 * site, receipts, demo content), es.json and the industry presets.
 *
 * The list holds forms that are not ordinary Spanish in any other reading. First
 * person preterites that look the same ("compartí", "seguí") are left out on
 * purpose; the imperative reading is what ships in UI copy.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SRC = join(ROOT, "src");

/** vos imperatives and present forms, plus pronominal imperatives and vos itself. */
// JS `\b` is ASCII-only (it does not see "á" as a letter), so the edges are Unicode lookarounds.
const VOSEO = new RegExp(
  "(?<![\\p{L}])(" +
    [
      "Reservá", "Elegí", "Probá", "Enviá", "Escribí", "Completá", "Consultá", "Preguntá", "Revisá", "Guardá",
      "Dejá", "Mirá", "Chateá", "Escaneá", "Encontrá", "Contactá", "Mostrá", "Agregá", "Confirmá", "Pagá",
      "Tocá", "Seleccioná", "Ingresá", "Intentá", "Volvé", "Cerrá", "Abrí", "Subí", "Cargá", "Esperá", "Buscá",
      "Aceptá", "Continuá", "Editá", "Eliminá", "Borrá", "Cambiá", "Descargá", "Copiá", "Pegá", "Apretá", "Hacé",
      "Usá", "Pensá", "Mandá", "Pasá", "Llamá", "Entrá", "Vení", "Andá", "Decí", "Fijate", "Registrate", "Anotate",
      "Contame", "Escribime", "Avisame", "Decime", "Mandame", "Ayudame", "Dejame", "Avisanos", "Escribinos",
      "Llamanos", "Contanos", "Tenés", "Podés", "Querés", "Sabés", "Necesitás", "Encontrás", "Atendés", "Pagás",
      "Elegís", "Preferís", "Venís", "Salís", "Decís", "Hacés", "Sos",
    ].join("|") +
    ")(?![\\p{L}])|(?<![\\p{L}])[Vv]os(?![\\p{L}])(?! (?:êtes|avez|pouvez))",
  "iu",
);
/**
 * Voseo imperatives with an attached pronoun ("Revisala", "Mandame", "Abrilo").
 * The tú form carries a written accent on the stressed syllable ("Revísala",
 * "Mándame", "Ábrelo"), so a bare stem + vowel + pronoun is the voseo shape.
 * A generic suffix match would flag "sala", "pelo" and "tomate", so this is
 * built from the verbs UI copy actually uses: stem, then the voseo vowel.
 * "te" and "se" are left out as pronouns on purpose ("toma" + "te" is "tomate").
 */
const VOSEO_STEMS: ReadonlyArray<readonly [string, "a" | "e" | "i"]> = [
  ["revis", "a"], ["mand", "a"], ["envi", "a"], ["reenvi", "a"], ["mostr", "a"], ["avis", "a"], ["cont", "a"],
  ["llam", "a"], ["ayud", "a"], ["dej", "a"], ["guard", "a"], ["copi", "a"], ["pag", "a"], ["cerr", "a"],
  ["busc", "a"], ["carg", "a"], ["descarg", "a"], ["reserv", "a"], ["confirm", "a"], ["cancel", "a"],
  ["activ", "a"], ["desactiv", "a"], ["cobr", "a"], ["prob", "a"], ["edit", "a"], ["elimin", "a"],
  ["borr", "a"], ["agreg", "a"], ["vincul", "a"], ["conect", "a"], ["invit", "a"], ["public", "a"],
  ["aprob", "a"], ["rechaz", "a"], ["acept", "a"], ["verific", "a"], ["actualiz", "a"], ["us", "a"],
  ["mir", "a"], ["esper", "a"], ["complet", "a"], ["ingres", "a"], ["record", "a"], ["pregunt", "a"],
  ["eleg", "i"], ["escrib", "i"], ["abr", "i"], ["sub", "i"], ["dec", "i"], ["ped", "i"], ["corregi", "i"],
  ["segu", "i"], ["compart", "i"], ["añad", "i"], ["recib", "i"], ["viv", "i"],
];
// "mandala" is an ordinary word (a drawing), and "usanos" does not occur; keep the first out of the net.
const VOSEO_PRONOUN_OK = /^mandala$/i;
const VOSEO_ATTACHED = new RegExp(
  "(?<![\\p{L}])(?:" +
    VOSEO_STEMS.map(([stem, vowel]) => `${stem}${vowel}`).join("|") +
    ")(?:la|lo|las|los|me|nos|le|les)(?![\\p{L}])",
  "giu",
);

// "Sos" and "vos" are ordinary uppercase/English-or-code tokens in places; only flag them in Spanish prose.
const ONLY_IN_PROSE = /^(sos|vos)$/i;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== "no-voseo.static.test.ts") out.push(p);
  }
  return out;
}

/** Quoted or JSX string content that reads as Spanish prose around the match. */
function offenders(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(VOSEO_ATTACHED)) {
    if (VOSEO_PRONOUN_OK.test(m[0])) continue;
    const at = m.index ?? 0;
    hits.push(`${m[0]} … ${text.slice(Math.max(0, at - 40), at + 60).replace(/\s+/g, " ").trim()}`);
  }
  const re = new RegExp(VOSEO.source, "giu");
  for (const m of text.matchAll(re)) {
    const word = m[0];
    const at = m.index ?? 0;
    const around = text.slice(Math.max(0, at - 40), at + 60);
    if (ONLY_IN_PROSE.test(word) && !/[¿¡áéíóúñ]|\b(que|tu|te|con|para|por|y)\b/.test(around)) continue;
    hits.push(`${word} … ${around.replace(/\s+/g, " ").trim()}`);
  }
  return hits;
}

test("es.json and the industry presets do not use voseo", () => {
  for (const rel of ["messages/es.json", "src/lib/words/presets.ts"]) {
    const found = offenders(readFileSync(join(ROOT, rel), "utf8"));
    assert.deepEqual(found, [], rel);
  }
});

test("no source file with Spanish copy uses voseo (booking sheet, chat, dock, talent site, receipts, demos)", () => {
  const all: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const hit of offenders(readFileSync(file, "utf8"))) all.push(`${relative(ROOT, file)}: ${hit}`);
  }
  assert.deepEqual(all, [], "use the Mexican tú form (Elige, Tienes, Escríbeme), never voseo");
});

test("the guard bites: voseo is caught, tú-form is not", () => {
  assert.ok(offenders("Elegí una fecha").length > 0);
  assert.ok(offenders("¿Tenés una duda? Preguntá antes de reservar").length > 0);
  assert.ok(offenders("Contame qué querés hacer").length > 0);
  assert.deepEqual(offenders("Elige una fecha. ¿Tienes una duda? Pregunta antes de reservar."), []);
  assert.ok(offenders("{agency} te envio una oferta. Revisala").length > 0);
  assert.ok(offenders("Abrilo y mandame el resultado").length >= 2);
  assert.ok(offenders("Compartilo con tu equipo").length > 0);
  assert.deepEqual(offenders("Revísala y mándame el resultado. Ábrelo cuando puedas."), []);
  assert.deepEqual(offenders("La sala del pelo; un tomate; una mandala; Dame y dile que sí."), []);
  assert.deepEqual(offenders("Hace siete años seguí esa vocación y compartí mi trabajo."), []);
});
