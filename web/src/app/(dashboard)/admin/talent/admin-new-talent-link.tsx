import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminNewTalentLink() {
  return (
    <Button size="sm" asChild>
      <Link href="/admin/talent/new" className="inline-flex items-center gap-1.5">
        <Plus className="size-4" aria-hidden />
        New talent
      </Link>
    </Button>
  );
}
