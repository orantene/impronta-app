/**
 * Which profile template renders a talent — the one place that decides.
 *
 * Lived inline in profile-view.tsx until 2026-09-23, where it grew by about
 * seven lines every time a template was added and pushed that already 2,700-line
 * file past its size budget. It is pure selection logic with no data access, so
 * it belongs beside the template catalogue rather than inside a view.
 *
 * The tenant picks a family with the `template.profile-layout-family` design
 * token in `agency_branding.theme_json`; a `?template=` query param overrides
 * it for QA and preview. Anything unrecognised falls back to Classic, so a
 * typo in a token degrades to the default rather than to a blank page.
 *
 * The return type is deliberately the WIDEST template's props. Every template
 * accepts `LightProfileLayoutProps` and Maison's are that plus optional extras,
 * so all five are assignable here (a function taking the wider parameter
 * accepts the narrower argument) and one shared render site can pass the
 * extras. Templates that do not read them ignore them, exactly as Classic and
 * Noir already ignore themeMode/themeVars.
 */

import type React from "react";

import { AtelierProfileLayout } from "../_atelier/AtelierProfileLayout";
import { LightProfileLayout } from "../_light/LightProfileLayout";
import { LumenProfileLayout } from "../_lumen/LumenProfileLayout";
import {
  MaisonProfileLayout,
  type MaisonProfileLayoutProps,
} from "../_maison/MaisonProfileLayout";
import { NoirProfileLayout } from "../_noir/NoirProfileLayout";

const TEMPLATES = {
  noir: NoirProfileLayout,
  lumen: LumenProfileLayout,
  atelier: AtelierProfileLayout,
  maison: MaisonProfileLayout,
  classic: LightProfileLayout,
} as const satisfies Record<string, React.ComponentType<MaisonProfileLayoutProps>>;

export type ProfileTemplateKey = keyof typeof TEMPLATES;

/** True for a `?template=` value this build actually has a template for. */
export function isProfileTemplateKey(raw: unknown): raw is ProfileTemplateKey {
  return typeof raw === "string" && raw in TEMPLATES;
}

export function resolveProfileTemplate(
  queryOverride: unknown,
  brandingTheme: Record<string, unknown>,
): { key: ProfileTemplateKey; Template: React.ComponentType<MaisonProfileLayoutProps> } {
  const family = brandingTheme["template.profile-layout-family"];
  const key = isProfileTemplateKey(queryOverride)
    ? queryOverride
    : isProfileTemplateKey(family)
      ? family
      : "classic";
  return { key, Template: TEMPLATES[key] };
}
