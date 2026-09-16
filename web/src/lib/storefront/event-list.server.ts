"use server";

/** event_list — the server action the island imports dynamically. */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { readEventListCore } from "./event-list.core";
import type { EventListData, EventListProps } from "./event-list.types";

export async function readEventList(
  tenantId: string,
  props: EventListProps,
): Promise<{ ok: true; data: EventListData } | { ok: false; reason: string }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    return await readEventListCore({ admin }, tenantId, props);
  } catch (error) {
    logServerError("storefront.eventList.read", error);
    return { ok: false, reason: "unavailable" };
  }
}
