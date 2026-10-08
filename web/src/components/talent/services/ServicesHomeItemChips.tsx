"use client";

/**
 * The Services home row's state chips plus the quiet missing-translation cue.
 *
 * The talent's languages come from the server-provided shell settings
 * (`useAdminShell().talentLocales`, set by the talent layout), with the client
 * content-locale store only as a fallback: that store reports ONE language
 * until the top bar seeds it, which would hide the chip on first paint.
 */
import type { ComponentProps } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useTalentFieldLocales } from "@/components/locale-field/use-talent-field-locales";
import { listLocales } from "@/lib/talent/offering-missing-translation";
import { ItemStateChips } from "./ItemStateChips";

export function ServicesHomeItemChips(props: Omit<ComponentProps<typeof ItemStateChips>, "primary" | "locales">) {
  const { talentLocales } = useAdminShell();
  const store = useTalentFieldLocales();
  const { primary, locales } = listLocales(talentLocales, store);
  return <ItemStateChips {...props} primary={primary} locales={locales} />;
}
