"use server";

// ============================================================================
// admin-talent-field-values.ts — Read + write the per-talent field values
// stored in `talent_profile_field_values` (the DB-driven catalog's value
// store). Pairs with `getFieldsForTalent()` in admin-taxonomy.ts which
// resolves WHICH fields apply; this file persists the values.
// ============================================================================

import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { mirrorWriteToLegacy } from "@/lib/fields/legacy-mirror";

export type TalentFieldValueRow = {
  field_definition_id: string;
  value: unknown;
  workflow_state: "live" | "pending" | "rejected";
  visibility_override: string[] | null;
  updated_at: string | null;
};

export type TalentFieldHistoryRow = {
  id: string;
  changed_at: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  field_key: string;
  field_label: string;
  before_value: unknown;
  after_value: unknown;
  actor_role: string | null;
  actor_email: string | null;
};

// ─── Read all values for a talent ──────────────────────────────────────────

export async function getTalentFieldValues(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; values: TalentFieldValueRow[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .maybeSingle();

  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const { data, error } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id, value, workflow_state, visibility_override, updated_at")
    .eq("talent_profile_id", input.talent_profile_id);

  if (error) {
    logServerError("getTalentFieldValues", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, values: (data ?? []) as TalentFieldValueRow[] };
}

// ─── Upsert a single value (delete-on-empty) ───────────────────────────────

const setValueSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  field_definition_id: pgUuidSchema(),
  // JSON-serializable value. NULL/undefined/"" deletes the row.
  value: z.unknown().optional(),
});

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

// Validate a non-empty value against the field's kind, options, and
// validation_rules JSON. Returns an error string when invalid, null
// when ok. Validation is intentionally permissive on shape coercion
// (we accept "7" for a number field) but strict on bounds + enum
// membership so the catalog never holds garbage.
function validateFieldValue(
  raw: unknown,
  def: {
    kind: string;
    label: string;
    options: string[] | null;
    rules: Record<string, unknown> | null;
  },
): string | null {
  const r = def.rules ?? {};
  const num = (k: string): number | null =>
    typeof r[k] === "number" ? (r[k] as number) : null;
  const str = (k: string): string | null =>
    typeof r[k] === "string" ? (r[k] as string) : null;

  switch (def.kind) {
    case "text":
    case "textarea": {
      if (typeof raw !== "string") {
        return `${def.label}: must be text.`;
      }
      const trimmed = raw.trim();
      const minLen = num("minLength") ?? num("min_length");
      const maxLen = num("maxLength") ?? num("max_length") ?? num("max");
      if (minLen !== null && trimmed.length < minLen) {
        return `${def.label}: at least ${minLen} characters.`;
      }
      if (maxLen !== null && trimmed.length > maxLen) {
        return `${def.label}: at most ${maxLen} characters.`;
      }
      const pattern = str("pattern");
      if (pattern) {
        try {
          const re = new RegExp(pattern);
          if (!re.test(trimmed)) {
            return `${def.label}: doesn't match required format.`;
          }
        } catch {
          // bad regex in catalog — fail open rather than block writes
        }
      }
      return null;
    }
    case "number": {
      const n = typeof raw === "number"
        ? raw
        : (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))
          ? Number(raw)
          : NaN);
      if (Number.isNaN(n)) {
        return `${def.label}: must be a number.`;
      }
      const lo = num("min");
      const hi = num("max");
      if (lo !== null && n < lo) return `${def.label}: minimum is ${lo}.`;
      if (hi !== null && n > hi) return `${def.label}: maximum is ${hi}.`;
      return null;
    }
    case "boolean":
    case "toggle": {
      if (typeof raw !== "boolean") {
        return `${def.label}: must be true or false.`;
      }
      return null;
    }
    case "date": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        return `${def.label}: must be a date (YYYY-MM-DD).`;
      }
      return null;
    }
    case "select": {
      if (typeof raw !== "string") {
        return `${def.label}: must be one of the listed options.`;
      }
      if (def.options && def.options.length > 0 && !def.options.includes(raw)) {
        return `${def.label}: "${raw}" is not one of the allowed options.`;
      }
      return null;
    }
    case "multiselect": {
      if (!Array.isArray(raw)) {
        return `${def.label}: must be a list of options.`;
      }
      if (def.options && def.options.length > 0) {
        for (const item of raw) {
          if (typeof item !== "string" || !def.options.includes(item)) {
            return `${def.label}: "${String(item)}" is not one of the allowed options.`;
          }
        }
      }
      return null;
    }
    case "chips": {
      if (!Array.isArray(raw)) {
        return `${def.label}: must be a list of chips.`;
      }
      const maxItems = num("maxItems") ?? num("max_items");
      if (maxItems !== null && raw.length > maxItems) {
        return `${def.label}: at most ${maxItems} entries.`;
      }
      for (const item of raw) {
        if (typeof item !== "string" || item.trim() === "") {
          return `${def.label}: chip values must be non-empty text.`;
        }
      }
      return null;
    }
    default:
      // Unknown kind — accept; the catalog can extend over time.
      return null;
  }
}

export async function setTalentFieldValue(
  input: z.input<typeof setValueSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const { data: def } = await supabase
    .from("profile_field_definitions")
    .select("id, field_key, deprecated_at, kind, label, options, validation_rules")
    .eq("id", v.field_definition_id)
    .maybeSingle();
  if (!def) return { ok: false, error: "Unknown field." };
  if (def.deprecated_at !== null) {
    return { ok: false, error: "This field is no longer accepting input." };
  }

  // Validate: type-shape + validation_rules. Empty values go through
  // (delete branch above already handled them) — only validate non-empty.
  if (!isEmptyValue(v.value)) {
    const validationError = validateFieldValue(v.value, {
      kind: def.kind as string,
      label: def.label as string,
      options: (def.options as string[] | null) ?? null,
      rules: (def.validation_rules as Record<string, unknown> | null) ?? null,
    });
    if (validationError) {
      return { ok: false, error: validationError };
    }
  }

  if (isEmptyValue(v.value)) {
    const { error } = await supabase
      .from("talent_profile_field_values")
      .delete()
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("field_definition_id", v.field_definition_id);
    if (error) {
      logServerError("setTalentFieldValue.delete", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
    // Mirror delete to legacy field_values for bridged keys so Discover
    // (which still reads the old system) stays in sync.
    await mirrorWriteToLegacy(supabase, def.kind as string,
      v.talent_profile_id, def.field_key as string | undefined, null);
    return { ok: true };
  }

  const { error } = await supabase
    .from("talent_profile_field_values")
    .upsert(
      {
        tenant_id: tenantId,
        talent_profile_id: v.talent_profile_id,
        field_definition_id: v.field_definition_id,
        value: v.value,
        workflow_state: "live",
        last_edited_role: "admin",
      },
      {
        onConflict: "talent_profile_id,field_definition_id",
      },
    );

  if (error) {
    logServerError("setTalentFieldValue.upsert", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Mirror write to legacy field_values for any bridged key. Discover and
  // a few legacy surfaces still read the OLD tables; without this, edits
  // through the new editor would not appear there until full cutover.
  await mirrorWriteToLegacy(supabase, def.kind as string,
    v.talent_profile_id, def.field_key as string | undefined, v.value);

  return { ok: true };
}

// `mirrorWriteToLegacy` + `NEW_TO_OLD_KEY` were extracted to the shared
// module `@/lib/fields/legacy-mirror` (imported at the top of this file)
// so the talent self-edit path uses the SAME bridge. Behavior unchanged.

// ─── Visibility override (P1 #5 / A3) ─────────────────────────────────────
// Controls per-value visibility independent of the field definition's
// `default_visibility`. Allowed channels are the same set used by the
// public-profile reader: 'public' | 'agency' | 'private'. Passing an
// empty array clears the override (falls back to default_visibility).

const VISIBILITY_CHANNELS = ["public", "agency", "private"] as const;
type VisibilityChannel = (typeof VISIBILITY_CHANNELS)[number];

const setVisibilitySchema = z.object({
  talent_profile_id: pgUuidSchema(),
  field_definition_id: pgUuidSchema(),
  visibility: z
    .array(z.enum(VISIBILITY_CHANNELS))
    .max(VISIBILITY_CHANNELS.length),
});

export async function setTalentFieldVisibility(
  input: z.input<typeof setVisibilitySchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setVisibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // Empty array → clear override (NULL means "use default_visibility").
  // Any non-empty list overrides the default. Stored on the value row;
  // only takes effect when a value exists. Updating visibility on a
  // missing-value row is a no-op (deliberate — visibility-only rows
  // would clutter the table and have no rendering meaning).
  const visibilityToStore: VisibilityChannel[] | null =
    v.visibility.length === 0 ? null : (v.visibility as VisibilityChannel[]);

  const { error } = await supabase
    .from("talent_profile_field_values")
    .update({
      visibility_override: visibilityToStore,
    })
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("field_definition_id", v.field_definition_id);

  if (error) {
    logServerError("setTalentFieldVisibility", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

// ─── Read history (P4 #21 surface for audit / undo UX) ─────────────────────

export async function getTalentFieldValueHistory(input: {
  talent_profile_id: string;
  limit?: number;
}): Promise<
  | { ok: true; rows: TalentFieldHistoryRow[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  const { data, error } = await supabase
    .from("talent_profile_field_value_history")
    .select(
      `
      id, changed_at, operation, before_value, after_value,
      actor_user_id, actor_role,
      field_definition:profile_field_definitions!field_definition_id ( field_key, label )
    `,
    )
    .eq("talent_profile_id", input.talent_profile_id)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    logServerError("getTalentFieldValueHistory", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Actor email lookup is intentionally omitted — public.profiles only
  // exposes `id` to RLS-scoped reads. The history row carries actor_role
  // ("admin" / "talent" / "platform") which is enough for the audit UX
  // without leaking another user's email cross-tenant.

  type Row = {
    id: string;
    changed_at: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    before_value: unknown;
    after_value: unknown;
    actor_user_id: string | null;
    actor_role: string | null;
    field_definition:
      | { field_key: string | null; label: string | null }
      | { field_key: string | null; label: string | null }[]
      | null;
  };

  const rows: TalentFieldHistoryRow[] = ((data ?? []) as Row[]).map((r) => {
    const def = Array.isArray(r.field_definition)
      ? (r.field_definition[0] ?? null)
      : r.field_definition;
    return {
      id: r.id,
      changed_at: r.changed_at,
      operation: r.operation,
      field_key: def?.field_key ?? "(unknown)",
      field_label: def?.label ?? def?.field_key ?? "(unknown)",
      before_value: r.before_value,
      after_value: r.after_value,
      actor_role: r.actor_role,
      actor_email: null,
    };
  });

  return { ok: true, rows };
}
