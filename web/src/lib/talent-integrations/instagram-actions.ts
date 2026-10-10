"use server";

import { revalidatePath } from "next/cache";

import { fetchInstagramProfile } from "@/lib/connection-oauth/instagram";
import { isConnectionOAuthConfigured } from "@/lib/connection-oauth/providers";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  assertTalentCanInsertSiteSections,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import { INSTAGRAM_TALENT_INTEGRATION_KEY } from "./catalog";
import {
  deriveTalentInstagramCardState,
  type TalentInstagramCardState,
} from "./instagram-card-state";
import {
  getDecryptedTalentIntegrationSecret,
  getTalentIntegration,
  upsertTalentIntegration,
  type TalentIntegrationRow,
} from "./repository";

type CardResult =
  | { ok: true; state: TalentInstagramCardState }
  | { ok: false; error: string };

function stateFor(row: TalentIntegrationRow | null, planKey: string): TalentInstagramCardState {
  return deriveTalentInstagramCardState({
    row,
    // The Instagram feed is a paid site block: same gate as inserting sections.
    paid: assertTalentCanInsertSiteSections(planKey),
    configured: isConnectionOAuthConfigured("instagram"),
  });
}

export async function loadTalentInstagramCardAction(): Promise<CardResult> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };
  const row = await getTalentIntegration(guard.talentProfile.id, INSTAGRAM_TALENT_INTEGRATION_KEY);
  return { ok: true, state: stateFor(row, guard.planKey) };
}

/**
 * "Sync now": re-checks the stored token against Instagram and refreshes the
 * handle. A vendor 4xx means the grant is dead, so the row flips to
 * `needs_reauth` and the card asks for a reconnect; anything else is kept as a
 * retryable `error`.
 */
export async function syncTalentInstagramAction(): Promise<CardResult> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!assertTalentCanInsertSiteSections(guard.planKey)) {
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  const talentProfileId = guard.talentProfile.id;
  const actorId = guard.session.user.id;

  try {
    const row = await getTalentIntegration(talentProfileId, INSTAGRAM_TALENT_INTEGRATION_KEY);
    if (!row || row.connection_method !== "oauth" || row.status === "disabled") {
      return { ok: true, state: stateFor(row, guard.planKey) };
    }

    const token = await getDecryptedTalentIntegrationSecret(
      talentProfileId,
      INSTAGRAM_TALENT_INTEGRATION_KEY,
      "access_token",
    );
    const now = new Date().toISOString();
    if (!token) {
      const next = await upsertTalentIntegration({
        talentProfileId,
        providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
        status: "needs_reauth",
        lastError: "Stored token missing.",
        actorId,
      });
      return { ok: true, state: stateFor(next ?? row, guard.planKey) };
    }

    const profile = await fetchInstagramProfile(token);
    const next = profile.ok
      ? await upsertTalentIntegration({
          talentProfileId,
          providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
          providerAccountId: profile.profile.userId,
          providerAccountLabel: profile.profile.username,
          status: "connected",
          settingsJson: { ...row.settings_json, needs_reconnect: false },
          lastVerifiedAt: now,
          lastError: null,
          actorId,
        })
      : await upsertTalentIntegration({
          talentProfileId,
          providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
          status:
            typeof profile.status === "number" && profile.status >= 400 && profile.status < 500
              ? "needs_reauth"
              : "error",
          lastError: profile.error,
          actorId,
        });
    revalidatePath("/[tenantSlug]/talent/settings", "page");
    return { ok: true, state: stateFor(next ?? row, guard.planKey) };
  } catch (error) {
    logServerError("talentIntegrations.instagramSync", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
