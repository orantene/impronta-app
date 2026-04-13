import { notFound } from "next/navigation";
import { ADMIN_PAGE_WIDTH } from "@/lib/dashboard-shell-classes";
import { createClient } from "@/lib/supabase/server";
import { AdminTalentHubShell } from "@/app/(dashboard)/admin/talent/[id]/admin-talent-hub-shell";

export default async function AdminTalentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return <div className={ADMIN_PAGE_WIDTH}>{children}</div>;
  }

  const { data: profile, error } = await supabase
    .from("talent_profiles")
    .select("id, profile_code, display_name, workflow_status, visibility, deleted_at, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !profile) notFound();

  return (
    <div className={ADMIN_PAGE_WIDTH}>
      <AdminTalentHubShell
        profile={{
          id: profile.id as string,
          profile_code: profile.profile_code as string,
          display_name: (profile.display_name as string | null) ?? null,
          workflow_status: profile.workflow_status as string,
          visibility: profile.visibility as string,
          deleted_at: (profile.deleted_at as string | null) ?? null,
          user_id: (profile.user_id as string | null) ?? null,
        }}
      >
        {children}
      </AdminTalentHubShell>
    </div>
  );
}
