/**
 * preview-surface-target.ts (X8) — the PURE "target surface → preview config
 * selection" mapping for the Lab component preview stage.
 *
 * F5 wired the Lab component preview against the GENERIC Lab subject
 * (`buildPlatformLabBuilderConfig(adapter, null)` — tenant default). X8 lets the
 * operator preview a connected card against any of the FOUR real builder
 * surfaces, so the card hydrates with that surface's real `previewSubjectKind`
 * instead of the generic Lab one.
 *
 * This module is React-free on purpose so the mapping is unit-testable without a
 * renderer. The preview stage imports it, derives the `previewSubjectKind` to
 * hand `buildPlatformLabBuilderConfig`, and reads `pickerKind` to know which
 * `PreviewSubjectPicker` (talent / workspace) to show.
 *
 * Why a single shared mapping (not branching in the component): the four config
 * builders in `builder-core/config.ts` already encode each surface's
 * `previewSubjectKind` (talent_page → "talent"; cms_page / site_shell → null —
 * tenant default). This table MIRRORS those builders 1:1 so the Lab preview's
 * hydration matches exactly what a tenant/talent gets on the live surface. The
 * `pickerKind` is the surface AUDIENCE — whom the operator picks a real subject
 * from — which is orthogonal to `previewSubjectKind` (a shell hydrates against
 * the tenant default yet is authored for a talent/workspace audience).
 */

import type { BuilderPreviewSubjectKind } from "@/lib/site-admin/builder-core/config";

/** The four real builder surfaces a connected component can be previewed
 *  against, plus `lab` — the generic, subject-less Lab default (F5 behaviour). */
export type PreviewSurfaceTarget =
  | "lab"
  | "talent_profile"
  | "talent_shell"
  | "workspace_page"
  | "workspace_shell";

/** The audience a real preview subject is picked from for a given surface.
 *  `null` → no subject picker (the generic Lab default renders against the
 *  active tenant). */
export type PreviewSubjectPickerKind = "talent" | "workspace" | null;

export interface PreviewSurfaceDescriptor {
  /** The surface this descriptor governs. */
  target: PreviewSurfaceTarget;
  /** Short, human label for the surface switcher. */
  label: string;
  /**
   * The `previewSubjectKind` the matching config builder produces — whom
   * connected nodes hydrate against in-canvas. MIRRORS `builder-core/config.ts`
   * exactly (talent_page → "talent"; cms_page / site_shell → null).
   */
  previewSubjectKind: BuilderPreviewSubjectKind;
  /**
   * Which `PreviewSubjectPicker` (if any) to show for this surface — the surface
   * AUDIENCE. Orthogonal to `previewSubjectKind`: a shell hydrates against the
   * tenant default (`previewSubjectKind: null`) yet is authored for a talent /
   * workspace audience, so the operator still picks a real subject to scope the
   * canvas render data against.
   */
  pickerKind: PreviewSubjectPickerKind;
}

/**
 * The canonical table — ONE row per surface, mirroring the four config builders.
 * Ordered for the surface switcher (generic Lab default first).
 */
export const PREVIEW_SURFACE_DESCRIPTORS: readonly PreviewSurfaceDescriptor[] = [
  {
    target: "lab",
    label: "Lab",
    // The generic Lab subject — tenant default, exactly F5's behaviour.
    previewSubjectKind: null,
    pickerKind: null,
  },
  {
    target: "talent_profile",
    // buildTalentPageBuilderConfig → previewSubjectKind: "talent".
    label: "Talent profile",
    previewSubjectKind: "talent",
    pickerKind: "talent",
  },
  {
    target: "talent_shell",
    // buildSiteShellBuilderConfig (talent subject) → previewSubjectKind: null.
    label: "Talent shell",
    previewSubjectKind: null,
    pickerKind: "talent",
  },
  {
    target: "workspace_page",
    // buildCmsPageBuilderConfig → previewSubjectKind: null (tenant default).
    label: "Workspace page",
    previewSubjectKind: null,
    pickerKind: "workspace",
  },
  {
    target: "workspace_shell",
    // buildSiteShellBuilderConfig (agency subject) → previewSubjectKind: null.
    label: "Workspace shell",
    previewSubjectKind: null,
    pickerKind: "workspace",
  },
] as const;

const DESCRIPTOR_BY_TARGET: Record<
  PreviewSurfaceTarget,
  PreviewSurfaceDescriptor
> = PREVIEW_SURFACE_DESCRIPTORS.reduce(
  (acc, d) => {
    acc[d.target] = d;
    return acc;
  },
  {} as Record<PreviewSurfaceTarget, PreviewSurfaceDescriptor>,
);

/** Resolve a surface target → its descriptor. Unknown / undefined → the generic
 *  Lab default, so the preview never breaks on an unexpected value. */
export function resolvePreviewSurfaceDescriptor(
  target: PreviewSurfaceTarget | null | undefined,
): PreviewSurfaceDescriptor {
  if (!target) return DESCRIPTOR_BY_TARGET.lab;
  return DESCRIPTOR_BY_TARGET[target] ?? DESCRIPTOR_BY_TARGET.lab;
}

/** The `previewSubjectKind` to hand `buildPlatformLabBuilderConfig` for a given
 *  surface target. The default (`lab` / unset) is `null` — F5's behaviour. */
export function previewSubjectKindForSurface(
  target: PreviewSurfaceTarget | null | undefined,
): BuilderPreviewSubjectKind {
  return resolvePreviewSurfaceDescriptor(target).previewSubjectKind;
}

/** Which subject picker (if any) a surface target shows. */
export function pickerKindForSurface(
  target: PreviewSurfaceTarget | null | undefined,
): PreviewSubjectPickerKind {
  return resolvePreviewSurfaceDescriptor(target).pickerKind;
}
