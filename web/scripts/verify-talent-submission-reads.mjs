import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.TALENT_EMAIL?.trim().toLowerCase();
const password = process.env.TALENT_PASSWORD ?? "";

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

if (!email || !password) {
  console.error("Missing TALENT_EMAIL or TALENT_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function summarizeRows(rows, pick) {
  return (rows ?? []).map((row) => pick(row));
}

async function main() {
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  const user = signIn.data.user;
  if (!user) {
    throw new Error("Authenticated user was not returned.");
  }

  const profileRes = await supabase
    .from("talent_profiles")
    .select("id, user_id, workflow_status, visibility, display_name")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (profileRes.error) throw profileRes.error;
  if (!profileRes.data) throw new Error("Talent profile not found for authenticated user.");

  const talentProfile = profileRes.data;

  const [snapshotsRes, historyRes, consentsRes] = await Promise.all([
    supabase
      .from("talent_submission_snapshots")
      .select("id, created_at, workflow_status_at_submit, completion_score_at_submit, snapshot")
      .eq("talent_profile_id", talentProfile.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("talent_submission_history")
      .select(
        "id, submitted_at, workflow_state_before, workflow_state_after, submission_kind, submission_snapshot_id, terms_consent_id, accepted_terms_version, source_revision_id",
      )
      .eq("talent_profile_id", talentProfile.id)
      .order("submitted_at", { ascending: false })
      .limit(8),
    supabase
      .from("talent_submission_consents")
      .select("id, accepted_at, consent_type, terms_version, submission_context")
      .eq("talent_profile_id", talentProfile.id)
      .order("accepted_at", { ascending: false })
      .limit(8),
  ]);

  for (const res of [snapshotsRes, historyRes, consentsRes]) {
    if (res.error) throw res.error;
  }

  console.log(
    JSON.stringify(
      {
        authenticatedUserId: user.id,
        authenticatedEmail: user.email,
        talentProfile,
        counts: {
          snapshots: snapshotsRes.data?.length ?? 0,
          history: historyRes.data?.length ?? 0,
          consents: consentsRes.data?.length ?? 0,
        },
        snapshots: summarizeRows(snapshotsRes.data, (row) => ({
          id: row.id,
          created_at: row.created_at,
          workflow_status_at_submit: row.workflow_status_at_submit,
          completion_score_at_submit: row.completion_score_at_submit,
          snapshot_keys:
            row.snapshot && typeof row.snapshot === "object"
              ? Object.keys(row.snapshot).sort()
              : [],
        })),
        history: summarizeRows(historyRes.data, (row) => ({
          id: row.id,
          submitted_at: row.submitted_at,
          workflow_state_before: row.workflow_state_before,
          workflow_state_after: row.workflow_state_after,
          submission_kind: row.submission_kind,
          accepted_terms_version: row.accepted_terms_version,
          submission_snapshot_id: row.submission_snapshot_id,
          terms_consent_id: row.terms_consent_id,
        })),
        consents: summarizeRows(consentsRes.data, (row) => ({
          id: row.id,
          accepted_at: row.accepted_at,
          consent_type: row.consent_type,
          terms_version: row.terms_version,
          submission_context: row.submission_context,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("verify-talent-submission-reads failed");
  console.error(error);
  process.exit(1);
});
