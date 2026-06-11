/**
 * Sync profile shell `dynFields` to public.field_values (catalog keys only).
 * Staff vs talent use different `editable_by_*` gates on field_definitions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import {
  mirrorWriteToCanonical,
  prefetchMirrorCanonicalContext,
  OLD_TO_NEW_KEY,
} from "@/lib/fields/legacy-mirror";
import { mirrorHeightCmToTalentProfile } from "@/lib/field-values-height-mirror";
import { resolveSelectValue } from "@/lib/fields/coerce-select-value";
import { activeWriteSource } from "@/lib/field-engine/write-source";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type ShellDynFieldEditor = "staff" | "talent";

type Result = { ok: true } | { ok: false; error: string };

const SUPPORTED_DYN_FV_TYPES = ["text", "textarea", "number", "boolean", "date"] as const;
function isSupportedDynFvType(v: string): v is (typeof SUPPORTED_DYN_FV_TYPES)[number] {
  return (SUPPORTED_DYN_FV_TYPES as readonly string[]).includes(v);
}

function parseBooleanRaw(raw: string): boolean | null {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return null;
}

type FieldDefDynRow = {
  id: string;
  key: string;
  value_type: string;
  editable_by_staff: boolean;
  editable_by_talent: boolean;
  active: boolean;
  archived_at: string | null;
  config: Record<string, unknown> | null;
  label_en: string | null;
};

function canEditDef(def: FieldDefDynRow, editor: ShellDynFieldEditor): boolean {
  return editor === "staff" ? def.editable_by_staff : def.editable_by_talent;
}

export async function syncProfileShellDynFieldValues(
  supabase: SupabaseClient,
  talent_profile_id: string,
  dyn_fields: Record<string, string | string[]> | undefined,
  editor: ShellDynFieldEditor,
): Promise<Result> {
  if (!dyn_fields || typeof dyn_fields !== "object") return { ok: true };

  const entries: { key: string; raw: string }[] = [];
  for (const [key, val] of Object.entries(dyn_fields)) {
    if (!key || key.startsWith("custom_")) continue;
    const raw = Array.isArray(val) ? val.map(String).join(", ") : String(val ?? "").trim();
    entries.push({ key, raw });
  }
  if (entries.length === 0) return { ok: true };

  const keys = [...new Set(entries.map((e) => e.key))];
  const { data: defs, error: defErr } = await supabase
    .from("field_definitions")
    .select("id, key, value_type, editable_by_staff, editable_by_talent, active, archived_at, config, label_en")
    .in("key", keys);
  if (defErr) {
    logServerError("profile-shell-dyn-fv.defs", defErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const byKey = new Map(
    ((defs ?? []) as FieldDefDynRow[]).map((d) => [d.key, d] as const),
  );

  // P5-γ + §11.2 batching — hoist the canonical-mirror lookups (def id per
  // bridged key + tenant id from active roster) once for the whole batch.
  // Per-call inside the loop becomes a Map lookup + the upsert/delete RPC,
  // dropping a 17-key save from 51 round-trips (17×3) to 19 (2 + 17×1).
  const mirrorContext = await prefetchMirrorCanonicalContext(
    supabase,
    talent_profile_id,
    entries.map((e) => e.key),
  );

  // T2.5c write-source seam. `a` (default) = today's behaviour exactly: write
  // System A `field_values` FIRST, then fire-and-forget the A→B mirror. `b` =
  // write canonical System B FIRST (the read source of truth), then mirror B→A
  // so residual legacy readers + the reconcile cron stay fresh until the mirror
  // is deleted (T2.6). Resolved ONCE per batch — the env flag does not change
  // mid-save. Kill switch back to A-first: FIELD_ENGINE_WRITE_SOURCE=shell:a.
  const writeSource = activeWriteSource("shell");

  // ── Per-store write helpers (shared by both A-first and B-first) ───────────

  /** Upsert/delete the legacy System A `field_values` row for this field. The
   *  delete path is `patch === null`. Returns ok=false on a hard DB error
   *  (aborts the batch, same contract as today's inline code). */
  async function writeLegacyA(
    field_definition_id: string,
    patch: Record<string, unknown> | null,
  ): Promise<{ ok: true } | { ok: false }> {
    if (!patch) {
      const { error } = await supabase
        .from("field_values")
        .delete()
        .eq("talent_profile_id", talent_profile_id)
        .eq("field_definition_id", field_definition_id);
      if (error) {
        logServerError("profile-shell-dyn-fv.delete", error);
        return { ok: false };
      }
      return { ok: true };
    }
    const { error } = await supabase.from("field_values").upsert(
      {
        talent_profile_id,
        field_definition_id,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "talent_profile_id,field_definition_id" },
    );
    if (error) {
      logServerError("profile-shell-dyn-fv.upsert", error);
      return { ok: false };
    }
    return { ok: true };
  }

  /** Mirror `height_cm` to the `talent_profiles.height_cm` column. Independent
   *  of both value stores; runs under A-first AND B-first identically. */
  async function syncHeightColumn(
    defKey: string,
    patch: Record<string, unknown> | null,
  ): Promise<{ ok: true } | { ok: false }> {
    if (defKey !== "height_cm") return { ok: true };
    const height =
      patch &&
      typeof patch.value_number === "number" &&
      Number.isFinite(patch.value_number)
        ? Math.round(patch.value_number)
        : null;
    const m = await mirrorHeightCmToTalentProfile(supabase, talent_profile_id, height);
    return m.ok ? { ok: true } : { ok: false };
  }

  let touchedAiDoc = false;

  for (const { key, raw } of entries) {
    const def = byKey.get(key);
    if (!def) continue;
    if (def.archived_at || !def.active || !canEditDef(def, editor)) continue;
    if (!isSupportedDynFvType(def.value_type)) continue;
    if (isReservedTalentProfileFieldKey(def.key)) continue;

    const field_definition_id = def.id;
    let patch: Record<string, unknown> | null = null;

    if (def.value_type === "text" || def.value_type === "textarea") {
      let textToWrite = raw;
      if (def.value_type === "text" && raw.length > 0) {
        const res = resolveSelectValue(def.config, raw);
        // Orphaned/legacy value on a select field — never abort the whole batch
        // save for a value the user can't even see; leave the row untouched and
        // move on. (Select inputs only ever emit valid option values, so an
        // unmatchable raw is always pre-existing data echoed back, never fresh
        // user input.)
        if (res.kind === "unmatchable") continue;
        // Self-heal label/case drift to the canonical option value.
        if (res.kind === "matched") textToWrite = res.value;
      }
      patch = textToWrite.length > 0 ? { value_text: textToWrite } : null;
    } else if (def.value_type === "number") {
      const n = raw ? Number(raw) : NaN;
      patch = Number.isFinite(n) ? { value_number: n } : null;
    } else if (def.value_type === "date") {
      patch = raw.length > 0 ? { value_date: raw } : null;
    } else if (def.value_type === "boolean") {
      if (raw.length === 0) {
        patch = null;
      } else {
        const b = parseBooleanRaw(raw);
        if (b === null) {
          return { ok: false, error: `Invalid value for ${def.label_en ?? "field"}.` };
        }
        patch = { value_boolean: b };
      }
    }

    // The single scalar that maps to canonical System B (the same extraction
    // the A→B mirror has always used). `null` ⇒ clear/delete the value.
    const canonicalValue = !patch
      ? null
      : (patch.value_text ??
        patch.value_number ??
        patch.value_boolean ??
        patch.value_date ??
        null);

    // Is this field one of the 17 keys with a canonical System B definition?
    // Unbridged keys have NO B store. Under B-first they are now a value-store
    // no-op (the dead legacy A-write was removed — see the unbridged branch
    // below); under the A-first kill switch they still write A as before.
    const isBridged = Boolean(OLD_TO_NEW_KEY[def.key]);

    if (writeSource === "b" && isBridged) {
      // ── B-ONLY (canonical is the sole store; legacy field_values is frozen) ──
      // T2.6 step 3 removed the B→A reverse mirror — the shell write path no
      // longer touches System A `field_values` at all under shell:b. Existing A
      // data is frozen (not deleted); the reconcile cron's A→B heal remains the
      // backstop if any legacy reader still depends on A.
      //
      // 1) Write System B (the primary + read-source-of-truth store). The value
      //    that lands in B is byte-equivalent to what the A-first path's A→B
      //    mirror produces (identical helper, identical args, identical slug→
      //    label translation + delete-on-null contract + workflow_state/role).
      await mirrorWriteToCanonical(
        supabase,
        def.key,
        talent_profile_id,
        canonicalValue,
        mirrorContext,
      );
      touchedAiDoc = true;

      // 2) Height column mirror (independent of the value store; same as A-first).
      const h = await syncHeightColumn(def.key, patch);
      if (!h.ok) return { ok: false, error: CLIENT_ERROR.update };

      continue;
    }

    // ── B-first UNBRIDGED keys: no-op on the value store ───────────────────────
    // Under shell:b an unbridged key has no canonical System B definition, so
    // there is nowhere in B for its value to live. The prior code wrote such
    // keys straight to legacy System A `field_values`. T2.6 step 3 INVESTIGATION
    // (production query, 2026-06-11): EVERY `field_values` row in prod belongs
    // to one of the 17 bridged keys — there are ZERO `field_values` rows for any
    // unbridged key, and the only unbridged active+editable shell keys
    // (instagram_url / tiktok_url / youtube_url / long_bio) have their real home
    // in System B's catalog (creator.* handles, bios) or are bridged
    // (media.website_url). So this A-write path is dead: it has never produced a
    // live row and cannot lose data. We skip it entirely rather than resurrect
    // legacy `field_values` writes. The height column (independent of either
    // value store) still mirrors so non-bridged height edits aren't dropped.
    if (writeSource === "b") {
      const h = await syncHeightColumn(def.key, patch);
      if (!h.ok) return { ok: false, error: CLIENT_ERROR.update };
      continue;
    }

    // ── A-FIRST (kill switch: FIELD_ENGINE_WRITE_SOURCE=shell:a) ────────────────
    // Today's pre-B-first behaviour byte-for-byte: write System A first, then
    // fire-and-forget the A→B canonical mirror. Retained as the documented
    // rollback path; under the default shell:b it is never taken.
    const wA = await writeLegacyA(field_definition_id, patch);
    if (!wA.ok) return { ok: false, error: CLIENT_ERROR.update };
    touchedAiDoc = true;

    const h = await syncHeightColumn(def.key, patch);
    if (!h.ok) return { ok: false, error: CLIENT_ERROR.update };

    // P5-γ legacy→canonical bridge — keep talent_profile_field_values in sync
    // for the 17 bridged keys. No-op for unbridged keys; errors are logged
    // inside the helper and never block the legacy write above.
    await mirrorWriteToCanonical(
      supabase,
      def.key,
      talent_profile_id,
      canonicalValue,
      mirrorContext,
    );
  }

  if (touchedAiDoc) {
    await scheduleRebuildAiSearchDocument(supabase, talent_profile_id);
  }

  return { ok: true };
}
