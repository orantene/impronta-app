// profile-shell-dyn-field-values.roundtrip.test.ts
//
// T2.6 B-FIRST ROUND-TRIP REGRESSION GUARD (the T2.5c reviewer asked for this
// before the `shell` default was flipped to `b`).
//
// Drives the REAL `syncProfileShellDynFieldValues` (the shell write path shared
// by the admin roster shell + the talent self-edit shell) under BOTH write
// sources — A-first (`FIELD_ENGINE_WRITE_SOURCE=shell:a`, the prior behaviour /
// kill switch) and B-first (`shell:b`, the T2.6 activation) — over an in-memory
// fake Supabase, and asserts:
//
//   1. The value PERSISTED to canonical System B (`talent_profile_field_values`)
//      is BYTE-EQUIVALENT between A-first and B-first.
//   2. System A (`field_values`) is STILL mirrored in both modes (B-first via
//      the reverse `mirrorWriteToLegacy`), with the legacy vocabulary preserved.
//
// for a select, a number, and a delete-to-empty. A future refactor of
// `mirrorWriteToCanonical` / `mirrorWriteToLegacy` that breaks the round-trip
// (drifts B, or stops mirroring A) MUST fail this test in CI.
//
// No live prod write — the Supabase is fully faked (same spirit as
// write-source.test.ts / read-source.test.ts; modelled on the in-memory fake in
// booking-payouts-ledger.test.ts). Run:
//   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
//     npx tsx --test src/lib/field-engine/profile-shell-dyn-field-values.roundtrip.test.ts
//
// Wired into `npm run test:fields` (and thus `ci`).

import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { syncProfileShellDynFieldValues } from "@/lib/talent/profile-shell-dyn-field-values";

// ── Fixtures ──────────────────────────────────────────────────────────────────
//
// One bridged SELECT key (body_type → physical.body_type) and one bridged
// NUMBER key (years_experience → experience.years_total). Deliberately NOT
// height_cm (that key also mirrors a dedicated talent_profiles column, out of
// scope for this round-trip). The two catalogs use OPPOSITE vocabularies:
//   System A select option `value` = slug ("athletic")
//   System B select option label   = "Athletic"
// so a correct round-trip must translate slug→label going into B and
// label→slug coming back into A.

const TALENT_ID = "talent-0001";
const TENANT_ID = "tenant-aaaa";

// System A `field_definitions` rows (keyed by legacy key).
const A_DEFS = [
  {
    id: "adef-body_type",
    key: "body_type",
    value_type: "text",
    editable_by_staff: true,
    editable_by_talent: true,
    active: true,
    archived_at: null as string | null,
    label_en: "Body type",
    config: {
      input: "select",
      options: [
        { value: "athletic", label_en: "Athletic" },
        { value: "curvy", label_en: "Curvy" },
      ],
    },
  },
  {
    id: "adef-years_experience",
    key: "years_experience",
    value_type: "number",
    editable_by_staff: true,
    editable_by_talent: true,
    active: true,
    archived_at: null as string | null,
    label_en: "Years experience",
    config: null as Record<string, unknown> | null,
  },
];

// System B `profile_field_definitions` rows (keyed by canonical field_key).
const B_DEFS = [
  {
    id: "bdef-body_type",
    field_key: "physical.body_type",
    kind: "select",
    options: ["Athletic", "Curvy"],
  },
  {
    id: "bdef-years_total",
    field_key: "experience.years_total",
    kind: "number",
    options: null as unknown,
  },
];

type ValueRow = {
  talent_profile_id: string;
  field_definition_id: string;
  value_text?: unknown;
  value_number?: unknown;
  value_boolean?: unknown;
  value_date?: unknown;
  [k: string]: unknown;
};

type CanonicalRow = {
  talent_profile_id: string;
  field_definition_id: string;
  value: unknown;
  [k: string]: unknown;
};

type Store = {
  fieldValues: ValueRow[]; // System A
  canonical: CanonicalRow[]; // System B
};

function newStore(): Store {
  return { fieldValues: [], canonical: [] };
}

// ── In-memory fake Supabase ──────────────────────────────────────────────────
//
// Implements ONLY the query shapes the shell write path + the two mirror
// helpers exercise. Each `.from(table)` returns a fresh chainable builder; an
// unrecognised filter/op throws so the test fails loud rather than silently
// no-op'ing (a real refactor that changes the query shape should be noticed).

function makeSupabase(store: Store): SupabaseClient {
  function builder(table: string) {
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let op: "select" | "delete" | "upsert" | null = null;
    let upsertRow: Record<string, unknown> | null = null;
    let limitOne = false;

    const chain: Record<string, unknown> = {
      select() {
        op = "select";
        return chain;
      },
      eq(col: string, val: unknown) {
        eqs.push([col, val]);
        return chain;
      },
      in(col: string, vals: unknown[]) {
        ins.push([col, vals]);
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        limitOne = true;
        return chain;
      },
      delete() {
        op = "delete";
        return chain;
      },
      upsert(row: Record<string, unknown>) {
        op = "upsert";
        upsertRow = row;
        return runUpsert();
      },
      maybeSingle() {
        return runSelect(true);
      },
      then(resolve: (v: unknown) => void) {
        // Awaited without .maybeSingle() → list select OR terminal delete.
        if (op === "delete") return resolve(runDelete());
        return resolve(runSelect(false));
      },
    };

    function matches(row: Record<string, unknown>): boolean {
      for (const [c, v] of eqs) if (row[c] !== v) return false;
      for (const [c, vals] of ins) if (!vals.includes(row[c] as never)) return false;
      return true;
    }

    function runSelect(single: boolean): { data: unknown; error: null } {
      let rows: Array<Record<string, unknown>> = [];
      if (table === "field_definitions") {
        rows = A_DEFS.filter((d) => matches(d as unknown as Record<string, unknown>));
      } else if (table === "profile_field_definitions") {
        rows = B_DEFS.filter((d) => matches(d as unknown as Record<string, unknown>));
      } else if (table === "agency_talent_roster") {
        // The roster lookup the mirror uses to resolve tenant_id.
        const all = [{ tenant_id: TENANT_ID, created_at: "2026-01-01", talent_profile_id: TALENT_ID, status: "active" }];
        rows = all.filter((r) => matches(r));
      } else if (table === "field_values") {
        rows = store.fieldValues.filter((r) => matches(r as Record<string, unknown>));
      } else if (table === "talent_profile_field_values") {
        rows = store.canonical.filter((r) => matches(r as Record<string, unknown>));
      } else {
        // Any OTHER table is read only by the deferred, fire-and-forget AI
        // search-document rebuild (`scheduleRebuildAiSearchDocument`), which runs
        // detached after the write path returns and swallows its own errors.
        // Return empty rather than throw so that out-of-band read produces no
        // noisy stderr — the write path under test never selects these tables.
        // (delete/upsert on an unknown table still throws below — a real
        // write-path query-shape change must be noticed.)
        rows = [];
      }
      void limitOne;
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    function runDelete(): { data: null; error: null } {
      const target = table === "field_values" ? store.fieldValues : table === "talent_profile_field_values" ? store.canonical : null;
      if (!target) throw new Error(`fake supabase: unexpected delete table ${table}`);
      for (let i = target.length - 1; i >= 0; i--) {
        if (matches(target[i] as Record<string, unknown>)) target.splice(i, 1);
      }
      return { data: null, error: null };
    }

    function runUpsert(): Promise<{ data: null; error: null }> {
      const row = upsertRow as Record<string, unknown>;
      const key = (r: Record<string, unknown>) =>
        `${r.talent_profile_id}::${r.field_definition_id}`;
      const target =
        table === "field_values"
          ? (store.fieldValues as Array<Record<string, unknown>>)
          : table === "talent_profile_field_values"
            ? (store.canonical as Array<Record<string, unknown>>)
            : null;
      if (!target) throw new Error(`fake supabase: unexpected upsert table ${table}`);
      const idx = target.findIndex((r) => key(r) === key(row));
      if (idx >= 0) target[idx] = { ...target[idx], ...row };
      else target.push({ ...row });
      return Promise.resolve({ data: null, error: null });
    }

    return chain;
  }

  return { from: (table: string) => builder(table) } as unknown as SupabaseClient;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function withFlag<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.FIELD_ENGINE_WRITE_SOURCE;
  process.env.FIELD_ENGINE_WRITE_SOURCE = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.FIELD_ENGINE_WRITE_SOURCE;
    else process.env.FIELD_ENGINE_WRITE_SOURCE = prev;
  }
}

/** Run the shell sync under one write source against a fresh store; return the
 *  resulting (A, B) value snapshots for the two bridged keys. */
async function runShell(
  source: "a" | "b",
  dynFields: Record<string, string | string[]>,
  seed?: (store: Store) => void,
): Promise<{ ok: boolean; store: Store; aOf: (legacyKey: string) => ValueRow | undefined; bOf: (newKey: string) => CanonicalRow | undefined }> {
  const store = newStore();
  seed?.(store);
  const supabase = makeSupabase(store);
  const res = await withFlag(`shell:${source}`, () =>
    syncProfileShellDynFieldValues(supabase, TALENT_ID, dynFields, "staff"),
  );
  const aDefId = (legacyKey: string) => A_DEFS.find((d) => d.key === legacyKey)?.id;
  const bDefId = (newKey: string) => B_DEFS.find((d) => d.field_key === newKey)?.id;
  return {
    ok: res.ok,
    store,
    aOf: (legacyKey) => store.fieldValues.find((r) => r.field_definition_id === aDefId(legacyKey)),
    bOf: (newKey) => store.canonical.find((r) => r.field_definition_id === bDefId(newKey)),
  };
}

// ── The round-trip parity assertions ──────────────────────────────────────────

test("round-trip: SELECT — B-persisted value is byte-equivalent A-first vs B-first, and A stays mirrored", async () => {
  // User submits the legacy slug; both modes must land B="Athletic", A="athletic".
  const dyn = { body_type: "athletic" };

  const a = await runShell("a", dyn);
  const b = await runShell("b", dyn);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);

  // (1) Canonical System B value is byte-equivalent across the two write orders.
  assert.equal(a.bOf("physical.body_type")?.value, "Athletic");
  assert.equal(b.bOf("physical.body_type")?.value, a.bOf("physical.body_type")?.value);

  // (2) System A is STILL mirrored in both modes, in A's own (slug) vocabulary.
  assert.equal(a.aOf("body_type")?.value_text, "athletic");
  assert.equal(b.aOf("body_type")?.value_text, a.aOf("body_type")?.value_text);
});

test("round-trip: NUMBER — B-persisted value is byte-equivalent A-first vs B-first, and A stays mirrored", async () => {
  const dyn = { years_experience: "7" };

  const a = await runShell("a", dyn);
  const b = await runShell("b", dyn);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);

  // (1) Canonical System B value byte-equivalent (number 7, not "7").
  assert.equal(a.bOf("experience.years_total")?.value, 7);
  assert.equal(b.bOf("experience.years_total")?.value, a.bOf("experience.years_total")?.value);

  // (2) System A number column mirrored identically in both modes.
  assert.equal(a.aOf("years_experience")?.value_number, 7);
  assert.equal(b.aOf("years_experience")?.value_number, a.aOf("years_experience")?.value_number);
});

test("round-trip: DELETE-TO-EMPTY — clears B and A identically A-first vs B-first", async () => {
  // Seed an existing value in BOTH stores, then submit empty → both rows cleared.
  const seed = (store: Store) => {
    store.fieldValues.push({
      talent_profile_id: TALENT_ID,
      field_definition_id: "adef-body_type",
      value_text: "athletic",
    });
    store.canonical.push({
      talent_profile_id: TALENT_ID,
      field_definition_id: "bdef-body_type",
      value: "Athletic",
    });
  };
  const dyn = { body_type: "" };

  const a = await runShell("a", dyn, seed);
  const b = await runShell("b", dyn, seed);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);

  // (1) Canonical System B row deleted in both modes (byte-equivalent: absent).
  assert.equal(a.bOf("physical.body_type"), undefined);
  assert.equal(b.bOf("physical.body_type"), undefined);

  // (2) System A row also cleared in both modes (B-first via the reverse mirror).
  assert.equal(a.aOf("body_type"), undefined);
  assert.equal(b.aOf("body_type"), undefined);
});
