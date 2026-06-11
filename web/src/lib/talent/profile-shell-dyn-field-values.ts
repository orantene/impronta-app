/**
 * Sync profile shell `dynFields` to public.field_values (catalog keys only).
 * Staff vs talent use different `editable_by_*` gates on field_definitions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import {
  mirrorWriteToCanonical,
  mirrorWriteToLegacy,
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
    // Unbridged keys have NO B store — under B-first they must still write A
    // directly (there is nowhere else for their value to live).
    const isBridged = Boolean(OLD_TO_NEW_KEY[def.key]);

    if (writeSource === "b" && isBridged) {
      // ── B-FIRST (canonical primary, A kept in sync via the reverse mirror) ──
      // 1) Write System B FIRST — this is now the primary store. The value that
      //    lands in B is byte-equivalent to what the A-first path's A→B mirror
      //    produces today (identical helper, identical args, identical slug→
      //    label translation + delete-on-null contract + workflow_state/role).
      const bResult = await mirrorWriteToCanonical(
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

      // 3) Transition-period reverse mirror B→A so residual legacy `field_values`
      //    readers + the reconcile cron stay fresh. We feed `mirrorWriteToLegacy`
      //    the EXACT value B persisted (returned by the canonical write) so the
      //    reverse vocab translation (B label → A slug) has one source of truth.
      //    Deleted in T2.6 alongside the rest of the mirror.
      const newFieldKey = OLD_TO_NEW_KEY[def.key];
      const legacyValue =
        bResult.status === "upserted" ? bResult.bValue : null; // deleted/noop ⇒ clear A
      await mirrorWriteToLegacy(
        supabase,
        def.value_type,
        talent_profile_id,
        newFieldKey,
        legacyValue,
      );
      continue;
    }

    // ── A-FIRST (default) and the B-first UNBRIDGED fallback ───────────────────
    // A-first: today's behaviour byte-for-byte. B-first-unbridged: identical A
    // write (no B store exists for the key), but we SKIP the A→B canonical
    // mirror because there is no canonical def to mirror into (it would no-op).
    const wA = await writeLegacyA(field_definition_id, patch);
    if (!wA.ok) return { ok: false, error: CLIENT_ERROR.update };
    touchedAiDoc = true;

    const h = await syncHeightColumn(def.key, patch);
    if (!h.ok) return { ok: false, error: CLIENT_ERROR.update };

    if (writeSource === "a") {
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
  }

  if (touchedAiDoc) {
    await scheduleRebuildAiSearchDocument(supabase, talent_profile_id);
  }

  return { ok: true };
}
