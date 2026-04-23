import Link from "next/link";
import { UserPlus } from "lucide-react";
import { NewTalentForm } from "@/app/(dashboard)/admin/talent/new/new-talent-form";
import {
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_PAGE_STACK,
} from "@/lib/dashboard-shell-classes";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadTaxonomyTalentTypesForFilters } from "@/lib/dashboard/admin-dashboard-data";

export default async function AdminNewTalentPage() {
  const talentTypes = await loadTaxonomyTalentTypesForFilters();

  return (
    <div className={ADMIN_PAGE_STACK}>
      <Button
        variant="outline"
        size="sm"
        className={cn("w-fit rounded-full", ADMIN_OUTLINE_CONTROL_CLASS)}
        asChild
      >
        <Link href="/admin/talent" scroll={false}>
          ← Talent
        </Link>
      </Button>
      <AdminPageHeader
        icon={UserPlus}
        title="New talent profile"
        description="Create a roster entry without an account. The talent can claim it later by registering with a matching email. Profile starts in draft / hidden until you approve it."
      />
      <NewTalentForm talentTypes={talentTypes} />
    </div>
  );
}
