import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EVE-D01 (TUL-1429): cancelling a published event always failed.
 *
 * STATIC test over the migration SQL (parses the text; no database). The
 * DB-backed counterpart is the DO-block proof at the bottom of the held
 * migration 20261231421500, which runs when that file is applied/replayed.
 *
 * The defect: `events_cancelled_stamp` is CHECK ((status = 'cancelled') =
 * (cancelled_at IS NOT NULL)), and `cancel_event_cascade` set the status
 * without the stamp, so every cancel raised 23514 and the caller answered
 * "Could not cancel the event.".
 */
const MIGRATIONS = join(process.cwd(), "..", "supabase", "migrations");
const HELD = join(MIGRATIONS, "_pending_pm");

type Migration = { version: string; held: boolean; sql: string };

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

function load(dir: string, held: boolean): Migration[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .map((f) => ({
      version: f.split("_")[0],
      held,
      sql: stripComments(readFileSync(join(dir, f), "utf8")),
    }));
}

const ALL = [...load(MIGRATIONS, false), ...load(HELD, true)].sort((a, b) =>
  a.version < b.version ? -1 : a.version > b.version ? 1 : 0,
);

const DEFINES = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cancel_event_cascade\s*\(/i;

/** The latest migration (applied OR held) that defines the function. */
function effectiveDefinition(): Migration {
  const defs = ALL.filter((m) => DEFINES.test(m.sql));
  assert.ok(defs.length > 0, "cancel_event_cascade must be defined somewhere");
  return defs[defs.length - 1];
}

function functionBody(m: Migration): string {
  const start = m.sql.search(DEFINES);
  const rest = m.sql.slice(start);
  const end = rest.search(/\$\$\s*;/);
  assert.ok(end > -1, "function body terminator not found");
  return rest.slice(0, end);
}

test("the events table still carries the biconditional cancelled stamp", () => {
  const events = ALL.find((m) => m.version === "20261229000361");
  assert.ok(events, "events migration present");
  assert.match(
    events.sql,
    /CONSTRAINT\s+events_cancelled_stamp\s+CHECK\s*\(\s*\(status\s*=\s*'cancelled'\)\s*=\s*\(cancelled_at\s+IS\s+NOT\s+NULL\)\s*\)/i,
    "status='cancelled' <=> cancelled_at set",
  );
});

test("the effective cancel_event_cascade stamps cancelled_at in the same UPDATE as status='cancelled'", () => {
  const body = functionBody(effectiveDefinition());
  const updates = [...body.matchAll(/UPDATE\s+public\.events\b([\s\S]*?);/gi)].map((m) => m[1]);
  assert.equal(updates.length, 1, "exactly one UPDATE on public.events");
  const set = updates[0];
  assert.match(set, /status\s*=\s*'cancelled'/i, "it is the cancelling write");
  assert.match(
    set,
    /cancelled_at\s*=\s*now\(\)/i,
    "events_cancelled_stamp: cancelled without cancelled_at raises 23514 and every cancel fails",
  );
});

test("the fix keeps the rest of the cascade intact", () => {
  const body = functionBody(effectiveDefinition());
  assert.match(body, /FOR UPDATE/, "row lock");
  assert.match(body, /UPDATE\s+public\.sessions/i);
  assert.match(body, /UPDATE\s+public\.capacity_pools/i);
  assert.match(body, /UPDATE\s+public\.admissions/i);
  assert.match(body, /INSERT\s+INTO\s+public\.ticket_refund_intents/i);
  assert.match(body, /ON CONFLICT \(order_line_id\) DO NOTHING/);
  assert.match(body, /o\.status IN \('paid', 'fulfilled'\)/);
  assert.match(body, /alreadyCancelled/);
});

test("the stamping definition is the stamping one, not an older copy that sorts later", () => {
  // Whether it is still held or has been moved into migrations/ by the PM, the
  // LAST definition by version must be the one that stamps (asserted above);
  // here, pin that no definition after the original lacks the stamp.
  const defs = ALL.filter((m) => DEFINES.test(m.sql) && m.version > "20261230000800");
  assert.ok(defs.length >= 1, "a replacement definition exists");
  for (const d of defs) assert.match(functionBody(d), /cancelled_at\s*=\s*now\(\)/i, d.version);
});

test("every status->'cancelled' UPDATE on events anywhere in the migrations also stamps cancelled_at", () => {
  for (const m of ALL) {
    for (const u of m.sql.matchAll(/UPDATE\s+public\.events\b([\s\S]*?);/gi)) {
      if (/status\s*=\s*'cancelled'/i.test(u[1])) {
        // The original (broken) definition is superseded by the held one; only
        // the effective definition is held to the rule above. Any OTHER file
        // writing it must be correct on its own.
        if (m.version === "20261230000800") continue;
        assert.match(u[1], /cancelled_at/i, `${m.version} sets events.status='cancelled' without cancelled_at`);
      }
    }
  }
});
