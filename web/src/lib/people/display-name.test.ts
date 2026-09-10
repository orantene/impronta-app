/**
 * A person's name, or the absence of one.
 *
 * THE DEFECT. `loadWorkspaceTeamMembers` read a member's name as
 * `profile?.display_name?.trim() || row.profile_id.slice(0, 8)`, so anyone
 * whose profile carried no `display_name` arrived with eight characters of
 * their auth user id already substituted as their name. The People list's
 * "Unnamed person" copy could therefore never fire, and an operator was shown
 * a raw identifier. Reproduced on the isolated branch: a real membership with
 * a null `display_name` produced the name `33330001`.
 *
 * These guards pin BOTH halves — the reader keeps absence absent, and the
 * screen is the thing that decides what to say instead.
 *
 * Lane: `npm run test:tenant-isolation`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { personDisplayName, personNameOr } from "./display-name";
import { blankComments, WEB_ROOT } from "@/lib/quality/supabase-unchecked-read";

test("a missing name is ABSENT, never an identifier and never a placeholder", () => {
  const id = "33330001-0000-4000-8000-0000000000f3";
  for (const profile of [
    null,
    undefined,
    { display_name: null },
    { display_name: "" },
    { display_name: "   " },
  ]) {
    const name = personDisplayName(profile);
    assert.equal(name, "", `absence became ${JSON.stringify(name)}`);
    // The exact shape of the old defect, named so it cannot come back quietly.
    assert.notEqual(name, id.slice(0, 8));
  }
  // BREAK IT: a real name comes through untouched, so the empties above are
  // the input's doing and not a function that always returns nothing.
  assert.equal(personDisplayName({ display_name: "  Dani Cruz " }), "Dani Cruz");
});

test("the SCREEN decides what absence looks like, in its own language", () => {
  // Three screens, three correct answers from the same absence.
  assert.equal(personNameOr("", "Unnamed person"), "Unnamed person");
  assert.equal(personNameOr("", "Persona sin nombre"), "Persona sin nombre");
  assert.equal(personNameOr("", ""), "", "the website cards print nothing on purpose");
  // A name is never overridden.
  assert.equal(personNameOr("Dani Cruz", "Unnamed person"), "Dani Cruz");
  assert.equal(personNameOr("   ", "Unnamed person"), "Unnamed person");
});

test("the team reader does not substitute an id fragment for a name", () => {
  // The runtime half of this reader cannot be imported into a plain node test
  // (it pulls `next/headers` through the server Supabase client), so the rule
  // is asserted where it is written. Comments are blanked first, so the
  // sentence explaining the defect cannot satisfy the guard that forbids it.
  const src = blankComments(
    readFileSync(
      join(WEB_ROOT, "src/app/(workspace)/[tenantSlug]/_data-bridge/workspace-config.ts"),
      "utf8",
    ),
  );
  assert.ok(
    src.includes("personDisplayName(profile)"),
    "the team reader must resolve a member's name through the rule in display-name.ts",
  );
  assert.ok(
    !/profile_id\s*\.\s*slice\s*\(/.test(src),
    "the reader is slicing a profile id into a name again",
  );
  assert.ok(
    !/display_name\s*\?\.\s*trim\(\)\s*\|\|/.test(src),
    "a `||` fallback is back: it turns any absent name into whatever follows it",
  );
});
