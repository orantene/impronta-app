/**
 * supabase/ci/verify-schema.ts — does the replayed schema match production?
 *
 * WHY THIS EXISTS
 *   `apply-migrations.sh` proves the 859 migrations *apply*. It does not prove
 *   the result is production's schema: a shim that quietly papered over a real
 *   difference would still give a green replay. This script closes that gap
 *   without production credentials, by diffing the built database against
 *   `web/src/lib/supabase/database.types.ts` — a file generated FROM production
 *   by `supabase gen types`, and therefore the one production-derived artefact
 *   that is already committed to this repo.
 *
 * WHAT IT COMPARES
 *   - every table in the types file exists, with the same columns, the same
 *     nullability and a compatible type;
 *   - every view in the types file exists with the same columns (views are
 *     emitted all-nullable by the generator, so nullability is not compared);
 *   - every enum has the same values, in the same order;
 *   - every function named in the types file exists with a compatible
 *     signature (an overload whose named arguments match).
 *
 *   MISSING or MISMATCHED objects are failures. EXTRA objects in the database
 *   are reported separately and are not failures: the CI bootstrap adds a few
 *   (Supabase-managed stand-ins), and the types file only covers what PostgREST
 *   exposes.
 *
 * USAGE
 *   eval "$(bash supabase/ci/local-postgres.sh env)"
 *   node supabase/ci/verify-schema.ts                      # Node >= 22.18 strips types
 *   web/node_modules/.bin/tsx supabase/ci/verify-schema.ts  # or through tsx
 *
 *   Connection: standard libpq env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/
 *   PGDATABASE), or DATABASE_URL. Exit 0 when there are no failures, 1 otherwise.
 *   --json prints the machine-readable report instead of the tables.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TYPES_FILE = resolve(HERE, '../../web/src/lib/supabase/database.types.ts')

// `supabase/ci/` deliberately has no package.json of its own — this is CI
// scaffolding, not a workspace. `typescript` and `pg` are already dependencies
// of `web/`, so resolve them from there no matter where the script is invoked;
// VERIFY_SCHEMA_DEPS points at any other directory holding a node_modules with
// the two (CI installs them without building all of `web/`).
function load<T>(name: string): T {
  const roots = [
    process.env.VERIFY_SCHEMA_DEPS && resolve(process.env.VERIFY_SCHEMA_DEPS, 'package.json'),
    resolve(HERE, '../../web/package.json'),
    resolve(HERE, 'package.json'),
  ].filter((r): r is string => !!r)
  const tried: string[] = []
  for (const root of roots) {
    try {
      return createRequire(root)(name) as T
    } catch {
      tried.push(root)
    }
  }
  throw new Error(
    `verify-schema: cannot resolve "${name}". Looked from: ${tried.join(', ')}. ` +
      `Run \`npm ci\` in web/, or set VERIFY_SCHEMA_DEPS to a directory whose ` +
      `node_modules has typescript and pg.`,
  )
}

const ts = load<typeof import('typescript')>('typescript')
const { Client } = load<typeof import('pg')>('pg')

// ─────────────────────────────────────────────────────────────────────────────
// Allow-list
//
// The types file is a snapshot: it was generated from production at one moment,
// and migrations merged after that moment legitimately move the database away
// from it. An entry here says "the database is right and the types file is
// stale", and it is only admissible with the migration that proves it — the
// migration must be NEWER than the types snapshot and must be the thing that
// caused this exact difference. Anything else is a failure, not an allow-list
// entry.
//
// kind: 'table' | 'view' | 'column' | 'nullability' | 'type' | 'enum' | 'function'
// ─────────────────────────────────────────────────────────────────────────────
type AllowEntry = {
  kind: string
  object: string
  column?: string
  reason: string
}

const ALLOWLIST: AllowEntry[] = [
  {
    kind: 'nullability',
    object: 'profiles',
    column: 'app_role',
    reason:
      'database.types.ts says NOT NULL; the replay makes it NULLABLE, and the replay is right. ' +
      '20260911022138_onboarding_rpcs_pass_profile_self_update_guard.sql states in its own header: ' +
      '"D-110 (found applying this file to production on 2026-09-11): production never ran ' +
      '20260408113000 / 20260408150000 although its ledger records them. There profiles.app_role is ' +
      'still NOT NULL DEFAULT \'client\' ... the column is brought to that shape here" — and it then ' +
      'runs ALTER COLUMN app_role DROP DEFAULT, DROP NOT NULL. So NOT NULL is precisely the state that ' +
      'migration exists to end, and the snapshot (last regenerated 2026-09-17, commit cb3a89e9) predates ' +
      'its effect on production. Two migrations in the history drop the NOT NULL and none adds it back, ' +
      'so no replay of this repo can produce NOT NULL: reproducing the types file here would mean ' +
      'ignoring a migration.',
  },
]

function allowed(kind: string, object: string, column?: string): AllowEntry | undefined {
  return ALLOWLIST.find(
    (a) => a.kind === kind && a.object === object && (a.column ?? null) === (column ?? null),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Parse database.types.ts
// ─────────────────────────────────────────────────────────────────────────────

/** A column type reduced to the shape the generator can express. */
type TsType =
  | { k: 'string' }
  | { k: 'number' }
  | { k: 'boolean' }
  | { k: 'json' }
  | { k: 'enum'; name: string }
  | { k: 'unknown'; text: string }
  | { k: 'array'; of: TsType }

type TsColumn = { name: string; type: TsType; nullable: boolean }
type TsRelation = { name: string; columns: TsColumn[] }
type TsFunction = { name: string; overloads: { args: string[] }[] }

function tsTypeToString(t: TsType): string {
  switch (t.k) {
    case 'array':
      return `${tsTypeToString(t.of)}[]`
    case 'enum':
      return `enum ${t.name}`
    case 'unknown':
      return t.text
    default:
      return t.k
  }
}

function parseTypeNode(node: ts.TypeNode, src: ts.SourceFile): { type: TsType; nullable: boolean } {
  let nullable = false
  let members: ts.TypeNode[] = [node]

  if (ts.isUnionTypeNode(node)) {
    members = []
    for (const m of node.types) {
      if (m.kind === ts.SyntaxKind.NullKeyword || (ts.isLiteralTypeNode(m) && m.literal.kind === ts.SyntaxKind.NullKeyword)) {
        nullable = true
      } else {
        members.push(m)
      }
    }
  }

  if (members.length !== 1) {
    return { type: { k: 'unknown', text: members.map((m) => m.getText(src)).join(' | ') }, nullable }
  }
  return { type: parseSingleType(members[0], src), nullable }
}

function parseSingleType(node: ts.TypeNode, src: ts.SourceFile): TsType {
  if (ts.isArrayTypeNode(node)) return { k: 'array', of: parseSingleType(node.elementType, src) }
  if (ts.isParenthesizedTypeNode(node)) return parseSingleType(node.type, src)

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { k: 'string' }
    case ts.SyntaxKind.NumberKeyword:
      return { k: 'number' }
    case ts.SyntaxKind.BooleanKeyword:
      return { k: 'boolean' }
  }

  // Database["public"]["Enums"]["pricing_unit"]
  if (ts.isIndexedAccessTypeNode(node)) {
    const text = node.getText(src)
    const m = /\["Enums"\]\["([A-Za-z0-9_]+)"\]/.exec(text)
    if (m) return { k: 'enum', name: m[1] }
    // Database["public"]["Tables"]["x"]["Row"] etc. — a composite return, not a column.
    return { k: 'unknown', text }
  }

  if (ts.isTypeReferenceNode(node) && node.typeName.getText(src) === 'Json') return { k: 'json' }

  return { k: 'unknown', text: node.getText(src) }
}

function membersOf(node: ts.TypeNode | undefined): ts.TypeElement[] {
  if (!node || !ts.isTypeLiteralNode(node)) return []
  return [...node.members]
}

function propName(m: ts.TypeElement): string | undefined {
  if (!m.name) return undefined
  if (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) return m.name.text
  return undefined
}

function findProp(members: ts.TypeElement[], name: string): ts.PropertySignature | undefined {
  for (const m of members) {
    if (ts.isPropertySignature(m) && propName(m) === name) return m
  }
  return undefined
}

function parseRelations(node: ts.TypeNode | undefined, src: ts.SourceFile): TsRelation[] {
  const out: TsRelation[] = []
  for (const m of membersOf(node)) {
    const name = propName(m)
    if (!name || !ts.isPropertySignature(m) || !m.type) continue
    const row = findProp(membersOf(m.type), 'Row')
    if (!row?.type) continue
    const columns: TsColumn[] = []
    for (const c of membersOf(row.type)) {
      const cname = propName(c)
      if (!cname || !ts.isPropertySignature(c) || !c.type) continue
      const { type, nullable } = parseTypeNode(c.type, src)
      columns.push({ name: cname, type, nullable: nullable || !!c.questionToken })
    }
    out.push({ name, columns })
  }
  return out
}

function parseEnums(node: ts.TypeNode | undefined, src: ts.SourceFile): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of membersOf(node)) {
    const name = propName(m)
    if (!name || !ts.isPropertySignature(m) || !m.type) continue
    const values: string[] = []
    const collect = (t: ts.TypeNode) => {
      if (ts.isUnionTypeNode(t)) return t.types.forEach(collect)
      if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) values.push(t.literal.text)
    }
    collect(m.type)
    if (values.length) out.set(name, values)
  }
  return out
}

function parseFunctions(node: ts.TypeNode | undefined, src: ts.SourceFile): TsFunction[] {
  const out: TsFunction[] = []
  for (const m of membersOf(node)) {
    const name = propName(m)
    if (!name || !ts.isPropertySignature(m) || !m.type) continue
    const overloadNodes: ts.TypeNode[] = ts.isUnionTypeNode(m.type) ? [...m.type.types] : [m.type]
    const overloads: { args: string[] }[] = []
    for (const o of overloadNodes) {
      const argsProp = findProp(membersOf(o), 'Args')
      if (!argsProp?.type) continue
      // `Args: never` (no arguments) or `Args: { a: string; b?: number }`
      if (argsProp.type.kind === ts.SyntaxKind.NeverKeyword) {
        overloads.push({ args: [] })
        continue
      }
      const argNodes = ts.isUnionTypeNode(argsProp.type) ? [...argsProp.type.types] : [argsProp.type]
      for (const a of argNodes) {
        const args = membersOf(a)
          .map(propName)
          .filter((x): x is string => !!x)
        overloads.push({ args })
      }
    }
    if (!overloads.length) overloads.push({ args: [] })
    out.push({ name, overloads })
  }
  return out
}

function parseTypesFile() {
  const text = readFileSync(TYPES_FILE, 'utf8')
  const src = ts.createSourceFile(TYPES_FILE, text, ts.ScriptTarget.Latest, true)

  let publicSchema: ts.TypeNode | undefined
  for (const stmt of src.statements) {
    if (!ts.isTypeAliasDeclaration(stmt) || stmt.name.text !== 'Database') continue
    const pub = findProp(membersOf(stmt.type), 'public')
    publicSchema = pub?.type
  }
  if (!publicSchema) throw new Error(`could not find Database["public"] in ${TYPES_FILE}`)

  const m = membersOf(publicSchema)
  return {
    tables: parseRelations(findProp(m, 'Tables')?.type, src),
    views: parseRelations(findProp(m, 'Views')?.type, src),
    enums: parseEnums(findProp(m, 'Enums')?.type, src),
    functions: parseFunctions(findProp(m, 'Functions')?.type, src),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Introspect the database
// ─────────────────────────────────────────────────────────────────────────────

type DbColumn = { name: string; notNull: boolean; udt: string; dims: number; typtype: string }
type DbRelation = { name: string; kind: string; columns: Map<string, DbColumn> }

const RELATIONS_SQL = `
select c.relname                                as table_name,
       c.relkind                                as relkind,
       a.attname                                as column_name,
       a.attnotnull                             as not_null,
       a.attnum                                 as ordinal,
       coalesce(et.typname, t.typname)          as udt,
       coalesce(et.typtype, t.typtype)          as typtype,
       case when t.typcategory = 'A' then greatest(a.attndims, 1) else 0 end as dims
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type  t on t.oid = a.atttypid
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
 where n.nspname = 'public'
   and c.relkind in ('r','p','v','m')
 order by c.relname, a.attnum;`

const ENUMS_SQL = `
select t.typname as name, e.enumlabel as value
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
 where n.nspname = 'public' and t.typtype = 'e'
 order by t.typname, e.enumsortorder;`

const FUNCTIONS_SQL = `
select p.proname as name,
       coalesce(
         (select array_agg(x.argname order by x.ord)
            from unnest(
                   coalesce(p.proargnames, '{}'::text[]),
                   coalesce(p.proargmodes, array_fill('i'::"char", array[coalesce(array_length(p.proargnames,1),0)]))
                 ) with ordinality as x(argname, argmode, ord)
           where x.argmode in ('i','b','v')),
         '{}'::text[]
       ) as arg_names,
       pg_get_function_identity_arguments(p.oid) as identity_args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind in ('f','a','w')
 order by p.proname;`

async function introspect(client: Client) {
  const rels = new Map<string, DbRelation>()
  for (const r of (await client.query(RELATIONS_SQL)).rows) {
    let rel = rels.get(r.table_name)
    if (!rel) {
      rel = { name: r.table_name, kind: r.relkind, columns: new Map() }
      rels.set(r.table_name, rel)
    }
    rel.columns.set(r.column_name, {
      name: r.column_name,
      notNull: r.not_null,
      udt: r.udt,
      dims: Number(r.dims),
      typtype: r.typtype,
    })
  }

  const enums = new Map<string, string[]>()
  for (const r of (await client.query(ENUMS_SQL)).rows) {
    if (!enums.has(r.name)) enums.set(r.name, [])
    enums.get(r.name)!.push(r.value)
  }

  const functions = new Map<string, { args: string[]; identity: string }[]>()
  for (const r of (await client.query(FUNCTIONS_SQL)).rows) {
    if (!functions.has(r.name)) functions.set(r.name, [])
    functions.get(r.name)!.push({ args: r.arg_names ?? [], identity: r.identity_args })
  }

  return { rels, enums, functions }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Type compatibility
// ─────────────────────────────────────────────────────────────────────────────

/** How `supabase gen types` maps a PostgreSQL base type to TypeScript. */
const PG_TO_TS: Record<string, TsType['k']> = {
  // textual
  text: 'string', varchar: 'string', bpchar: 'string', char: 'string', name: 'string',
  citext: 'string', uuid: 'string', bytea: 'string', inet: 'string', cidr: 'string',
  macaddr: 'string', macaddr8: 'string', xml: 'string', money: 'string',
  // temporal
  timestamp: 'string', timestamptz: 'string', date: 'string', time: 'string',
  timetz: 'string', interval: 'string',
  // numeric
  int2: 'number', int4: 'number', int8: 'number', numeric: 'number',
  float4: 'number', float8: 'number', oid: 'number',
  // boolean / json
  bool: 'boolean', json: 'json', jsonb: 'json',
}

function dbTypeToTs(col: DbColumn): TsType {
  let base: TsType
  if (col.typtype === 'e') {
    base = { k: 'enum', name: col.udt }
  } else {
    const mapped = PG_TO_TS[col.udt]
    base = mapped ? ({ k: mapped } as TsType) : { k: 'unknown', text: col.udt }
  }
  for (let i = 0; i < col.dims; i++) base = { k: 'array', of: base }
  return base
}

function typesCompatible(expected: TsType, actual: TsType): boolean {
  // `unknown` on either side means the generator (or this script's type map)
  // could not name the type. Nothing can be proven, so nothing is claimed.
  if (expected.k === 'unknown' || actual.k === 'unknown') return true
  if (expected.k === 'array' || actual.k === 'array') {
    return expected.k === 'array' && actual.k === 'array' && typesCompatible(expected.of, actual.of)
  }
  // An enum column must be THAT enum. `string` does not satisfy it: the types
  // file names the enum everywhere production has one, in views as well as
  // tables, so a text column where production has an enum is a real difference.
  if (expected.k === 'enum' || actual.k === 'enum') {
    return expected.k === 'enum' && actual.k === 'enum' && expected.name === actual.name
  }
  return expected.k === actual.k
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Diff
// ─────────────────────────────────────────────────────────────────────────────

type Finding = { severity: 'FAIL' | 'ALLOWED'; kind: string; object: string; detail: string }

async function main() {
  const wantJson = process.argv.includes('--json')
  const expected = parseTypesFile()

  const client = new Client(
    process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
  )
  await client.connect()
  const db = await introspect(client)
  await client.end()

  const findings: Finding[] = []
  const extras: { kind: string; object: string }[] = []
  const unverifiable: string[] = []

  const push = (kind: string, object: string, detail: string, column?: string) => {
    const a = allowed(kind, object, column)
    findings.push({
      severity: a ? 'ALLOWED' : 'FAIL',
      kind,
      object: column ? `${object}.${column}` : object,
      detail: a ? `${detail}  [allowed: ${a.reason}]` : detail,
    })
  }

  // ── relations ────────────────────────────────────────────────────────────
  const seenRelations = new Set<string>()
  for (const [label, list] of [
    ['table', expected.tables],
    ['view', expected.views],
  ] as const) {
    for (const rel of list) {
      seenRelations.add(rel.name)
      const actual = db.rels.get(rel.name)
      if (!actual) {
        push(label, rel.name, 'MISSING — present in database.types.ts, absent from the built database')
        continue
      }
      for (const col of rel.columns) {
        const ac = actual.columns.get(col.name)
        if (!ac) {
          push('column', rel.name, `MISSING column "${col.name}" (${tsTypeToString(col.type)})`, col.name)
          continue
        }
        const actualType = dbTypeToTs(ac)
        if (!typesCompatible(col.type, actualType)) {
          push(
            'type',
            rel.name,
            `column "${col.name}": types says ${tsTypeToString(col.type)}, database has ${tsTypeToString(actualType)} (${ac.udt})`,
            col.name,
          )
        } else if (col.type.k === 'unknown' || actualType.k === 'unknown') {
          unverifiable.push(`${rel.name}.${col.name} (${ac.udt})`)
        }
        // The generator emits every view column as nullable, so a view's
        // nullability carries no information and is not compared.
        //
        // Nor does a column the generator typed `unknown` (inet, tsvector,
        // vector, …): TypeScript collapses `unknown | null` to `unknown`, so
        // the snapshot simply does not record whether it was nullable.
        if (label === 'table' && col.type.k !== 'unknown' && col.nullable !== !ac.notNull) {
          push(
            'nullability',
            rel.name,
            `column "${col.name}": types says ${col.nullable ? 'NULLABLE' : 'NOT NULL'}, database has ${ac.notNull ? 'NOT NULL' : 'NULLABLE'}`,
            col.name,
          )
        }
      }
    }
  }
  for (const name of db.rels.keys()) {
    if (!seenRelations.has(name)) extras.push({ kind: 'relation', object: name })
  }

  // ── enums ────────────────────────────────────────────────────────────────
  for (const [name, values] of expected.enums) {
    const actual = db.enums.get(name)
    if (!actual) {
      push('enum', name, `MISSING — ${values.length} values expected`)
      continue
    }
    const missing = values.filter((v) => !actual.includes(v))
    const extra = actual.filter((v) => !values.includes(v))
    if (missing.length || extra.length) {
      const parts: string[] = []
      if (missing.length) parts.push(`missing value(s) ${missing.map((v) => `'${v}'`).join(', ')}`)
      if (extra.length) parts.push(`extra value(s) ${extra.map((v) => `'${v}'`).join(', ')}`)
      push('enum', name, parts.join('; '))
    } else if (values.join('\u0000') !== actual.join('\u0000')) {
      push('enum', name, `same values, different sort order: types [${values.join(', ')}] vs database [${actual.join(', ')}]`)
    }
  }
  for (const name of db.enums.keys()) {
    if (!expected.enums.has(name)) extras.push({ kind: 'enum', object: name })
  }

  // ── functions ────────────────────────────────────────────────────────────
  for (const fn of expected.functions) {
    const actual = db.functions.get(fn.name)
    if (!actual) {
      push('function', fn.name, 'MISSING — named in database.types.ts, absent from the built database')
      continue
    }
    const same = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')
    const matched = fn.overloads.some((o) => actual.some((a) => same(o.args, a.args)))
    if (!matched) {
      const want = fn.overloads.map((o) => `(${o.args.join(', ')})`).join(' | ')
      const have = actual.map((a) => `(${a.identity})`).join(' | ')
      push('function', fn.name, `signature mismatch: types says ${want}, database has ${have}`)
    }
  }
  for (const name of db.functions.keys()) {
    if (!expected.functions.some((f) => f.name === name)) extras.push({ kind: 'function', object: name })
  }

  // ── report ───────────────────────────────────────────────────────────────
  const fails = findings.filter((f) => f.severity === 'FAIL')
  const allowedFindings = findings.filter((f) => f.severity === 'ALLOWED')

  if (wantJson) {
    console.log(JSON.stringify({ fails, allowed: allowedFindings, extras, unverifiable }, null, 2))
    process.exit(fails.length ? 1 : 0)
  }

  // The last column holds free text (an error, or an allow-list justification)
  // and is the only one that can be long, so it is the only one that wraps.
  const WRAP = 96
  const wrap = (s: string, width: number) => {
    const out: string[] = []
    for (const paragraph of s.split('\n')) {
      let line = ''
      for (const word of paragraph.split(' ')) {
        if (line && line.length + 1 + word.length > width) {
          out.push(line)
          line = word
        } else {
          line = line ? `${line} ${word}` : word
        }
      }
      out.push(line)
    }
    return out
  }

  const table = (rows: string[][], headers: string[]) => {
    const last = headers.length - 1
    const fixed = [headers, ...rows]
    const w = headers.map((_, i) =>
      i === last ? WRAP : Math.max(...fixed.map((r) => (r[i] ?? '').length)),
    )
    const lines: string[] = []
    const emit = (r: string[]) => {
      const tail = wrap(r[last] ?? '', WRAP)
      tail.forEach((t, n) => {
        const head = r.slice(0, last).map((c, i) => (n === 0 ? (c ?? '') : '').padEnd(w[i]))
        lines.push([...head, t].join('  ').trimEnd())
      })
    }
    emit(headers)
    lines.push(w.map((n) => '-'.repeat(n)).join('  '))
    rows.forEach(emit)
    return lines.join('\n')
  }

  console.log('=== schema fidelity: built database vs database.types.ts (generated from production) ===\n')
  console.log(
    `checked ${expected.tables.length} tables, ${expected.views.length} views, ` +
      `${expected.enums.size} enums, ${expected.functions.length} functions`,
  )
  console.log(
    `database holds ${db.rels.size} relations, ${db.enums.size} enums, ${db.functions.size} function names\n`,
  )

  if (fails.length) {
    console.log(`--- ${fails.length} FAILURE(S) ---`)
    console.log(table(fails.map((f) => [f.kind, f.object, f.detail]), ['KIND', 'OBJECT', 'DETAIL']))
    console.log()
  } else {
    console.log('--- 0 failures: every table, view, enum and function in the types file is present and matches ---\n')
  }

  if (allowedFindings.length) {
    console.log(`--- ${allowedFindings.length} allow-listed difference(s) (types file is stale, proven by a later migration) ---`)
    console.log(table(allowedFindings.map((f) => [f.kind, f.object, f.detail]), ['KIND', 'OBJECT', 'DETAIL']))
    console.log()
  }

  if (unverifiable.length) {
    console.log(`--- ${unverifiable.length} column(s) whose type the generator did not name (not checkable) ---`)
    console.log(unverifiable.join(', '))
    console.log()
  }

  const byKind = new Map<string, string[]>()
  for (const e of extras) {
    if (!byKind.has(e.kind)) byKind.set(e.kind, [])
    byKind.get(e.kind)!.push(e.object)
  }
  console.log(`--- ${extras.length} extra object(s) in the database, not in the types file (allowed) ---`)
  for (const [kind, names] of byKind) {
    console.log(`${kind} (${names.length}): ${names.sort().join(', ')}`)
  }
  console.log()

  console.log(fails.length ? `FAIL: ${fails.length} mismatch(es)` : 'PASS: schema matches production')
  process.exit(fails.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
