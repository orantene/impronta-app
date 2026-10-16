import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  EMPTY_TEST_SERVICE_SCOPE,
  isQaNamedOffering,
  type TestServiceScope,
} from "@/lib/talent/qa-test-service";
import type { TalentOfferingRow } from "@/lib/talent/offerings-types";

/**
 * Which of these rows' talents are demos or test accounts. No query unless a
 * row is QA-named, so real sites pay nothing. A failed read hides nothing.
 */
export async function loadTestServiceScope(
  admin: SupabaseClient,
  rows: readonly Pick<TalentOfferingRow, "title" | "title_i18n" | "talent_profile_id">[],
): Promise<TestServiceScope> {
  const ids = [
    ...new Set(
      rows
        .filter((r) => r.talent_profile_id && isQaNamedOffering(r))
        .map((r) => r.talent_profile_id as string),
    ),
  ];
  if (ids.length === 0) return EMPTY_TEST_SERVICE_SCOPE;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id")
    .in("id", ids)
    .or("is_demo.eq.true,is_test_account.eq.true");
  if (error) {
    logServerError("public.offerings.testScope", error);
    return EMPTY_TEST_SERVICE_SCOPE;
  }
  return {
    ...EMPTY_TEST_SERVICE_SCOPE,
    fixtureProfileIds: new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id)),
  };
}
