/**
 * backfill-legacy-field-values.ts — P4b one-shot Discover backfill.
 *
 * Mirrors EXISTING canonical `talent_profile_field_values` into legacy
 * `field_values` for the 17 bridged keys, so Discover / directory facets
 * (which still read the OLD tables) reflect talent self-edits that were
 * written to the canonical table BEFORE the live mirror bridge existed
 * (i.e. pre-commit 1c0827aec).
 *
 * Uses the EXACT live bridge (`mirrorWriteToLegacy` + `NEW_TO_OLD_KEY`
 * from src/lib/fields/legacy-mirror) — zero new convergence/coercion
 * logic, so behaviour is byte-identical to a normal write. The upsert is
 * idempotent (onConflict talent_profile_id,field_definition_id): safe to
 * re-run. NON-DESTRUCTIVE — null/empty canonical values are skipped, so
 * this never deletes a legacy row.
 *
 * Explicitly NOT in scope: Discover cutover, canonical search migration,
 * legacy retirement, custom fields, any unrelated refactor.
 *
 * Run from web/:
 *   npm run backfill:legacy-field-values            # apply
 *   npm run backfill:legacy-field-values -- --dry-run   # count only, no writes
 */
import { createClient } from "@supabase/supabase-js";
import {
  NEW_TO_OLD_KEY,
  mirrorWriteToLegacy,
} from "../src/lib/fields/legacy-mirror";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
  );
  process.exit(1);
}

const DRY = process.argv.includes("--dry-run");
const svc = createClient(url, key, { auth: { persistSession: false } });

type DefRow = { id: string; field_key: string; kind: string | null };
type ValRow = { talent_profile_id: string; value: unknown };

async function main(): Promise<void> {
  const newKeys = Object.keys(NEW_TO_OLD_KEY);
  console.log(
    `[P4b backfill] ${DRY ? "DRY-RUN — no writes. " : ""}bridged keys=${newKeys.length}`,
  );

  const { data: defs, error: defErr } = await svc
    .from("profile_field_definitions")
    .select("id, field_key, kind")
    .in("field_key", newKeys);
  if (defErr) {
    console.error("profile_field_definitions lookup failed:", defErr.message);
    process.exit(1);
  }
  const byKey = new Map<string, DefRow>(
    ((defs ?? []) as DefRow[]).map((d) => [d.field_key, d]),
  );

  let totalRows = 0;
  let totalMirrored = 0;
  let totalSkippedEmpty = 0;
  let totalNoDef = 0;

  for (const nk of newKeys) {
    const def = byKey.get(nk);
    if (!def) {
      console.warn(`  [skip] ${nk}: not in profile_field_definitions`);
      totalNoDef++;
      continue;
    }

    const { data: vals, error: vErr } = await svc
      .from("talent_profile_field_values")
      .select("talent_profile_id, value")
      .eq("field_definition_id", def.id)
      .eq("workflow_state", "live");
    if (vErr) {
      console.error(`  [err] ${nk}: ${vErr.message}`);
      continue;
    }

    const rows = (vals ?? []) as ValRow[];
    totalRows += rows.length;
    let mirrored = 0;
    let skippedEmpty = 0;

    for (const r of rows) {
      const v = r.value;
      const empty =
        v === null ||
        v === undefined ||
        (typeof v === "string" && v.trim() === "") ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        skippedEmpty++;
        continue;
      }
      if (!DRY) {
        await mirrorWriteToLegacy(
          svc,
          String(def.kind ?? ""),
          r.talent_profile_id,
          nk,
          v,
        );
      }
      mirrored++;
    }

    totalMirrored += mirrored;
    totalSkippedEmpty += skippedEmpty;
    console.log(
      `  ${nk} -> ${NEW_TO_OLD_KEY[nk]}: ${mirrored}/${rows.length} mirrored` +
        (skippedEmpty ? `, ${skippedEmpty} empty-skipped` : "") +
        (DRY ? " (dry)" : ""),
    );
  }

  console.log(
    `\n[P4b backfill] ${DRY ? "DRY-RUN " : ""}DONE — keys=${newKeys.length} ` +
      `noDef=${totalNoDef} canonicalLiveRows=${totalRows} ` +
      `mirrored=${totalMirrored} emptySkipped=${totalSkippedEmpty}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[P4b backfill] FATAL:", e);
    process.exit(1);
  });
