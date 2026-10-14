/**
 * TUL-536: read-only Design switch preview. Looks up the existing site record
 * and NEVER provisions one: with no site yet there is nothing to lose, so the
 * summary is empty (the confirm sheet already degrades gracefully).
 */
import { summarizeSwitchWarnings, type DesignSwitchSummary } from "./design-switch-summary";
import type { DesignSwitchWarn } from "./design-switch";

export type PreviewSwitchDeps = {
  /** Read-only lookup of the talent's existing site id (null = none yet). */
  findSiteId: () => Promise<string | null>;
  /** Computes the warnings for an existing site. */
  preview: (siteId: string) => Promise<{ ok: true; warned: DesignSwitchWarn[] } | { ok: false; code: string; error: string }>;
  locale: "en" | "es";
};

export async function previewSwitchSummary(
  deps: PreviewSwitchDeps,
): Promise<
  { ok: true; data: DesignSwitchSummary } | { ok: false; code: string; error: string }
> {
  const siteId = await deps.findSiteId();
  if (!siteId) return { ok: true, data: summarizeSwitchWarnings([], deps.locale) };
  const res = await deps.preview(siteId);
  if (!res.ok) return res;
  return { ok: true, data: summarizeSwitchWarnings(res.warned, deps.locale) };
}
