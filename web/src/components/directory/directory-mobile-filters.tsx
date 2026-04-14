"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { DirectoryFiltersSidebar } from "./directory-filters-sidebar";
import type { DirectoryFilterSidebarBlock } from "@/lib/directory/field-driven-filters";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";

export function DirectoryMobileFilters({
  blocks,
  selectedIds,
  locationSlug,
  heightMinCm = null,
  heightMaxCm = null,
  ageMin = null,
  ageMax = null,
  fieldFacets,
  ui,
}: {
  blocks: DirectoryFilterSidebarBlock[];
  selectedIds: string[];
  locationSlug: string;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  ui: DirectoryUiCopy;
}) {
  const [open, setOpen] = useState(false);
  const scalarFacetCount = fieldFacets.filter((f) => f.values.some((v) => v.trim())).length;
  const activeCount =
    selectedIds.length +
    (locationSlug.trim() ? 1 : 0) +
    (heightMinCm != null || heightMaxCm != null ? 1 : 0) +
    (ageMin != null || ageMax != null ? 1 : 0) +
    scalarFacetCount;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 md:hidden">
          <SlidersHorizontal className="size-4" />
          {ui.mobile.filters}
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </DrawerTrigger>
      <DrawerContent side="left" className="w-full overflow-y-auto sm:max-w-sm">
        <DrawerHeader>
          <DrawerTitle>{ui.mobile.sheetTitle}</DrawerTitle>
          <DrawerDescription>{ui.mobile.sheetDescription}</DrawerDescription>
        </DrawerHeader>
        <div className="mt-6">
          <DirectoryFiltersSidebar
            blocks={blocks}
            selectedIds={selectedIds}
            locationSlug={locationSlug}
            heightMinCm={heightMinCm ?? null}
            heightMaxCm={heightMaxCm ?? null}
            ageMin={ageMin ?? null}
            ageMax={ageMax ?? null}
            fieldFacets={fieldFacets}
            ui={ui}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
