/**
 * THEME CORE P0-4: the pin guard (pure).
 *
 * `talent_sites.theme_design_version` is the BASE every upgrade merge diffs
 * against and the number every "is there an update for me" check compares to.
 * A real (non-demo) site pinned to a version that no `optin` / `default`
 * PUBLISHED release covers is invisible to the offer system (nothing can sit
 * above it) and its merges diff against a base that was never released. On
 * 2026-10-08 six real Maison v2 sites were pinned to v24, whose only release
 * row is a demos-channel draft.
 *
 * Rules, in order (the first match decides):
 *  1. Demo sites: always allowed. They follow the demos channel on purpose.
 *  2. The design has no release row of ANY kind (gridline, solace, mono, frame
 *     at their code-seed / sync baseline): allowed. No offer can exist for it
 *     and no site could otherwise be created on those designs. Nothing is
 *     "above" a latest release that does not exist.
 *  3. The version equals a published optin/default release version: allowed.
 *  4. The version is at or below the latest published optin/default version:
 *     allowed (an older pin is simply offered the newer releases).
 *  5. The design has release rows but none is open (published optin/default):
 *     allowed only for versions BELOW the lowest version any of those rows
 *     minted (the pre-release baseline). Otherwise refused.
 *  6. Anything else (above the latest open release): refused.
 */
import type { ReleaseChannel, ReleaseStatus } from "./types";

/** The slice of a `talent_theme_releases` row the guard reads. */
export interface PinGuardRelease {
  /** Optional: when present, rows of other designs are ignored. */
  design_slug?: string;
  to_version: number;
  channel: ReleaseChannel;
  status: ReleaseStatus;
}

export interface PinGuardInput {
  design: string;
  version: number;
  isDemoSite: boolean;
  releases: ReadonlyArray<PinGuardRelease>;
}

export type PinGuardOk = {
  ok: true;
  why: "demo" | "no_releases_baseline" | "released" | "below_latest" | "below_unreleased_baseline";
};

export type PinGuardRefusal = {
  ok: false;
  code: "unreleased_version";
  /** Highest published optin/default version, or null when none is open. */
  latestReleased: number | null;
  reason: { en: string; es: string };
};

export type PinGuardResult = PinGuardOk | PinGuardRefusal;

const isOpen = (r: PinGuardRelease): boolean =>
  r.status === "published" && (r.channel === "optin" || r.channel === "default");

export function canPinSiteToVersion(input: PinGuardInput): PinGuardResult {
  if (input.isDemoSite) return { ok: true, why: "demo" };
  const rows = input.releases.filter((r) => r.design_slug === undefined || r.design_slug === input.design);
  if (rows.length === 0) return { ok: true, why: "no_releases_baseline" };

  const openVersions = rows.filter(isOpen).map((r) => r.to_version);
  if (openVersions.includes(input.version)) return { ok: true, why: "released" };
  const latest = openVersions.length > 0 ? Math.max(...openVersions) : null;
  if (latest !== null && input.version <= latest) return { ok: true, why: "below_latest" };
  if (latest === null) {
    const lowestMinted = Math.min(...rows.map((r) => r.to_version));
    if (input.version < lowestMinted) return { ok: true, why: "below_unreleased_baseline" };
  }
  return {
    ok: false,
    code: "unreleased_version",
    latestReleased: latest,
    reason: {
      en: `Version ${input.version} of this design has not been released yet, so a live site cannot be set to it.`,
      es: `La versión ${input.version} de este diseño aún no se ha publicado, así que un sitio en vivo no puede usarla.`,
    },
  };
}
