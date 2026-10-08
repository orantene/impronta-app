/**
 * TUL-39 — refuse / load gate for premium app installs (flag-independence,
 * null plan, staff skip vs own-profile miss → deny + retryable).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { TalentSelfScopeResult } from "@/lib/server/talent-self-guard";
import {
  loadTalentPremiumAppSaveGate,
  refuseTalentPremiumAppTreeMutation,
  talentProfileLookupFailedMessage,
  type PremiumAppSaveGateDeps,
  type TalentRowActorKind,
} from "./premium-app-save-guard";

const PREVIOUS = [{ id: "sec-1", kind: "section", children: [] }];
const NEXT_PLAIN = [
  {
    id: "sec-1",
    kind: "section",
    children: [{ id: "t-1", kind: "text", props: {} }],
  },
];
const NEXT_WITH_NAIL = [
  {
    id: "sec-1",
    kind: "section",
    children: [{ id: "nd-1", kind: "app_nail_designer", props: {} }],
  },
];

function okScope(
  planKey: string | null,
  profileId = "tp-self",
): TalentSelfScopeResult {
  return {
    ok: true,
    session: {} as never,
    tenantId: "",
    tenantSlug: "",
    talentProfile: { id: profileId } as never,
    planKey: planKey as string,
  };
}

function failScope(
  code: "not_authenticated" | "talent_profile_not_found" | "workspace_not_found",
): TalentSelfScopeResult {
  return { ok: false, code, error: code };
}

function deps(input: {
  scope: TalentSelfScopeResult;
  classify?: TalentRowActorKind;
}): PremiumAppSaveGateDeps {
  return {
    requireTalentSelf: async () => input.scope,
    classifyTalentRowActor: async () => input.classify ?? "unknown",
  };
}

test("null / free plan refuses; Web Office allows (flag-independent)", async () => {
  for (const plan of [null, "talent_basic", "talent_pro", "nonsense"] as const) {
    const gate = await loadTalentPremiumAppSaveGate(
      "tp-self",
      deps({ scope: okScope(plan) }),
    );
    assert.equal(gate.status, "ok");
    if (gate.status === "ok") {
      assert.equal(gate.canUsePremiumApps, false, `plan ${String(plan)}`);
    }
  }
  const allowed = await loadTalentPremiumAppSaveGate(
    "tp-self",
    deps({ scope: okScope("talent_portfolio") }),
  );
  assert.equal(allowed.status, "ok");
  if (allowed.status === "ok") assert.equal(allowed.canUsePremiumApps, true);
});

test("staff on another talent's row skips; own-profile miss is lookup_failed", async () => {
  const staffSkip = await loadTalentPremiumAppSaveGate(
    "tp-other",
    deps({ scope: failScope("talent_profile_not_found"), classify: "other" }),
  );
  assert.deepEqual(staffSkip, { status: "skip" });

  const ownMiss = await loadTalentPremiumAppSaveGate(
    "tp-self",
    deps({ scope: failScope("talent_profile_not_found"), classify: "own" }),
  );
  assert.deepEqual(ownMiss, { status: "lookup_failed" });

  const unknownMiss = await loadTalentPremiumAppSaveGate(
    "tp-self",
    deps({ scope: failScope("talent_profile_not_found"), classify: "unknown" }),
  );
  assert.deepEqual(unknownMiss, { status: "lookup_failed" });

  // Publish / self context with no row id — cannot prove staff skip.
  const selfCtx = await loadTalentPremiumAppSaveGate(
    null,
    deps({ scope: failScope("talent_profile_not_found"), classify: "other" }),
  );
  assert.deepEqual(selfCtx, { status: "lookup_failed" });
});

test("signed-in talent on a different profile id skips; matching id uses plan", async () => {
  const other = await loadTalentPremiumAppSaveGate(
    "tp-other",
    deps({ scope: okScope("talent_portfolio", "tp-self") }),
  );
  assert.deepEqual(other, { status: "skip" });

  const self = await loadTalentPremiumAppSaveGate(
    "tp-self",
    deps({ scope: okScope("talent_basic", "tp-self") }),
  );
  assert.deepEqual(self, { status: "ok", canUsePremiumApps: false });
});

test("refuse blocks Nail Designer on free (ES locale); staff skip allows", async () => {
  const refused = await refuseTalentPremiumAppTreeMutation(
    {
      talentProfileId: "tp-self",
      previousTree: PREVIOUS,
      nextTree: NEXT_WITH_NAIL,
      locale: "es",
    },
    deps({ scope: okScope("talent_basic") }),
  );
  assert.ok(refused);
  assert.match(refused!, /Nail Designer/);
  assert.match(refused!, /Oficina Web/);

  const staffOk = await refuseTalentPremiumAppTreeMutation(
    {
      talentProfileId: "tp-other",
      previousTree: PREVIOUS,
      nextTree: NEXT_WITH_NAIL,
    },
    deps({ scope: failScope("talent_profile_not_found"), classify: "other" }),
  );
  assert.equal(staffOk, null);
});

test("profile lookup failure denies with retryable message (even without premium insert)", async () => {
  assert.match(talentProfileLookupFailedMessage("en"), /try again/i);
  assert.match(talentProfileLookupFailedMessage("es"), /Inténtalo de nuevo/);
  assert.doesNotMatch(talentProfileLookupFailedMessage("en"), /—/);
  assert.doesNotMatch(talentProfileLookupFailedMessage("es"), /—/);

  const ownMiss = await refuseTalentPremiumAppTreeMutation(
    {
      talentProfileId: "tp-self",
      previousTree: PREVIOUS,
      nextTree: NEXT_PLAIN,
      locale: "en",
    },
    deps({ scope: failScope("talent_profile_not_found"), classify: "own" }),
  );
  assert.equal(ownMiss, talentProfileLookupFailedMessage("en"));
  assert.doesNotMatch(ownMiss!, /Web Office/);

  const ownMissEs = await refuseTalentPremiumAppTreeMutation(
    {
      talentProfileId: "tp-self",
      previousTree: PREVIOUS,
      nextTree: NEXT_WITH_NAIL,
      locale: "es",
    },
    deps({ scope: failScope("talent_profile_not_found"), classify: "own" }),
  );
  assert.equal(ownMissEs, talentProfileLookupFailedMessage("es"));
});
