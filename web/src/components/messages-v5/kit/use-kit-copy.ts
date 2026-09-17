"use client";

import { useMemo } from "react";

import { useT } from "@/i18n/use-t";

import { buildKitCopy, type KitCopy } from "./copy";

/** The kit copy for the dashboard locale, one object per locale. */
export function useKitCopy(): KitCopy {
  const t = useT();
  return useMemo(() => buildKitCopy(t), [t]);
}
