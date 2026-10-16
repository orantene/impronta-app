import "server-only";

import { cache } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { WorkspaceLocaleFacts } from "@/i18n/workspace-page-locale";

type IdentityRow = { default_locale: string | null; supported_locales: string[] | null };

/** Read-only facts about a workspace's language (TUL-699). Never throws. */
export const loadWorkspaceLocaleFacts = cache(
  async (tenantId: string): Promise<WorkspaceLocaleFacts | null> => {
    const supabase = createPublicSupabaseClient();
    if (!supabase || !tenantId) return null;
    try {
      const { data: identity, error: identityError } = await supabase
        .from("agency_business_identity")
        .select("default_locale, supported_locales")
        .eq("tenant_id", tenantId)
        .maybeSingle<IdentityRow>();
      if (identityError) return null; // a failed read is not 'no identity': no facts, the caller keeps its default
      const identityDefault = identity?.default_locale?.trim() || null;
      const supported = (identity?.supported_locales ?? []).filter(Boolean);
      let homeCmsLocale: string | null = null;
      if (!identityDefault) {
        const { data: home, error: homeError } = await supabase
          .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
          .select("locale")
          .eq("is_system_owned", true)
          .eq("system_template_key", "homepage")
          .limit(1)
          .maybeSingle<{ locale: string }>();
        if (homeError) return null;
        homeCmsLocale = home?.locale ?? null;
      }
      return {
        identityDefault,
        homeCmsLocale,
        usesPlatformStarter: !identityDefault && !homeCmsLocale,
        supported,
      };
    } catch {
      return null;
    }
  },
);
