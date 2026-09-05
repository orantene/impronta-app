/**
 * tenant-home-meta.ts — the homepage <title> and meta description for a
 * tenant that does not represent people.
 *
 * WHY
 * ───
 * `app/page.tsx` falls back to `public.meta.homeTitle` ("Represented talent")
 * and `public.meta.homeDescription` ("Discover represented talent…") for every
 * tenant without a published homepage, an SEO title or a tagline. A restaurant
 * therefore shipped as "El Paisa — Represented talent · Tulala" with a
 * talent-agency description under it, on the page its owner looks at first.
 *
 * WHAT
 * ────
 * A pure function over the words engine's preset: when the preset does not
 * represent people, the descriptor is derived from the features it turns on
 * (menu, reservations, appointments, events), through i18n keys so it ships
 * in both languages. When the preset turns nothing on, the descriptor is
 * `null` and the caller uses the tenant's name alone: say nothing rather than
 * invent. Presets that represent people keep the agency strings untouched.
 */
import type { IndustryPreset } from "@/lib/words/presets";

export type BusinessHomeDescriptorKey =
  | "public.meta.businessHomeMenuReservations"
  | "public.meta.businessHomeMenu"
  | "public.meta.businessHomeReservations"
  | "public.meta.businessHomeAppointments"
  | "public.meta.businessHomeEvents";

/**
 * The i18n key for a business preset's homepage descriptor, or `null` when the
 * preset represents people (the agency strings apply) or turns on nothing this
 * function can name honestly.
 */
export function businessHomeDescriptorKey(
  preset: Pick<IndustryPreset, "representsPeople" | "features">,
): BusinessHomeDescriptorKey | null {
  if (preset.representsPeople) return null;
  const f = preset.features;
  if (f.menu && f.reservations) return "public.meta.businessHomeMenuReservations";
  if (f.menu) return "public.meta.businessHomeMenu";
  if (f.reservations) return "public.meta.businessHomeReservations";
  if (f.appointments) return "public.meta.businessHomeAppointments";
  if (f.events) return "public.meta.businessHomeEvents";
  return null;
}

/**
 * Title and description for a business tenant's homepage fallback.
 *
 * `t` is the request translator. Returns `null` for a preset that represents
 * people so the caller keeps its existing agency fallback verbatim.
 */
export function businessHomeMeta(
  preset: Pick<IndustryPreset, "representsPeople" | "features">,
  identity: {
    public_name?: string | null;
    tagline?: string | null;
  } | null,
  t: (key: string) => string,
): { title: string; description: string | null } | null {
  const key = businessHomeDescriptorKey(preset);
  if (preset.representsPeople) return null;
  const name = identity?.public_name?.trim() || "";
  const tagline = identity?.tagline?.trim() || "";
  const descriptor = key ? t(key) : "";
  const title = name && descriptor ? `${name} · ${descriptor}` : name || descriptor;
  const description = tagline || (name && descriptor ? `${name} · ${descriptor}` : null);
  if (!title) return null;
  return { title, description };
}
