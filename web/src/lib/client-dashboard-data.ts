import { cache } from "react";
import { logDashboardLoaderFailure } from "@/lib/dashboard-loader-diagnostics";
import { userHasEmailPasswordIdentity } from "@/lib/auth-identities";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";

export type ClientSaveRow = {
  talent_profile_id: string;
  talent_profiles: {
    profile_code: string;
    display_name: string | null;
  } | null;
};

export type InquiryTalentRow = {
  talent_profile_id: string;
  talent_profiles: {
    profile_code: string;
    display_name: string | null;
  } | null;
};

export type ClientInquiryRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  guest_session_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company: string | null;
  event_type_id: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  message: string | null;
  raw_ai_query: string | null;
  source_page: string | null;
  inquiry_talent: InquiryTalentRow[] | null;
};

export type ClientDashboardData = {
  userId: string;
  userEmail: string | null;
  accountHasEmailPassword: boolean;
  profile: { display_name: string | null } | null;
  clientProfile: {
    company_name: string | null;
    phone: string | null;
    whatsapp_phone: string | null;
    website_url: string | null;
    notes: string | null;
  } | null;
  saves: ClientSaveRow[];
  inquiries: ClientInquiryRow[];
  eventTypeMap: Map<string, string>;
  agencyWhatsAppNumber: string | undefined;
};

export type ClientDashboardLoadResult =
  | { ok: true; data: ClientDashboardData }
  | { ok: false; reason: "no_supabase" | "no_user" };

export const loadClientDashboardData = cache(
  async (): Promise<ClientDashboardLoadResult> => {
    return loadClientDashboardDataImpl();
  },
);

async function loadClientDashboardDataImpl(): Promise<ClientDashboardLoadResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, reason: "no_supabase" };

  const identity = await resolveDashboardIdentity();
  if (!identity) return { ok: false, reason: "no_user" };
  const subjectId = subjectUserId(identity);
  const authUser = identity.actorUser;

  const pub = createPublicSupabaseClient();

  try {
    const [{ data: profile }, { data: clientProfile }, { data: saves }, { data: inquiries }] =
      await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", subjectId).maybeSingle(),
        supabase
          .from("client_profiles")
          .select("company_name, phone, whatsapp_phone, website_url, notes")
          .eq("user_id", subjectId)
          .maybeSingle(),
        supabase
          .from("saved_talent")
          .select(
            `
          talent_profile_id,
          created_at,
          talent_profiles (
            id,
            profile_code,
            display_name
          )
        `,
          )
          .eq("client_user_id", subjectId)
          .order("created_at", { ascending: false }),
        supabase
          .from("inquiries")
          .select(
            `
          id,
          status,
          created_at,
          updated_at,
          guest_session_id,
          contact_name,
          contact_email,
          contact_phone,
          company,
          event_type_id,
          event_date,
          event_location,
          quantity,
          message,
          raw_ai_query,
          source_page,
          inquiry_talent (
            talent_profile_id,
            talent_profiles (
              profile_code,
              display_name
            )
          )
        `,
          )
          .eq("client_user_id", subjectId)
          .order("created_at", { ascending: false }),
      ]);

    const inquiryRows = (inquiries ?? []) as unknown as ClientInquiryRow[];
    const eventTypeIds = Array.from(
      new Set(inquiryRows.map((inquiry) => inquiry.event_type_id).filter(Boolean)),
    ) as string[];

    type EventTypeRow = { id: string; name_en: string };

    const [{ data: eventTypes }, { data: whatsappSetting }] = await Promise.all([
      eventTypeIds.length > 0
        ? supabase.from("taxonomy_terms").select("id, name_en").in("id", eventTypeIds)
        : Promise.resolve({ data: [] as EventTypeRow[] }),
      pub
        ? pub.from("settings").select("value").eq("key", "agency_whatsapp_number").maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const eventTypeMap = new Map(
      ((eventTypes ?? []) as EventTypeRow[]).map((row) => [row.id, row.name_en] as const),
    );
    const agencyWhatsAppNumber =
      typeof whatsappSetting?.value === "string" ? whatsappSetting.value : undefined;

    return {
      ok: true,
      data: {
        userId: subjectId,
        userEmail: identity.isImpersonating ? null : authUser.email ?? null,
        accountHasEmailPassword: identity.isImpersonating
          ? false
          : userHasEmailPasswordIdentity(authUser),
        profile,
        clientProfile,
        saves: (saves ?? []) as unknown as ClientSaveRow[],
        inquiries: inquiryRows,
        eventTypeMap,
        agencyWhatsAppNumber,
      },
    };
  } catch (err) {
    await logDashboardLoaderFailure("loadClientDashboardData", err, {
      userId: subjectId,
    });
    throw err;
  }
}
