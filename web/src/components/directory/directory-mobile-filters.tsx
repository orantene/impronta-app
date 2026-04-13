"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { DirectoryFiltersSidebar } from "./directory-filters-sidebar";
import type { DirectoryFilterSidebarBlock } from "@/lib/directory/field-driven-filters";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

export function DirectoryMobileFilters({
  blocks,
  selectedIds,
  locationSlug,
  heightMinCm = null,
  heightMaxCm = null,
  ui,
}: {
  blocks: DirectoryFilterSidebarBlock[];
  selectedIds: string[];
  locationSlug: string;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ui: DirectoryUiCopy;
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    selectedIds.length +
    (locationSlug.trim() ? 1 : 0) +
    (heightMinCm != null || heightMaxCm != null ? 1 : 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 md:hidden">
          <SlidersHorizontal className="size-4" />
          {ui.mobile.filters}
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{ui.mobile.sheetTitle}</SheetTitle>
          <SheetDescription>{ui.mobile.sheetDescription}</SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <DirectoryFiltersSidebar
            blocks={blocks}
            selectedIds={selectedIds}
            locationSlug={locationSlug}
            heightMinCm={heightMinCm ?? null}
            heightMaxCm={heightMaxCm ?? null}
            ui={ui}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
