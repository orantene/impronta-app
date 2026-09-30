"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

import { parsePolicyAnswers, type PolicyAnswers } from "./answers";
import { loadPolicyFacts, type PolicyFacts } from "./facts";
import { loadPublishedPolicy, loadSavedAnswers, publishPolicy, type PublishResult } from "./store";

export type PolicyScreenData = {
  facts: PolicyFacts;
  /** The working copy (what she last published, or her defaults). */
  answers: PolicyAnswers;
  published: {
    version: number;
    answers: PolicyAnswers;
    textEs: string;
    textEn: string;
    publishedAt: string;
  } | null;
};

async function requireOwner(talentProfileId: string) {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Server configuration error." };
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentPolicies.requireOwner", error);
    return { ok: false as const, error: "Could not verify ownership." };
  }
  if (!data || data.user_id !== session.user.id) return { ok: false as const, error: "Forbidden." };
  return { ok: true as const, admin, userId: session.user.id };
}

export async function loadPolicyScreen(
  talentProfileId: string,
): Promise<{ ok: true; data: PolicyScreenData } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const [facts, answers, published] = await Promise.all([
    loadPolicyFacts(auth.admin, talentProfileId),
    loadSavedAnswers(auth.admin, talentProfileId),
    loadPublishedPolicy(auth.admin, talentProfileId),
  ]);
  if (!facts) return { ok: false, error: "Could not load your settings." };
  return {
    ok: true,
    data: {
      facts,
      answers: published ? published.answers : answers,
      published: published
        ? {
            version: published.version,
            answers: published.answers,
            textEs: published.textEs,
            textEn: published.textEn,
            publishedAt: published.publishedAt,
          }
        : null,
    },
  };
}

export async function publishPolicyAnswers(
  talentProfileId: string,
  answers: PolicyAnswers,
): Promise<PublishResult | { ok: false; reason: "forbidden" }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return { ok: false, reason: "forbidden" };
  const result = await publishPolicy(auth.admin, {
    talentProfileId,
    userId: auth.userId,
    answers: parsePolicyAnswers(answers),
  });
  if (result.ok) revalidatePath("/talent/settings");
  return result;
}
