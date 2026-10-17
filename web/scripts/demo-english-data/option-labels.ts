/**
 * TUL-876: English labels for the OPTIONS (variants) and EXTRAS (add-ons) of a DEMO talent's
 * services. alex-trevino-demo's "Revisión eléctrica" offers Casa / Departamento / Local
 * comercial; the stored `label_i18n` has no `en`, so /en/book shows the Spanish chips even though
 * the booking sheet already reads `label_i18n` in the visitor's language (catalog-option-locale).
 * This is the DATA half: a guarded planner + runner in the style of content-fixes.ts. Pure plan:
 * no database client, every read and write goes through the injected `OptionLabelIo`.
 *
 * Only a label whose Spanish text is in OPTION_LABELS_EN gets an English one. Anything else is
 * skipped and listed, never guessed. A non-empty `en` is never overwritten and `es`, the plain
 * `label` column and every price are never touched. Allow-list of ONE demo (TAL-93030), is_demo
 * required, site slug checked, writes keyed by row id AND scoped to the profile's own offerings,
 * backup before writing, verify by re-reading. Dry run by default; writing needs --apply --yes
 * and is run by the Project Manager, not by CI.
 */

import { assertResolvedProfile, RefusedError, type I18nMap, type ProfileRow } from "./plan";
import { sameJson } from "./content-fixes";
import type { DemoTarget } from "./targets";

// ---------------------------------------------------------------- data

/** Hard allow-list for this mode. Deliberately NOT ALLOWED_TARGETS: Alex is not part of the TUL-207 seed. */
export const OPTION_TARGETS: readonly DemoTarget[] = [
  { profileCode: "TAL-93030", siteSlug: "alex-trevino", hosts: ["alex-trevino-demo"] },
];

/** Spanish option label (accent- and case-insensitive) to its standard English. Only obvious pairs. */
export const OPTION_LABELS_EN: Readonly<Record<string, string>> = {
  casa: "House",
  departamento: "Apartment",
  "local comercial": "Commercial space",
};

export function normalizeLabel(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------------------------------------------------------------- types

export type ChildTable = "talent_offering_variants" | "talent_offering_addons";

export interface ChildRow {
  id: string;
  offering_id: string;
  label: string | null;
  label_i18n: unknown;
}

export interface ChildRows {
  variants: ChildRow[];
  addons: ChildRow[];
}

export interface ChildPatch {
  table: ChildTable;
  id: string;
  offeringId: string;
  label: string;
  before: unknown;
  next: I18nMap;
}

export interface ChildSkip {
  table: ChildTable;
  id: string;
  label: string;
  reason: string;
}

export interface OptionPlan {
  profileId: string;
  patches: ChildPatch[];
  skipped: ChildSkip[];
}

export interface OptionLabelIo {
  findProfile(profileCode: string): Promise<ProfileRow | null>;
  findSiteSlug(profileId: string): Promise<string | null>;
  /** The options and extras of EVERY offering of this profile. */
  listChildren(profileId: string): Promise<ChildRows>;
  /** LIVE. Sets label_i18n of ONE option/extra, only when its offering belongs to this profile. */
  updateChildLabel(input: { table: ChildTable; profileId: string; id: string; label_i18n: I18nMap }): Promise<{ ok: boolean; error?: string }>;
  /** Writes JSON to a backup file named with `label` and returns its path. */
  writeBackup(label: string, data: unknown): string;
}

// ---------------------------------------------------------------- plan

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

export function planOptionLabels(profileId: string, rows: ChildRows): OptionPlan {
  const patches: ChildPatch[] = [];
  const skipped: ChildSkip[] = [];
  const tables: Array<[ChildTable, ChildRow[]]> = [
    ["talent_offering_variants", rows.variants],
    ["talent_offering_addons", rows.addons],
  ];
  for (const [table, list] of tables) {
    for (const row of list) {
      const label = row.label ?? "";
      const map = asMap(row.label_i18n);
      if (map === null) {
        skipped.push({ table, id: row.id, label, reason: "unexpected current value, skipped (label_i18n is not a plain text map)" });
        continue;
      }
      if (typeof map.en === "string" && map.en.trim() !== "") {
        skipped.push({ table, id: row.id, label, reason: "English already set, left as is" });
        continue;
      }
      const spanish = (typeof map.es === "string" && map.es.trim() !== "" ? map.es : label).trim();
      const en = OPTION_LABELS_EN[normalizeLabel(spanish)];
      if (!en) {
        skipped.push({ table, id: row.id, label, reason: `no known English for ${JSON.stringify(spanish)}, not guessed` });
        continue;
      }
      patches.push({ table, id: row.id, offeringId: row.offering_id, label, before: row.label_i18n ?? null, next: { ...map, en } });
    }
  }
  return { profileId, patches, skipped };
}

// ---------------------------------------------------------------- args

export interface OptionOptions {
  apply: boolean;
  yes: boolean;
}

export function parseOptionArgs(argv: readonly string[]): OptionOptions {
  const flags = new Set<string>();
  for (const a of argv) {
    if (a !== "--option-labels" && a !== "--apply" && a !== "--yes") throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  if (!flags.has("--option-labels")) throw new RefusedError("--option-labels is required for this mode");
  const apply = flags.has("--apply");
  const yes = flags.has("--yes");
  if (yes && !apply) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (apply && !yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
  return { apply, yes };
}

// ---------------------------------------------------------------- runner

export interface OptionResult {
  exitCode: number;
  wrote: number;
  backupPath: string | null;
}

export async function runOptionLabels(
  argv: readonly string[],
  io: OptionLabelIo,
  log: (line: string) => void = (l) => console.log(l),
  opts: { targets?: readonly DemoTarget[] } = {},
): Promise<OptionResult> {
  const targets = opts.targets ?? OPTION_TARGETS;
  const nothing: OptionResult = { exitCode: 0, wrote: 0, backupPath: null };
  let options: OptionOptions;
  try {
    options = parseOptionArgs(argv);
  } catch (e) {
    if (e instanceof RefusedError) {
      log(`REFUSED: ${e.message}`);
      return { ...nothing, exitCode: 3 };
    }
    throw e;
  }
  log(options.apply ? "MODE: APPLY option labels (writes happen after the backup)" : "MODE: DRY RUN option labels (nothing is written)");

  // Phase 1: read and guard everything. One refusal aborts the run before any write.
  const plans: Array<{ target: DemoTarget; plan: OptionPlan }> = [];
  try {
    for (const target of targets) {
      const profile = await io.findProfile(target.profileCode);
      if (!profile) {
        log(`${target.profileCode}: not found in this database (skipped)`);
        continue;
      }
      assertResolvedProfile(target, profile, await io.findSiteSlug(profile.id), targets);
      plans.push({ target, plan: planOptionLabels(profile.id, await io.listChildren(profile.id)) });
    }
  } catch (e) {
    if (e instanceof RefusedError) {
      log(`REFUSED: ${e.message}`);
      log("Nothing was written.");
      return { ...nothing, exitCode: 3 };
    }
    throw e;
  }

  let total = 0;
  for (const { target, plan } of plans) {
    log(`${target.profileCode} slug=${target.siteSlug} is_demo=true`);
    for (const p of plan.patches) log(`  ${p.table} ${p.id}: ${JSON.stringify(p.label)} -> label_i18n.en ${JSON.stringify(p.next.en)}`);
    for (const s of plan.skipped) log(`  ${s.table} ${s.id} ${JSON.stringify(s.label)}: ${s.reason}`);
    total += plan.patches.length;
  }
  log("");
  log(`TOTALS: ${total} label(s) to set`);
  if (!options.apply) {
    log("Dry run only. Re-run with --option-labels --apply --yes to write.");
    return nothing;
  }
  if (total === 0) {
    log("Nothing to write.");
    return nothing;
  }

  // Phase 2: backup, write, verify.
  const backupPath = io.writeBackup("tul-876-option-labels-before", {
    ticket: "TUL-876",
    createdAt: new Date().toISOString(),
    profiles: plans.map(({ target, plan }) => ({ profileCode: target.profileCode, profileId: plan.profileId, rows: plan.patches.map((p) => ({ table: p.table, id: p.id, label_i18n_before: p.before })) })),
  });
  log(`Backup of previous values: ${backupPath}`);

  const problems: string[] = [];
  let wrote = 0;
  for (const { target, plan } of plans) {
    for (const p of plan.patches) {
      const res = await io.updateChildLabel({ table: p.table, profileId: plan.profileId, id: p.id, label_i18n: p.next });
      if (res.ok) wrote += 1;
      else problems.push(`${target.profileCode} ${p.table} ${p.id}: ${res.error ?? "write failed"}`);
    }
    const now = await io.listChildren(plan.profileId);
    for (const p of plan.patches) {
      const row = (p.table === "talent_offering_variants" ? now.variants : now.addons).find((r) => r.id === p.id);
      const map = row ? asMap(row.label_i18n) : null;
      if (!row || !map) problems.push(`${target.profileCode} ${p.table} ${p.id}: unreadable after write`);
      else {
        if (!sameJson(map, p.next)) problems.push(`${target.profileCode} ${p.table} ${p.id}: label_i18n is not what was planned`);
        if ((row.label ?? "") !== p.label) problems.push(`${target.profileCode} ${p.table} ${p.id}: the plain label changed`);
      }
    }
  }

  if (problems.length > 0) {
    log("VERIFY FAILED:");
    for (const p of problems) log(`  ${p}`);
    log(`Restore from the backup: ${backupPath}`);
    return { exitCode: 1, wrote, backupPath };
  }
  log(`Applied and verified: ${wrote} label(s).`);
  return { exitCode: 0, wrote, backupPath };
}
