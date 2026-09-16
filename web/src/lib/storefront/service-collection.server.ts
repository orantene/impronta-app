"use server";

/** service_collection — the server action the island imports dynamically. */

import { loadPublicBookableOfferings } from "@/lib/site-admin/server/load-book-page-offerings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { storefrontLocale } from "./request-context";
import { readServiceCollectionCore } from "./service-collection.core";
import type { ServiceCollectionData, ServiceCollectionProps } from "./service-collection.types";

export async function readServiceCollection(
  tenantId: string,
  props: ServiceCollectionProps,
): Promise<{ ok: true; data: ServiceCollectionData } | { ok: false; reason: string }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    return await readServiceCollectionCore(
      {
        admin,
        locale: await storefrontLocale(props.locale),
        loadOfferings: (id, locale) => loadPublicBookableOfferings({ tenantId: id, locale, host: { kind: "agency", tenantId: id } }),
      },
      tenantId,
      props,
    );
  } catch (error) {
    logServerError("storefront.serviceCollection.read", error);
    return { ok: false, reason: "unavailable" };
  }
}
