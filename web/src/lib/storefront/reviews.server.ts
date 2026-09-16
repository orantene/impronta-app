"use server";

/** reviews — the server action the island imports dynamically. */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { readReviewsCore } from "./reviews.core";
import type { ReviewsData, ReviewsProps } from "./reviews.types";

export async function readReviews(
  tenantId: string,
  props: ReviewsProps,
): Promise<{ ok: true; data: ReviewsData } | { ok: false; reason: string }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    return await readReviewsCore({ admin }, tenantId, props);
  } catch (error) {
    logServerError("storefront.reviews.read", error);
    return { ok: false, reason: "unavailable" };
  }
}
