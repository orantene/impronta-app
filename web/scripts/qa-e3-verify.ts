/**
 * E3 inquiry -> messages verifier.
 *
 * Run from web/:
 *   npx tsx --env-file=.env.local scripts/qa-e3-verify.ts --limit=5
 *   npx tsx --env-file=.env.local scripts/qa-e3-verify.ts --id=<inquiry-id>
 *   npx tsx --env-file=.env.local scripts/qa-e3-verify.ts --email=<contact-email>
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type InquiryRow = Pick<
  Database["public"]["Tables"]["inquiries"]["Row"],
  | "id"
  | "tenant_id"
  | "created_at"
  | "status"
  | "source_page"
  | "source_channel"
  | "source_context"
  | "contact_name"
  | "contact_email"
  | "client_user_id"
  | "guest_session_id"
  | "message"
>;

type Args = {
  email?: string;
  id?: string;
  limit: number;
  talents?: string[];
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 5;
  const talentsArg = args.find((arg) => arg.startsWith("--talents="));

  return {
    email: args.find((arg) => arg.startsWith("--email="))?.split("=").slice(1).join("="),
    id: args.find((arg) => arg.startsWith("--id="))?.split("=")[1],
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 25) : 5,
    talents: talentsArg
      ?.split("=")
      .slice(1)
      .join("=")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const args = parseArgs();
  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (args.talents?.length) {
    const { data, error } = await supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name, first_name, last_name, user_id, visibility, workflow_status")
      .or(
        args.talents
          .flatMap((value) => [
            `profile_code.ilike.%${value}%`,
            `display_name.ilike.%${value}%`,
            `first_name.ilike.%${value}%`,
            `last_name.ilike.%${value}%`,
          ])
          .join(","),
      )
      .order("profile_code", { ascending: true });

    if (error) throw error;
    console.log(JSON.stringify({ talents: data ?? [] }, null, 2));
    return;
  }

  let query = supabase
    .from("inquiries")
    .select(
      [
        "id",
        "tenant_id",
        "created_at",
        "status",
        "source_page",
        "source_channel",
        "source_context",
        "contact_name",
        "contact_email",
        "client_user_id",
        "guest_session_id",
        "message",
      ].join(", "),
    )
    .order("created_at", { ascending: false })
    .limit(args.limit);

  if (args.id) query = query.eq("id", args.id);
  if (args.email) query = query.eq("contact_email", args.email);

  const { data: inquiries, error } = await query;
  if (error) throw error;

  const inquiryRows = (inquiries ?? []) as unknown as InquiryRow[];
  const inquiryIds = inquiryRows.map((row) => row.id);
  const clientUserIds = inquiryRows
    .map((row) => row.client_user_id)
    .filter((value): value is string => Boolean(value));

  const [{ data: participants, error: participantsError }, { data: messages, error: messagesError }] =
    inquiryIds.length
      ? await Promise.all([
          supabase
            .from("inquiry_participants")
            .select(
              "inquiry_id, role, status, user_id, talent_profile_id, owning_party_type, owning_party_id, sort_order",
            )
            .in("inquiry_id", inquiryIds)
            .order("sort_order", { ascending: true }),
          supabase
            .from("inquiry_messages")
            .select("inquiry_id, thread_type, body, metadata, sender_user_id, created_at")
            .in("inquiry_id", inquiryIds)
            .order("created_at", { ascending: true }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (participantsError) throw participantsError;
  if (messagesError) throw messagesError;

  const talentProfileIds = (participants ?? [])
    .map((row) => row.talent_profile_id)
    .filter((value): value is string => Boolean(value));
  const { data: talentProfiles, error: talentProfilesError } = talentProfileIds.length
    ? await supabase
        .from("talent_profiles")
        .select("id, profile_code, display_name, first_name, last_name, user_id")
        .in("id", talentProfileIds)
    : { data: [], error: null };
  if (talentProfilesError) throw talentProfilesError;

  const { data: profiles, error: profilesError } = clientUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, app_role, account_status")
        .in("id", clientUserIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const { data: clientProfiles, error: clientProfilesError } = clientUserIds.length
    ? await supabase
        .from("client_profiles")
        .select("id, user_id, phone, trust_tier, verification_status")
        .in("user_id", clientUserIds)
    : { data: [], error: null };
  if (clientProfilesError) throw clientProfilesError;

  let authUsers: Array<{ id: string; email?: string }> = [];
  if (args.email) {
    const { data: userPage, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;
    authUsers = userPage.users
      .filter((user) => user.email?.toLowerCase() === args.email?.toLowerCase())
      .map((user) => ({ id: user.id, email: user.email ?? undefined }));
  }

  console.log(
    JSON.stringify(
      {
        inquiries: inquiryRows,
        participants: participants ?? [],
        talent_profiles: talentProfiles ?? [],
        messages: messages ?? [],
        client_profiles: clientProfiles ?? [],
        profiles: profiles ?? [],
        auth_users: authUsers,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
