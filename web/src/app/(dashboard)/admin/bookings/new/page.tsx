import Link from "next/link";
import { ManualBookingForm } from "@/app/(dashboard)/admin/bookings/new/manual-booking-form";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import {
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/server/action-guards";

export default async function AdminNewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  const auth = await requireStaff();
  if (!auth.ok) {
    return <p className="text-sm text-muted-foreground">{auth.error}</p>;
  }
  const { supabase, user } = auth;

  const [{ data: accounts }, { data: contactRows }, { data: talents }, { data: staff }, { data: platformClients }] =
    await Promise.all([
      supabase.from("client_accounts").select("id, name").is("archived_at", null).order("name", { ascending: true }),
      supabase
        .from("client_account_contacts")
        .select("id, client_account_id, full_name, client_accounts(name)")
        .is("archived_at", null)
        .order("full_name", { ascending: true }),
      supabase
        .from("talent_profiles")
        .select("id, profile_code, display_name")
        .is("deleted_at", null)
        .order("profile_code", { ascending: true })
        .limit(400),
      supabase.from("profiles").select("id, display_name").in("app_role", ["super_admin", "agency_staff"]),
      supabase
        .from("profiles")
        .select("id, display_name")
        .eq("app_role", "client")
        .order("display_name", { ascending: true })
        .limit(500),
    ]);

  type ContactRow = {
    id: string;
    client_account_id: string;
    full_name: string;
    client_accounts: { name: string } | { name: string }[] | null;
  };
  const contacts = (contactRows ?? []).map((row: ContactRow) => {
    const acc = row.client_accounts;
    const accName = Array.isArray(acc) ? acc[0]?.name : acc?.name;
    return {
      id: row.id,
      client_account_id: row.client_account_id,
      label: accName ? `${row.full_name} · ${accName}` : row.full_name,
    };
  });

  return (
    <div className={ADMIN_PAGE_STACK}>
      <Button variant="outline" size="sm" className={cn("w-fit rounded-full", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
        <Link href="/admin/bookings" scroll={false}>
          ← All bookings
        </Link>
      </Button>

      <TalentPageHeader
        title="New booking"
        description="Create a commercial job without an inquiry — phone closes, repeats, or internal jobs."
      />

      {err ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(() => {
            try {
              return decodeURIComponent(err);
            } catch {
              return err;
            }
          })()}
        </p>
      ) : null}

      <DashboardSectionCard title="Details" description={null} titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <ManualBookingForm
          key={(accounts ?? []).map((a) => a.id).sort().join("-")}
          accounts={accounts ?? []}
          contacts={contacts}
          talents={(talents ?? []) as { id: string; profile_code: string; display_name: string | null }[]}
          staff={staff ?? []}
          defaultOwnerId={user.id}
          platformClients={(platformClients ?? []) as { id: string; display_name: string | null }[]}
        />
      </DashboardSectionCard>
    </div>
  );
}
