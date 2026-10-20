/**
 * Dependency order for the plan (pure). A row may only be inserted after every planned row it references through a foreign key, and
 * cleanup (the reverse of this order) deletes children first. Each plan builder is written in a valid order; `orderOps` is the
 * safety net the runner relies on, and `forwardReferences` is what the unit test uses to keep the builders honest.
 *
 * Every deterministic id is unique, so a string column that equals another planned row's id IS a reference. The only id-valued
 * columns that are NOT foreign keys are listed in NOT_FK: they never create a dependency (so the stock-pool case, where the pool
 * must exist before the offering that points at it and the pool's own subject_id has no FK, cannot form a cycle).
 */

export const NOT_FK = new Set([
  "public.capacity_pools.subject_id", // polymorphic: offering / session / space / space_group, no constraint
  "public.offering_price_phases.variant_id", // plain uuid, no constraint
]);

const isId = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Index of the op that creates each id (insert / clone / authUser). */
function creators(ops) {
  const m = new Map();
  ops.forEach((op, i) => {
    if (op.id && op.kind !== "update" && op.kind !== "pin" && !m.has(op.id)) m.set(op.id, i);
  });
  return m;
}

/** For each op index, the creator indexes it needs first. */
export function dependencies(ops) {
  const made = creators(ops);
  return ops.map((op, i) => {
    const deps = new Set();
    if (op.kind === "update" || op.kind === "pin") {
      const c = made.get(op.id);
      if (c !== undefined && c !== i) deps.add(c);
      if (op.userId && made.has(op.userId)) deps.add(made.get(op.userId));
    }
    for (const [col, v] of Object.entries(op.row ?? {})) {
      if (NOT_FK.has(`${op.table}.${col}`) || !isId(v) || v === op.id) continue;
      const c = made.get(v);
      if (c !== undefined && c !== i) deps.add(c);
    }
    return [...deps];
  });
}

/** Forward references in the order as written: [{ at, key, needs }] where `needs` is created LATER (or never ordered before). */
export function forwardReferences(ops) {
  const deps = dependencies(ops);
  const out = [];
  deps.forEach((list, i) => {
    for (const c of list) if (c > i) out.push({ at: i, key: ops[i].key, table: ops[i].table, needs: ops[c].key, needsTable: ops[c].table });
  });
  return out;
}

/** Stable topological order: keeps the written order wherever it is already valid. Throws on a cycle. */
export function orderOps(ops) {
  const deps = dependencies(ops);
  const placed = new Array(ops.length).fill(false);
  const out = [];
  const visiting = new Set();
  const place = (i) => {
    if (placed[i]) return;
    if (visiting.has(i)) throw new Error(`dependency cycle at ${ops[i].table} ${ops[i].key}`);
    visiting.add(i);
    for (const d of deps[i]) place(d);
    visiting.delete(i);
    placed[i] = true;
    out.push(ops[i]);
  };
  for (let i = 0; i < ops.length; i += 1) place(i);
  return out;
}
