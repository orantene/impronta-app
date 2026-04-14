import {
  AdminPageTabs,
  type AdminPageTabItem,
} from "@/components/admin/admin-page-tabs";
import { cn } from "@/lib/utils";

export type AdminStatusTabItem = AdminPageTabItem;

/**
 * Status / scope tabs — unified attached tab bar ({@link AdminPageTabs}).
 */
export function AdminStatusTabs({
  ariaLabel,
  items,
  className,
}: {
  ariaLabel: string;
  items: AdminStatusTabItem[];
  className?: string;
}) {
  return <AdminPageTabs ariaLabel={ariaLabel} items={items} className={cn(className)} />;
}
