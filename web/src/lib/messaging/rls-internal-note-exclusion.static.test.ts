/**
 * D-MSG-2a · the RLS policy backing a direct client/guest/talent read of
 * inquiry_messages (and message_reactions) must not be able to surface a
 * staff internal note by thread membership alone.
 *
 * D-MSG-2 writes internal notes onto the same "private" thread as ordinary
 * client-visible replies (message_kind = 'internal_note' is the only
 * distinguishing column). Every shipped app reader filters that out
 * server-side, but a raw PostgREST/realtime SELECT goes straight through
 * RLS. This test does NOT run SQL — it is a static guard so a later
 * migration cannot silently recreate
 * `inquiry_messages_private_select_participant_v2` or
 * `message_reactions_select` without the `message_kind <> 'internal_note'`
 * predicate. The live-DB proof (client role actually blocked, staff/admin
 * unaffected) is a one-off transactional probe run against the isolated
 * `qa-journeys` branch — see the S8 lane report in
 * docs/plans/program/messages-v5/lanes.md — not something CI can run without
 * a database, which is why this file checks the migration SQL text instead.
 *
 * "Newest wins": several migrations DROP + CREATE the same policy name over
 * time (initplan optimization, gap fixes, ...). This test finds every
 * migration file that defines the policy and asserts the version that would
 * actually be live after a full replay — the one with the lexicographically
 * greatest (== chronologically latest, timestamp-prefixed) filename — carries
 * the exclusion.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .sort();
}

function newestMigrationDefining(policyName: string, tableName: string): { file: string; text: string } {
  const files = migrationFiles();
  let latest: { file: string; text: string } | null = null;
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const createRe = new RegExp(
      `CREATE\\s+POLICY\\s+"?${policyName}"?\\s+ON\\s+public\\.?"?${tableName}"?`,
      "i",
    );
    if (createRe.test(text)) {
      // sort() is chronological (timestamp-prefixed filenames), so the last
      // match encountered walking the sorted list is the newest.
      latest = { file, text };
    }
  }
  assert.ok(latest, `no migration defines policy ${policyName} on ${tableName}`);
  return latest as { file: string; text: string };
}

test("newest inquiry_messages client SELECT policy excludes internal_note", () => {
  const { file, text } = newestMigrationDefining(
    "inquiry_messages_private_select_participant_v2",
    "inquiry_messages",
  );
  // Isolate just this CREATE POLICY statement (up to the next top-level
  // statement terminator) so a match elsewhere in the file can't paper over
  // a missing predicate on the actual policy body.
  const start = text.search(
    /CREATE\s+POLICY\s+"?inquiry_messages_private_select_participant_v2"?\s+ON\s+public\.?"?inquiry_messages"?/i,
  );
  const body = text.slice(start, text.indexOf(";", start) + 1);
  assert.match(
    body,
    /message_kind\s*<>\s*'internal_note'/,
    `${file}: inquiry_messages_private_select_participant_v2 must exclude internal_note for client reads (D-MSG-2a)`,
  );
});

test("newest message_reactions SELECT policy excludes reactions on internal_note messages", () => {
  const { file, text } = newestMigrationDefining("message_reactions_select", "message_reactions");
  const start = text.search(
    /CREATE\s+POLICY\s+"?message_reactions_select"?\s+ON\s+public\.?"?message_reactions"?/i,
  );
  const body = text.slice(start, text.indexOf(";", start) + 1);
  assert.match(
    body,
    /message_kind\s*<>\s*'internal_note'/,
    `${file}: message_reactions_select must exclude reactions on internal_note messages (D-MSG-2a)`,
  );
});
