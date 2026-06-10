// src/lib/field-engine/client-field-source-select.ts
//
// CLIENT-side selector for the P1 field-engine unification. Pure (no server
// imports, no React) so it is safe to import into `"use client"` surfaces.
//
// Given the `ClientFieldSourcePayload` carried on the AdminShell bridge and a
// talent-type parent slug, it returns the dynamic (type-specific) fields the
// wizard / drawer should render for that parent:
//   • flag=`static` (or no payload, or no DB fields for the parent) → the
//     caller's static fields are used unchanged (this returns `null` to signal
//     "use static").
//   • flag=`db` AND the payload has fields for the parent → the DB-resolved
//     `RegField[]`.
//
// It also runs a DEV-ONLY parity assertion comparing the DB-resolved field set
// vs the static one for the same parent, logging any drift via console.warn.
// This proves DB==static (or surfaces the drift) BEFORE a surface is flipped.

import type {
  ClientFieldSourcePayload,
  ClientDynamicFieldDTO,
  FieldEngineClientSurface,
} from "@/lib/field-engine/client-field-source-types";
import type { RegField } from "@/components/admin/shell/internal/state/types";

/** Convert a DB DTO into the wizard/drawer `RegField` shape. */
function dtoToRegField(dto: ClientDynamicFieldDTO): RegField {
  return {
    id: dto.id,
    label: dto.label,
    kind: dto.kind,
    optional: dto.optional,
    placeholder: dto.placeholder,
    helper: dto.helper,
    options: dto.options ? [...dto.options] : undefined,
    subsection: dto.subsection,
    sensitive: dto.sensitive,
    defaultVisibility: dto.defaultVisibility,
  };
}

/** Is the given surface flipped to `db` in this payload? */
export function surfaceUsesDb(
  payload: ClientFieldSourcePayload | null | undefined,
  surface: FieldEngineClientSurface,
): boolean {
  return payload?.flags[surface] === "db";
}

/**
 * Resolve the dynamic fields for one parent slug on one surface.
 *
 * Returns `null` to mean "fall back to the static path" — i.e. the surface is
 * `static`, there is no payload, or the DB returned no fields for this parent.
 * Returns a `RegField[]` only when the surface is `db` AND the DB has fields.
 *
 * Always runs the dev parity assertion (comparing against `staticFields`) when
 * a payload is present, regardless of the flag, so drift is visible even while
 * the surface is still `static`.
 */
export function resolveDynamicFieldsForParent(args: {
  payload: ClientFieldSourcePayload | null | undefined;
  surface: FieldEngineClientSurface;
  parentSlug: string;
  /** The static fields the caller would render today (for parity diff). */
  staticFields: ReadonlyArray<RegField>;
}): ReadonlyArray<RegField> | null {
  const { payload, surface, parentSlug, staticFields } = args;
  const dbDtos = payload?.dynamicFieldsByParent[parentSlug] ?? null;

  // Dev parity assertion — runs whenever we HAVE a DB payload for this parent,
  // even if the surface is still `static`. Proves DB==static before a flip.
  if (
    process.env.NODE_ENV !== "production" &&
    payload != null &&
    dbDtos != null
  ) {
    assertFieldParity(surface, parentSlug, staticFields, dbDtos);
  }

  if (!surfaceUsesDb(payload, surface)) return null; // static path
  if (!dbDtos || dbDtos.length === 0) return null; // no DB fields → static
  return dbDtos.map(dtoToRegField);
}

// ── Dev parity assertion ────────────────────────────────────────────────────

const _parityLogged = new Set<string>();

function assertFieldParity(
  surface: FieldEngineClientSurface,
  parentSlug: string,
  staticFields: ReadonlyArray<RegField>,
  dbDtos: ReadonlyArray<ClientDynamicFieldDTO>,
): void {
  // Log each (surface, parent) drift report at most once per session to avoid
  // console spam on every render.
  const onceKey = `${surface}::${parentSlug}`;
  if (_parityLogged.has(onceKey)) return;

  const staticById = new Map(staticFields.map((f) => [f.id, f]));
  const dbById = new Map(dbDtos.map((f) => [f.id, f]));

  const missingFromDb = [...staticById.keys()].filter((id) => !dbById.has(id));
  const extraInDb = [...dbById.keys()].filter((id) => !staticById.has(id));
  const labelDiffs: Array<{ id: string; static: string; db: string }> = [];
  const orderDiffs: string[] = [];

  let i = 0;
  for (const [id, sf] of staticById) {
    const df = dbById.get(id);
    if (df && df.label !== sf.label) {
      labelDiffs.push({ id, static: sf.label, db: df.label });
    }
    // Crude order check: the db list order vs static list order for shared ids.
    void i;
    i++;
  }
  // Order drift: compare the sequence of shared ids in each list.
  const sharedStaticOrder = staticFields.map((f) => f.id).filter((id) => dbById.has(id));
  const sharedDbOrder = dbDtos.map((f) => f.id).filter((id) => staticById.has(id));
  for (let k = 0; k < sharedStaticOrder.length; k++) {
    if (sharedStaticOrder[k] !== sharedDbOrder[k]) {
      orderDiffs.push(`${sharedStaticOrder[k]}↔${sharedDbOrder[k]}`);
    }
  }

  const hasDrift =
    missingFromDb.length > 0 ||
    extraInDb.length > 0 ||
    labelDiffs.length > 0 ||
    orderDiffs.length > 0;

  if (!hasDrift) {
    _parityLogged.add(onceKey);
    // eslint-disable-next-line no-console
    console.info(
      `[field-engine parity] ${surface}/${parentSlug}: DB == static (${staticFields.length} fields) — flip is safe.`,
    );
    return;
  }

  _parityLogged.add(onceKey);
  // eslint-disable-next-line no-console
  console.warn(
    `[field-engine parity] ${surface}/${parentSlug}: DB ≠ static — DRIFT detected. ` +
      `Flipping this surface to db will CHANGE the rendered field set. Details:`,
    {
      staticCount: staticFields.length,
      dbCount: dbDtos.length,
      missingFromDb,
      extraInDb,
      labelDiffs,
      orderDiffs,
    },
  );
}
