import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isNumericTalentProfileCode,
  normalizeTalentProfileCodeInput,
  resolveTalentProfileCode,
  talentProfileAliasRedirectPath,
  TALENT_PROFILE_CODE_NUMERIC_RE,
} from "./profile-code";

const MIGRATION = readFileSync(
  join(process.cwd(), "../supabase/migrations/20261231344000_numeric_talent_profile_codes.sql"),
  "utf8",
);

test("numeric TAL code regex accepts digits only after TAL-", () => {
  assert.equal(isNumericTalentProfileCode("TAL-00001"), true);
  assert.equal(isNumericTalentProfileCode("TAL-93938"), true);
  assert.equal(isNumericTalentProfileCode("TAL-JORGBEAUTY"), false);
  assert.equal(isNumericTalentProfileCode("TAL-AUDIT-0512"), false);
  assert.equal(isNumericTalentProfileCode("TAL-QAFIXFREE"), false);
  assert.equal(TALENT_PROFILE_CODE_NUMERIC_RE.test("TAL-12"), true);
});

test("migration adds alias table, numeric check, and resolve RPC", () => {
  assert.match(MIGRATION, /create table if not exists public\.talent_profile_code_aliases/i);
  assert.match(MIGRATION, /talent_profiles_profile_code_numeric_check/);
  assert.match(MIGRATION, /check \(profile_code ~ '\^TAL-\[0-9\]\+\$'\)/i);
  assert.match(MIGRATION, /create or replace function public\.resolve_talent_profile_code/i);
  assert.match(MIGRATION, /generate_profile_code\(\)/);
  assert.match(MIGRATION, /'TAL-JORGBEAUTY'/);
  assert.match(MIGRATION, /'TAL-QAFIXFREE'/);
  assert.match(MIGRATION, /'TAL-QAFIXMAX'/);
  assert.match(MIGRATION, /'TAL-AUDIT-0512'/);
  assert.match(MIGRATION, /DELETE FROM public\.talent_profiles[\s\S]*TAL-CLAIMQA/);
  assert.match(MIGRATION, /TAL-QACLAIM-01/);
});

test("normalizeTalentProfileCodeInput trims and decodes", () => {
  assert.equal(normalizeTalentProfileCodeInput("  TAL-00001  "), "TAL-00001");
  assert.equal(normalizeTalentProfileCodeInput("TAL-93938%20"), "TAL-93938");
});

test("talentProfileAliasRedirectPath rewrites /t/<old> to /t/<new>", () => {
  // Vanity → live mapping from 20261231344000 (Jorg Beauty).
  assert.equal(
    talentProfileAliasRedirectPath({
      canonicalCode: "TAL-93938",
      pathname: "/t/TAL-JORGBEAUTY",
      requestedCode: "TAL-JORGBEAUTY",
    }),
    "/t/TAL-93938",
  );
  assert.equal(
    talentProfileAliasRedirectPath({
      canonicalCode: "TAL-93938",
      pathname: "/t/TAL-JORGBEAUTY/politicas",
      requestedCode: "TAL-JORGBEAUTY",
      search: "?x=1",
    }),
    "/t/TAL-93938/politicas?x=1",
  );
  assert.equal(
    talentProfileAliasRedirectPath({
      canonicalCode: "TAL-93938",
      pathname: "/t/TAL-93938",
      requestedCode: "TAL-93938",
    }),
    null,
  );
});

test("resolveTalentProfileCode maps RPC rows and alias flag", async () => {
  const client = {
    rpc: async () => ({
      data: [
        {
          profile_id: "id-1",
          profile_code: "TAL-93938",
          requested_code: "TAL-JORGBEAUTY",
          is_alias: true,
        },
      ],
      error: null,
    }),
  };
  const resolved = await resolveTalentProfileCode(client, "TAL-JORGBEAUTY");
  assert.deepEqual(resolved, {
    profileId: "id-1",
    profileCode: "TAL-93938",
    requestedCode: "TAL-JORGBEAUTY",
    isAlias: true,
  });
});
