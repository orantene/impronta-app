"use client";

import { useSyncExternalStore } from "react";

import { talentPublicProfileHref } from "./public-profile-href";

const noop = () => () => undefined;

/**
 * F41: the origin is read after hydration (server snapshot null), so the
 * server HTML and the first client render agree, then a local origin wins.
 */
export function useCurrentOrigin(): string | null {
  return useSyncExternalStore(noop, () => window.location.origin, () => null);
}

export function useTalentPublicProfileHref(profileCode: string | null | undefined): string | null {
  const origin = useCurrentOrigin();
  return profileCode ? talentPublicProfileHref(profileCode, origin) : null;
}
