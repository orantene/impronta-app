/**
 * personal-profile-lock.security.test.ts — characterization of the Phase 2b
 * multi-tenant talent-identity safety floor (src/lib/talent/personal-profile-lock.ts
 * + the server-action write paths that enforce it).
 *
 * THE RULE: a Tulala-native talent (talent_profiles.user_id IS NOT NULL) owns
 * their personal/identity fields. An agency may overwrite those fields ONLY
 * with 'confirmed' exclusivity. Every other roster state — auto_assigned,
 * declined, notice_period, pending, removed, or no row — locks personal edits.
 * A non-native (agency-created, no auth user) talent is agency-owned and never
 * locked.
 *
 * The risk surface is *bypass*: the disabled <fieldset>s in the admin editor
 * are a UI affordance only — a scripted / DOM-tampered client can POST straight
 * to the save actions. So EVERY agency-side personal-data write path must
 * re-derive the lock server-side and fail closed.
 *
 * Two layers:
 *   (A) behavioural — the pure isPersonalProfileLocked decision, incl. the
 *       fail-closed and exact-match edges that a bypass would lean on.
 *   (B) source-invariant pins — every personal-data write action actually
 *       wires the guard. These are readFileSync greps (the I/O wrappers are
 *       not worth mocking); they exist so a future refactor that quietly drops
 *       a guard turns the test RED instead of silently re-opening the bypass.
 *
 * Companion convention: the other *.security.test.ts pins. Node 20 node:test,
 * run via `tsx --test`. Not wired into CI/npm — an ad-hoc regression pin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPersonalProfileLocked,
  PERSONAL_PROFILE_LOCK_MESSAGE,
} from "./personal-profile-lock";

// ─────────────────────────────────────────────────────────────────────────────
// (A) isPersonalProfileLocked — the pure lock decision.
// ─────────────────────────────────────────────────────────────────────────────

test("isPersonalProfileLocked: native identity + non-confirmed exclusivity = LOCKED", () => {
  assert.equal(
    isPersonalProfileLocked({
      nativeUserId: "user-abc",
      rosterExclusivity: "auto_assigned",
    }),
    true,
    "a native talent the agency hasn't confirmed exclusivity over is locked",
  );
});

test("isPersonalProfileLocked: native identity + 'confirmed' exclusivity = UNLOCKED (the only unlock)", () => {
  assert.equal(
    isPersonalProfileLocked({
      nativeUserId: "user-abc",
      rosterExclusivity: "confirmed",
    }),
    false,
    "'confirmed' is the single state that lets an agency edit a native talent's identity",
  );
});

test("isPersonalProfileLocked: a NON-native talent is agency-owned and is NEVER locked, whatever the roster says", () => {
  // No auth user behind the profile → agency-created record → agency owns it.
  // This must hold across every exclusivity value AND null/undefined, or an
  // agency would be locked out of profiles it legitimately owns.
  for (const rosterExclusivity of [
    "confirmed",
    "auto_assigned",
    "declined",
    "notice_period",
    "pending",
    "removed",
    "",
    null,
    undefined,
  ]) {
    for (const nativeUserId of [null, undefined, ""]) {
      assert.equal(
        isPersonalProfileLocked({ nativeUserId, rosterExclusivity }),
        false,
        `non-native (user=${JSON.stringify(nativeUserId)}) must never lock (roster=${JSON.stringify(rosterExclusivity)})`,
      );
    }
  }
});

test("isPersonalProfileLocked: native + MISSING roster (null/undefined exclusivity) FAILS CLOSED → LOCKED", () => {
  // No roster row, or a row with no exclusivity, is NOT 'confirmed' — so a
  // native talent stays locked. A bypass that nulls the relationship must not
  // unlock the identity.
  for (const rosterExclusivity of [null, undefined]) {
    assert.equal(
      isPersonalProfileLocked({ nativeUserId: "user-abc", rosterExclusivity }),
      true,
      `missing exclusivity (${JSON.stringify(rosterExclusivity)}) must fail closed (locked) for a native talent`,
    );
  }
});

test("isPersonalProfileLocked: EVERY non-'confirmed' exclusivity state locks a native talent", () => {
  for (const rosterExclusivity of [
    "auto_assigned",
    "declined",
    "notice_period",
    "pending",
    "removed",
    "exclusive", // near-miss wording is still not 'confirmed'
    "",
  ]) {
    assert.equal(
      isPersonalProfileLocked({ nativeUserId: "user-abc", rosterExclusivity }),
      true,
      `'${rosterExclusivity}' is not 'confirmed' → must lock`,
    );
  }
});

test("isPersonalProfileLocked: the unlock is an EXACT match — case / whitespace variants do NOT unlock", () => {
  // Guards against a sloppy normalize (trim/lowercase) sneaking an unlock.
  for (const rosterExclusivity of [
    "Confirmed",
    "CONFIRMED",
    " confirmed",
    "confirmed ",
    " confirmed ",
    "confirmed\n",
  ]) {
    assert.equal(
      isPersonalProfileLocked({ nativeUserId: "user-abc", rosterExclusivity }),
      true,
      `'${rosterExclusivity}' must NOT be treated as 'confirmed'`,
    );
  }
});

test("PERSONAL_PROFILE_LOCK_MESSAGE: client-safe copy — no 'buyer'/'buy' framing, names the unlock path", () => {
  assert.doesNotMatch(
    PERSONAL_PROFILE_LOCK_MESSAGE,
    /buy(er)?\b/i,
    "Tulala never uses buyer/buy framing",
  );
  assert.match(
    PERSONAL_PROFILE_LOCK_MESSAGE,
    /confirm exclusivity/i,
    "the message must tell the agency how to unlock (confirm exclusivity)",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// (B) source-invariant pins — every personal-data write path wires the guard.
// ─────────────────────────────────────────────────────────────────────────────
const HERE = fileURLToPath(new URL(".", import.meta.url));
const ACTIONS = join(HERE, "..", "server-actions");
const readAction = (f: string) => readFileSync(join(ACTIONS, f), "utf8");

const HELPER_SRC = readFileSync(join(HERE, "personal-profile-lock.ts"), "utf8");
const ADMIN_TALENT = readAction("admin-talent.ts");
const LANGUAGES = readAction("admin-talent-languages.ts");
const PROFILE_SECTIONS = readAction("admin-talent-profile-sections.ts");
const ROSTER = readAction("admin-talent-roster.ts");
const TRANSLATIONS = readAction("admin-talent-translations.ts");
const IDENTITY = readAction("admin-talent-identity.ts");

const IMPORT_RE =
  /import \{ assertPersonalProfileEditable \} from "\@\/lib\/talent\/personal-profile-lock";/;

test("COVERAGE: every personal-data write action imports the shared lock helper", () => {
  for (const [name, src] of [
    ["admin-talent.ts", ADMIN_TALENT],
    ["admin-talent-languages.ts", LANGUAGES],
    ["admin-talent-profile-sections.ts", PROFILE_SECTIONS],
    ["admin-talent-roster.ts", ROSTER],
    ["admin-talent-translations.ts", TRANSLATIONS],
  ] as const) {
    assert.match(src, IMPORT_RE, `${name} must import assertPersonalProfileEditable`);
  }
});

test("INVARIANT helper: non-native short-circuits to ok, locked path returns the lock message, DB faults FAIL CLOSED", () => {
  // The single unlock constant.
  assert.match(HELPER_SRC, /const CONFIRMED_EXCLUSIVITY = "confirmed";/);
  // Pure rule compares against the constant (not an inline literal that could drift).
  assert.match(
    HELPER_SRC,
    /\(input\.rosterExclusivity \?\? null\) !== CONFIRMED_EXCLUSIVITY/,
  );
  // Non-native talents are agency-owned: explicit early ok (no lock, no roster read).
  assert.match(HELPER_SRC, /if \(!nativeUserId\) return \{ ok: true \};/);
  // Locked → the shared client-safe message.
  assert.match(
    HELPER_SRC,
    /return \{ ok: false, error: PERSONAL_PROFILE_LOCK_MESSAGE \};/,
  );
  // Both DB read faults fail CLOSED (deny the write), never fall through to ok.
  assert.equal(
    (HELPER_SRC.match(/return \{ ok: false, error: CLIENT_ERROR\.update \};/g) ?? [])
      .length >= 2,
    true,
    "both the talent-check and roster-check DB faults must fail closed",
  );
});

test("INVARIANT admin-talent.ts updateTalentProfile: personal-field writes hit the guard", () => {
  // The write is gated only when it actually touches personal data …
  assert.match(ADMIN_TALENT, /const touchesPersonalData =/);
  // … and when it does, it derives tenant scope and calls the shared helper.
  assert.match(
    ADMIN_TALENT,
    /if \(touchesPersonalData\)[\s\S]*?assertPersonalProfileEditable\(/,
  );
});

test("INVARIANT admin-talent-languages.ts: BOTH save paths enforce the lock", () => {
  // saveTalentLanguages → shared helper.
  assert.match(LANGUAGES, /await assertPersonalProfileEditable\(/);
  // setTalentLanguages → inline derivation with the exact same unlock test.
  assert.match(LANGUAGES, /rosterExclusivity !== "confirmed"/);
});

test("INVARIANT admin-talent-profile-sections.ts: about + location writes BOTH call the helper", () => {
  assert.equal(
    (PROFILE_SECTIONS.match(/await assertPersonalProfileEditable\(/g) ?? []).length >= 2,
    true,
    "updateTalentAbout and updateTalentLocation must each gate on the helper",
  );
});

test("INVARIANT admin-talent-roster.ts setTalentCardPhoto: avatar write is gated", () => {
  assert.match(ROSTER, /await assertPersonalProfileEditable\(/);
});

test("INVARIANT admin-talent-translations.ts: bio actions route through a tenant-scoped wrapper", () => {
  // The local wrapper resolves tenant scope (no-op for platform god-mode) then
  // delegates to the shared helper.
  assert.match(TRANSLATIONS, /async function assertBioPersonalEditable\(/);
  // …and the content-mutating bio actions actually call it (7 today; pin >= 5
  // so adding one doesn't need a test edit but dropping the floor turns red).
  assert.equal(
    (TRANSLATIONS.match(/await assertBioPersonalEditable\(/g) ?? []).length >= 5,
    true,
    "the bio-mutating translation actions must each enforce the lock",
  );
});

test("INVARIANT admin-talent-identity.ts: the pre-existing inline guard is preserved", () => {
  assert.match(IDENTITY, /rosterExclusivity !== "confirmed"/);
});
