import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { TalentPortfolioStarterProfile, TalentPortfolioStarterMedia } from "./starter";
import type { TalentSiteSnapshot } from "./types";
import {
  DEFAULT_TALENT_PROFILE_TEMPLATE_SLUG,
  buildDefaultTalentProfileTree,
  hydrateTalentTree,
  selectServiceFocusLabels,
  stripSectionEmbeds,
  type TalentProfileTokens,
} from "./default-talent-tree";

/**
 * Runtime flag — the PLATFORM-DEFAULT FREEFORM talent profile.
 *
 * DEFAULT OFF. When unset / not exactly `"1"` or `"true"`, `/t/<code>` for a
 * talent with no published Max site renders EXACTLY as it does today: the
 * resolver returns `{ kind: "fallback" }` and the page falls through to the
 * hardcoded `LightProfileLayout`. Only when `DEFAULT_TALENT_FREEFORM_PROFILE`
 * is explicitly enabled does the resolver build + return a freeform snapshot.
 *
 * This is a SERVER-ONLY flag (read only inside the server resolver), so it is a
 * plain env var (NOT `NEXT_PUBLIC_*`) and never enters the client bundle.
 */
export function isDefaultTalentFreeformEnabled(): boolean {
  const raw = process.env.DEFAULT_TALENT_FREEFORM_PROFILE;
  return raw === "1" || raw === "true";
}

/**
 * Load the published reserved default-talent-profile builder tree, or `null`
 * when the row is absent / not published / empty. Falls OPEN to `null` on any
 * error so a transient DB hiccup degrades to the (untouched) slot/light
 * fallback rather than throwing.
 *
 * The lead authors this template in the Builder Lab; the built-in
 * `buildDefaultTalentProfileTree()` constant is only used by the seed script
 * and as the last-resort fallback in the resolver (see
 * `buildDefaultTalentFreeformSnapshot`).
 */
export async function loadPublishedDefaultTalentProfileTree(): Promise<
  BuilderNode[] | null
> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("builder_templates")
      .select("builder_tree, status")
      .eq("slug", DEFAULT_TALENT_PROFILE_TEMPLATE_SLUG)
      .maybeSingle();
    if (error) {
      logServerError("talentSite.defaultFreeform.loadTemplate", error);
      return null;
    }
    const row = data as { builder_tree: unknown; status: string } | null;
    if (!row || row.status !== "published") return null;
    const tree = Array.isArray(row.builder_tree)
      ? (row.builder_tree as BuilderNode[])
      : null;
    if (!tree || tree.length === 0) return null;
    return tree;
  } catch (err) {
    logServerError("talentSite.defaultFreeform.loadTemplate", err);
    return null;
  }
}

/** Project a starter profile + media into the flat `{{token}}` value map. */
export function talentProfileTokens(
  profile: TalentPortfolioStarterProfile,
  media: TalentPortfolioStarterMedia[],
): TalentProfileTokens {
  const displayName = profile.displayName.trim() || "Talent";
  const profilePath = `/t/${profile.profileCode}`;
  const tagline =
    profile.publicBio?.trim().slice(0, 160) ||
    [profile.primaryTypeLabel, profile.homeCity].filter(Boolean).join(" · ") ||
    "";
  // FIX B — the "Services & focus" cards come from the talent's ACTUAL services
  // (services menu), falling back to the discipline (`primaryTypeLabel`). NEVER
  // from `serviceAreaLabels` — those are geographic work markets / cities (shown
  // separately as "Based in {homeCity}"), not services.
  const services = selectServiceFocusLabels(
    profile.serviceNames,
    profile.primaryTypeLabel,
  );
  // FIX 5 — the hero headshot is chosen from a variant set that INCLUDES "card";
  // the gallery set OMITS "card", so on most profiles gallery[0] === headshotUrl
  // and the hero image would repeat as the first masonry tile. Exclude the
  // chosen headshot from the gallery so the hero never duplicates.
  const headshotUrl = profile.headshotUrl ?? "";
  const galleryUrls = media
    .map((m) => m.url)
    .filter((u) => Boolean(u) && u !== headshotUrl);

  // Disciplines — primary first, then non-primary talent types (de-duped). The
  // chip row hydrates `{{primaryTypeLabel}}` + `{{secondaryType1..3}}`; the
  // empty-card prune drops chips whose label resolved to "". `disciplinesLine`
  // is the same set joined " · " for a single-line alternative.
  const primaryTypeLabel = profile.primaryTypeLabel?.trim() ?? "";
  const secondaryTypes = (profile.secondaryTypeLabels ?? [])
    .map((label) => label?.trim())
    .filter((label): label is string => !!label && label !== primaryTypeLabel);
  const disciplinesLine = [primaryTypeLabel, ...secondaryTypes]
    .filter(Boolean)
    .join(" · ");

  // Full bio for the About paragraph — `richBio` when present, else the existing
  // short bio / tagline / a welcome line so About never reads blank.
  const richBio =
    profile.richBio?.trim() ||
    profile.publicBio?.trim() ||
    tagline ||
    `Welcome to ${displayName}'s profile.`;

  const languagesLine = profile.languagesLabel?.trim()
    ? `Languages: ${profile.languagesLabel.trim()}`
    : "";

  return {
    displayName,
    primaryTypeLabel,
    secondaryType1: secondaryTypes[0] ?? "",
    secondaryType2: secondaryTypes[1] ?? "",
    secondaryType3: secondaryTypes[2] ?? "",
    disciplinesLine,
    tagline,
    bio: profile.publicBio?.trim() || tagline || `Welcome to ${displayName}'s profile.`,
    richBio,
    locationLine: profile.homeCity ? `Based in ${profile.homeCity}` : "",
    languagesLine,
    headshotUrl,
    profilePath,
    inquireHref: `${profilePath}?inquire=1`,
    service1: services[0] ?? "",
    service2: services[1] ?? "",
    service3: services[2] ?? "",
    gallery: galleryUrls.slice(0, 6),
  };
}

/**
 * Build a FREEFORM `TalentSiteSnapshot` for a talent from the (Lab-authored or
 * built-in) default tree, hydrating per-talent `{{token}}` slots with the
 * talent's real profile data. Returns `null` only when the flag is OFF (caller
 * then keeps the slot/light fallback).
 *
 * Resolution order for the tree:
 *   1. the published reserved Lab template (`__platform_default_talent_profile__`)
 *   2. the built-in `buildDefaultTalentProfileTree()` constant
 * So enabling the flag shows a premium default even BEFORE the lead seeds the
 * Lab template; once seeded, the Lab edit becomes the source of truth.
 */
export async function buildDefaultTalentFreeformSnapshot(input: {
  profile: TalentPortfolioStarterProfile;
  media: TalentPortfolioStarterMedia[];
}): Promise<TalentSiteSnapshot | null> {
  if (!isDefaultTalentFreeformEnabled()) return null;

  const labTree = await loadPublishedDefaultTalentProfileTree();
  // FIX 3 — the default talent tree is intentionally embed-free. A talent-subject
  // curated `section_embed` is unsupported (the preview-subject machinery never
  // returns the "talent" kind) and would mis-scope to the managing AGENCY
  // tenant's data, so defensively strip any embed a Lab-author placed in the
  // reserved template before rendering.
  const baseTree = stripSectionEmbeds(labTree ?? buildDefaultTalentProfileTree());
  const tokens = talentProfileTokens(input.profile, input.media);
  const tree = hydrateTalentTree(baseTree, tokens);

  const title = tokens.displayName;
  const intro = tokens.tagline || tokens.bio.slice(0, 160) || null;

  return {
    version: 1,
    siteKind: "talent_personal",
    templateKey: DEFAULT_TALENT_PROFILE_TEMPLATE_SLUG,
    compositionMode: "freeform",
    publishedAt: null,
    pageVersion: 1,
    locale: "en",
    fields: {
      title,
      metaDescription: intro,
      introTagline: intro,
    },
    templateSchemaVersion: 1,
    slots: [],
    builderTree: tree,
  };
}
