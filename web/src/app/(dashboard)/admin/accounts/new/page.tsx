import Link from "next/link";
import { NewAccountForm } from "@/app/(dashboard)/admin/accounts/new/new-account-form";
import { ADMIN_OUTLINE_CONTROL_CLASS, ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AdminNewClientAccountPage() {
  return (
    <div className={ADMIN_PAGE_STACK}>
      <Button variant="outline" size="sm" className={cn("w-fit rounded-full", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
        <Link href="/admin/accounts" scroll={false}>
          ← Client Locations
        </Link>
      </Button>
      <h1 className="font-display text-2xl font-medium text-foreground">New Client Location</h1>
      <p className="text-sm text-muted-foreground">
        The place or business unit the work is for (villa, club, restaurant, etc.). One client can have several
        locations. You can also create from the list using the side sheet — this page is the full-page fallback.
      </p>
      <NewAccountForm />
    </div>
  );
}
