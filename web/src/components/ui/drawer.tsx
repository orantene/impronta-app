"use client";

/**
 * App drawer / side panel — same primitives as `sheet.tsx` (shared motion + width).
 */
export {
  Sheet as Drawer,
  SheetPortal as DrawerPortal,
  SheetOverlay as DrawerOverlay,
  SheetTrigger as DrawerTrigger,
  SheetClose as DrawerClose,
  SheetContent as DrawerContent,
  SheetHeader as DrawerHeader,
  SheetFooter as DrawerFooter,
  SheetTitle as DrawerTitle,
  SheetDescription as DrawerDescription,
} from "@/components/ui/sheet";

import { SheetContent } from "@/components/ui/sheet";

export const Panel = SheetContent;
export const SidePanel = SheetContent;
