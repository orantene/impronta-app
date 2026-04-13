import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { UserRoundCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminTalentAccountPage } from "@/app/(dashboard)/admin/talent/[id]/account/admin-talent-account-client";
import { Button } from "@/components/ui/button";
import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import {
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_PAGE_STACK,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export default async function AdminTalentAccountRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from("talent_profiles")
    .select("user_id, profile_code, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.user_id) notFound();
  if (data.deleted_at) {
    redirect(`/admin/talent/${id}`);
  }

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" className={cn("rounded-full", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
          <Link href={`/admin/talent/${id}`} scroll={false}>
            ← Back to overview
          </Link>
        </Button>
      </div>

      <TalentPageHeader
        icon={UserRoundCog}
        title="Account workspace"
        description="Manage sign-in access, role, account status, password resets, and linked talent identity fields from one place."
      />

      <AdminTalentAccountPage
        talentProfileId={id}
        userId={data.user_id as string}
        profileCode={data.profile_code as string}
      />
    </div>
  );
}
