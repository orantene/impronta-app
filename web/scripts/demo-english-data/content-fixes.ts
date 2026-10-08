/**
 * TUL-207: two small, guarded CONTENT fixes for DEMO talents (separate from the
 * English seed in plan.ts, which is unchanged). Pure plan + runner: no database
 * client, every read and write goes through the injected `ContentFixIo`.
 *
 *   1. Renata (TAL-93002) offering d3a89e51-..., "Lash lift and tint": the ES
 *      description said something different from the EN one. ES is set to a
 *      faithful Spanish of the EN, ONLY when the stored ES still equals the known
 *      old text exactly. EN is left as is.
 *   2. Sofia Campos (TAL-93007) has no FAQ rows. Four published ES+EN rows are
 *      inserted, ONLY when she has ZERO rows at run time. Facts come from her demo
 *      fixture (scripts/demo-talents/demos.ts); a fact the repo lacks is listed
 *      under NEEDS_FACT, never invented.
 *
 * Same safety as the English seed: allow-list, is_demo required, site slug
 * check, one refusal aborts the run before any write, writes keyed by row id AND
 * profile id, backup before writing, verify by re-reading. Dry run by default;
 * writing needs --apply --yes.
 */

import { assertResolvedProfile, RefusedError, type I18nMap, type OfferingRow, type ProfileRow } from "./plan";
import { ALLOWED_TARGETS, type DemoTarget } from "./targets";

// ---------------------------------------------------------------- data

export const RENATA_CODE = "TAL-93002";
export const SOFIA_CODE = "TAL-93007";
export const RENATA_OFFERING_ID = "d3a89e51-74fd-484a-8f45-064c69b30b7f";
export const RENATA_OLD_ES = "Curvatura natural que dura de 6 a 8 semanas.";
export const RENATA_NEW_ES = "Curvatura y color para tus pestañas naturales, sin extensiones.";

export interface FaqInsert {
  talent_profile_id: string;
  question: string;
  answer: string;
  status: "published";
  sort_order: number;
  question_i18n: { es: string; en: string };
  answer_i18n: { es: string; en: string };
}

/** The same four-question set the other demos use. Spanish is primary. */
const SOFIA_FAQ: ReadonlyArray<{ q: { es: string; en: string }; a: { es: string; en: string } }> = [
  {
    q: { es: "¿Cómo reservo?", en: "How do I book?" },
    a: {
      es: "Elige un servicio en esta página y envía tu solicitud con la fecha y el lugar de tu evento. Te confirmo disponibilidad y precio.",
      en: "Pick a service on this page and send a request with the date and place of your event. I confirm availability and price.",
    },
  },
  {
    q: { es: "¿Cuál es tu horario?", en: "What are your hours?" },
    a: {
      es: "La barra y los talleres se acuerdan por solicitud, así que fijamos juntos el día y la hora. Una barra dura cinco horas y un taller, dos.",
      en: "Event bars and workshops are arranged by request, so we agree the day and time together. A bar runs five hours and a workshop runs two.",
    },
  },
  {
    q: { es: "¿Dónde trabajas?", en: "Where do you work?" },
    a: {
      es: "Estoy en Cancún y llevo la barra a tu evento.",
      en: "I am based in Cancún and I bring the bar to your event.",
    },
  },
  {
    q: { es: "¿Qué ofreces y cuánto cuesta?", en: "What do you offer and what does it cost?" },
    a: {
      es: "Barra para evento: cinco horas, hasta 60 invitados, $6,500 MXN por evento. Taller de coctelería: dos horas para grupos pequeños, $600 MXN por persona.",
      en: "Event bar: five hours, up to 60 guests, MXN $6,500 per event. Cocktail workshop: two hours for small groups, MXN $600 per person.",
    },
  },
];

/** Facts the repo does not hold, so the answer is deliberately generic. Printed by the dry run. */
export const NEEDS_FACT: readonly string[] = [
  "Sofía Campos weekly hours (no hours in scripts/demo-talents/demos.ts; the hours answer says bars and workshops are arranged by request)",
  "Sofía Campos service area beyond Cancún (the where answer says she is based in Cancún and brings the bar to the event)",
];

export function buildSofiaFaq(profileId: string): FaqInsert[] {
  return SOFIA_FAQ.map((f, i) => ({
    talent_profile_id: profileId,
    question: f.q.es,
    answer: f.a.es,
    status: "published" as const,
    sort_order: i,
    question_i18n: { es: f.q.es, en: f.q.en },
    answer_i18n: { es: f.a.es, en: f.a.en },
  }));
}

// ---------------------------------------------------------------- io

export interface FaqFullRow {
  id: string;
  talent_profile_id: string;
  question: string | null;
  answer: string | null;
  status: string | null;
  sort_order: number | null;
  question_i18n: unknown;
  answer_i18n: unknown;
}

export interface ContentFixIo {
  findProfile(profileCode: string): Promise<ProfileRow | null>;
  findSiteSlug(profileId: string): Promise<string | null>;
  listOfferings(profileId: string): Promise<OfferingRow[]>;
  listFaqFull(profileId: string): Promise<FaqFullRow[]>;
  /** LIVE. Updates description and description_i18n of ONE offering of this profile. */
  updateOfferingDescription(input: { profileId: string; id: string; description: string | null; description_i18n: I18nMap }): Promise<{ ok: boolean; error?: string }>;
  /** LIVE. Inserts the rows (each already carries its talent_profile_id) and returns the new ids. */
  insertFaqRows(input: { profileId: string; rows: FaqInsert[] }): Promise<{ ok: boolean; ids: string[]; error?: string }>;
  /** Writes JSON to a backup file named with `label` and returns its path. */
  writeBackup(label: string, data: unknown): string;
}

// ---------------------------------------------------------------- plan

export interface RenataPlan {
  status: "apply" | "skipped";
  reason?: string;
  profileId: string;
  offeringId: string;
  before?: OfferingRow;
  nextDescription?: string | null;
  nextMap?: I18nMap;
}

export interface SofiaPlan {
  status: "insert" | "skipped";
  reason?: string;
  profileId: string;
  rows: FaqInsert[];
}

function asMap(v: unknown): I18nMap | null {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const out: I18nMap = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val !== "string") return null;
    out[k] = val;
  }
  return out;
}

export function planRenata(profileId: string, offerings: OfferingRow[]): RenataPlan {
  const base = { profileId, offeringId: RENATA_OFFERING_ID };
  const row = offerings.find((o) => o.id === RENATA_OFFERING_ID);
  if (!row) return { ...base, status: "skipped", reason: "unexpected current value, skipped (offering not found on this profile)" };
  const map = asMap(row.description_i18n);
  if (map === null) return { ...base, status: "skipped", before: row, reason: "unexpected current value, skipped (description_i18n is not a plain text map)" };
  const es = typeof map.es === "string" && map.es.trim() !== "" ? map.es : (row.description ?? "");
  if (es.trim() !== RENATA_OLD_ES) {
    return { ...base, status: "skipped", before: row, reason: `unexpected current value, skipped (ES is ${JSON.stringify(es.length > 90 ? `${es.slice(0, 87)}...` : es)})` };
  }
  // The plain column holds the primary (Spanish) value: move it only when it still equals the old text.
  const plainIsOld = (row.description ?? "").trim() === RENATA_OLD_ES;
  return {
    ...base,
    status: "apply",
    before: row,
    nextDescription: plainIsOld ? RENATA_NEW_ES : row.description,
    nextMap: { ...map, es: RENATA_NEW_ES },
  };
}

export function planSofia(profileId: string, existing: FaqFullRow[]): SofiaPlan {
  if (existing.length > 0) {
    return { status: "skipped", profileId, rows: [], reason: `refusing to insert: ${existing.length} FAQ row(s) already exist` };
  }
  return { status: "insert", profileId, rows: buildSofiaFaq(profileId) };
}

// ---------------------------------------------------------------- args

export interface FixOptions { apply: boolean; yes: boolean }

export function parseFixArgs(argv: readonly string[]): FixOptions {
  const flags = new Set<string>();
  for (const a of argv) {
    if (a !== "--content-fixes" && a !== "--apply" && a !== "--yes") throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  if (!flags.has("--content-fixes")) throw new RefusedError("--content-fixes is required for this mode");
  const apply = flags.has("--apply");
  const yes = flags.has("--yes");
  if (yes && !apply) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (apply && !yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
  return { apply, yes };
}

// ---------------------------------------------------------------- runner

export interface FixResult { exitCode: number; wrote: { renata: boolean; faqIds: string[] }; backupPaths: string[] }

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function runContentFixes(
  argv: readonly string[],
  io: ContentFixIo,
  log: (line: string) => void = (l) => console.log(l),
  opts: { targets?: readonly DemoTarget[] } = {},
): Promise<FixResult> {
  const targets = opts.targets ?? ALLOWED_TARGETS;
  const nothing: FixResult = { exitCode: 0, wrote: { renata: false, faqIds: [] }, backupPaths: [] };
  let options: FixOptions;
  try {
    options = parseFixArgs(argv);
  } catch (e) {
    if (e instanceof RefusedError) { log(`REFUSED: ${e.message}`); return { ...nothing, exitCode: 3 }; }
    throw e;
  }
  log(options.apply ? "MODE: APPLY content fixes (writes happen after the backup)" : "MODE: DRY RUN content fixes (nothing is written)");

  // Phase 1: read and guard everything. One refusal aborts the run before any write.
  let renata: RenataPlan | null = null;
  let sofia: SofiaPlan | null = null;
  let sofiaTarget: DemoTarget | null = null;
  let renataTarget: DemoTarget | null = null;
  try {
    for (const code of [RENATA_CODE, SOFIA_CODE]) {
      const target = targets.find((t) => t.profileCode === code);
      if (!target) throw new RefusedError(`${code} is not on the allow-list`);
      const profile = await io.findProfile(code);
      if (!profile) { log(`${code}: not found in this database (skipped)`); continue; }
      assertResolvedProfile(target, profile, await io.findSiteSlug(profile.id), targets);
      if (code === RENATA_CODE) { renataTarget = target; renata = planRenata(profile.id, await io.listOfferings(profile.id)); }
      else { sofiaTarget = target; sofia = planSofia(profile.id, await io.listFaqFull(profile.id)); }
    }
  } catch (e) {
    if (e instanceof RefusedError) { log(`REFUSED: ${e.message}`); log("Nothing was written."); return { ...nothing, exitCode: 3 }; }
    throw e;
  }

  if (renata && renataTarget) {
    log(`${RENATA_CODE} slug=${renataTarget.siteSlug} is_demo=true`);
    if (renata.status === "apply") {
      log(`  talent_offerings ${renata.offeringId}: description_i18n.es`);
      log(`    old ES: ${JSON.stringify(RENATA_OLD_ES)}`);
      log(`    new ES: ${JSON.stringify(RENATA_NEW_ES)}   (EN left as is: ${JSON.stringify(renata.nextMap?.en ?? "")})`);
      log(`    plain description column: ${renata.nextDescription === renata.before?.description ? "unchanged" : "also updated"}`);
    } else log(`  talent_offerings ${renata.offeringId}: ${renata.reason}`);
  }
  if (sofia && sofiaTarget) {
    log(`${SOFIA_CODE} slug=${sofiaTarget.siteSlug} is_demo=true`);
    if (sofia.status === "insert") {
      log(`  talent_faq_items: would INSERT ${sofia.rows.length} rows (profile ${sofia.profileId}):`);
      for (const r of sofia.rows) log(`    ${JSON.stringify(r)}`);
    } else log(`  talent_faq_items: ${sofia.reason}`);
  }
  for (const n of NEEDS_FACT) log(`  needs fact: ${n}`);

  const doRenata = renata?.status === "apply";
  const doSofia = sofia?.status === "insert";
  log("");
  log(`TOTALS: renata fix=${doRenata ? "apply" : "skip"} sofia faq insert=${doSofia ? `${sofia?.rows.length} rows` : "skip"}`);
  if (!options.apply) { log("Dry run only. Re-run with --content-fixes --apply --yes to write."); return nothing; }
  if (!doRenata && !doSofia) { log("Nothing to write."); return nothing; }

  // Phase 2: backup, write, verify.
  const backupPaths: string[] = [];
  backupPaths.push(io.writeBackup("tul-207-content-fixes-before", {
    ticket: "TUL-207",
    createdAt: new Date().toISOString(),
    renata: doRenata && renata ? { profileCode: RENATA_CODE, profileId: renata.profileId, talent_offerings: renata.before } : null,
    sofia: doSofia && sofia ? { profileCode: SOFIA_CODE, profileId: sofia.profileId, talent_faq_items_before: [], plannedInserts: sofia.rows } : null,
  }));
  log(`Backup of previous values: ${backupPaths[0]}`);

  const problems: string[] = [];
  let renataWrote = false;
  let faqIds: string[] = [];

  if (doRenata && renata && renata.nextMap) {
    const res = await io.updateOfferingDescription({ profileId: renata.profileId, id: renata.offeringId, description: renata.nextDescription ?? null, description_i18n: renata.nextMap });
    if (res.ok) renataWrote = true; else problems.push(`${RENATA_CODE} offering ${renata.offeringId}: ${res.error ?? "write failed"}`);
  }
  if (doSofia && sofia) {
    const res = await io.insertFaqRows({ profileId: sofia.profileId, rows: sofia.rows });
    faqIds = res.ids;
    if (!res.ok) problems.push(`${SOFIA_CODE} faq insert: ${res.error ?? "write failed"}`);
    // The ids are only known now: record them so a rollback can delete exactly these rows.
    const p = io.writeBackup("tul-207-content-fixes-inserted-ids", { ticket: "TUL-207", profileCode: SOFIA_CODE, profileId: sofia.profileId, insertedFaqIds: faqIds, rollback: "delete from talent_faq_items where id = any(insertedFaqIds) and talent_profile_id = profileId" });
    backupPaths.push(p);
    log(`Inserted ids recorded: ${p}`);
  }

  if (renataWrote && renata && renata.before && renata.nextMap) {
    const now = (await io.listOfferings(renata.profileId)).find((o) => o.id === renata.offeringId);
    const m = now ? asMap(now.description_i18n) : null;
    if (!now || !m) problems.push(`${RENATA_CODE}: offering unreadable after write`);
    else {
      if (!sameJson(m, renata.nextMap)) problems.push(`${RENATA_CODE}: description_i18n is not what was planned`);
      if (now.description !== (renata.nextDescription ?? null)) problems.push(`${RENATA_CODE}: description column is not what was planned`);
      if (now.title !== renata.before.title || !sameJson(now.title_i18n, renata.before.title_i18n)) problems.push(`${RENATA_CODE}: title changed`);
    }
  }
  if (doSofia && sofia) {
    const rows = await io.listFaqFull(sofia.profileId);
    if (rows.length !== sofia.rows.length) problems.push(`${SOFIA_CODE}: expected ${sofia.rows.length} faq rows after insert, found ${rows.length}`);
    for (const r of rows) {
      if (r.talent_profile_id !== sofia.profileId) problems.push(`${SOFIA_CODE}: faq ${r.id} belongs to another profile`);
      if (!faqIds.includes(r.id)) problems.push(`${SOFIA_CODE}: faq ${r.id} is not one of the inserted ids`);
    }
    for (const want of sofia.rows) {
      const got = rows.find((r) => r.sort_order === want.sort_order);
      if (!got || got.status !== "published" || got.question !== want.question || got.answer !== want.answer
        || !sameJson(asMap(got.question_i18n), want.question_i18n) || !sameJson(asMap(got.answer_i18n), want.answer_i18n)) {
        problems.push(`${SOFIA_CODE}: faq sort_order ${want.sort_order} is not what was planned`);
      }
    }
  }

  if (problems.length > 0) {
    log("VERIFY FAILED:");
    for (const p of problems) log(`  ${p}`);
    log(`Restore from the backups: ${backupPaths.join(", ")}`);
    return { exitCode: 1, wrote: { renata: renataWrote, faqIds }, backupPaths };
  }
  log(`Applied and verified: renata=${renataWrote ? "updated" : "skipped"}, sofia faq rows=${faqIds.length}.`);
  return { exitCode: 0, wrote: { renata: renataWrote, faqIds }, backupPaths };
}
