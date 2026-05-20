// Phase-1f decomp — ProfileShellPayload / TYPE_DEFAULTS / LANGUAGE_PRESETS /
// PROFILE_SECTIONS / SECTION_META / ageString / ProfileState / ProfileAction /
// profileReducer / makeInitialProfileState / _editorHydrationInFlight cast.
// Byte-for-byte from the original profile-shell-internal.tsx.
"use client";
import {
  AvailabilityCell,
  BioTone,
  BridgeTalentSelfProfile,
  FieldLockPath,
  LocaleBio,
  LocaleCode,
  MY_TALENT_PROFILE,
  MyTalentProfile,
  PackageRate,
  PastClient,
  Personality,
  PhotoMeta,
  ProfileDraft,
  ProfileIdentity,
  ProfileLanguage,
  ProfileRate,
  RateUnit,
  RecurringPattern,
  SeasonalWindow,
  ServiceArea,
  SkillEntry,
  SkillProficiency,
  TALENT_PROFILES_BY_ID,
  TAXONOMY,
  VacationWindow,
  Verifications,
  VideoSlot,
  actionLoadTalentMediaBundle,
  getProfileById,
  loadTalentProfileEditorData,
  parseVideoUrl,
  readProfileDraft,
} from "../../drawer-shared";

export type ProfileShellPayload = {
  /** Mode controls header copy + which sections are gated. */
  mode?: "create" | "edit-admin" | "edit-self";
  /** Phase B — canonical talent id. When set, the drawer loads the
   *  talent's full profile from `TALENT_PROFILES_BY_ID[talentId]` and
   *  writes back through the override store keyed by the same id.
   *  Replaces the old "match by stage name" behavior so any talent
   *  (not just Marta) can be edited with the same shell. */
  talentId?: string;
  /** Section to land on. When set, the shell skips its default
   *  (identity for edit, services for create) and opens directly on
   *  this section. Used by the talent's MyProfilePage to deep-link
   *  from each dashboard card straight into the right section. */
  section?: string;
  /** Pre-filled fields handed off from NewTalentDrawer or approval queue. */
  seed?: {
    stageName?: string;
    primaryType?: string;
    homeBase?: string;
    /** Canonical talent code (TAL-NNNNN) — shown under the name in the
     *  drawer header so admins can reference the talent by stable id. */
    profileCode?: string;
    method?: "agency" | "invited" | "draft";
    contact?: string;
    // From approval queue (talent's submitted registration data):
    secondaryTypes?: string[];
    specialties?: string[];
    serviceCities?: string[];
    travelKm?: number;
    bio?: string;
    photoCount?: number;
    fields?: Record<string, string | string[]>;
    languages?: ProfileLanguage[];
    // New canonical fields — populated when the shell opens an existing
    // talent (e.g. workspace admin clicking a roster row). These let
    // the bridge from MY_TALENT_PROFILE.travel.{passports,workAuth}
    // hydrate cleanly into ProfileState.
    nationality?: string;
    homeCountry?: string;
    responseTime?: "1h" | "4h" | "24h" | "48h";
    passport?: "valid" | "expired" | "none";
    driversLicense?: "none" | "standard" | "commercial" | "international";
    ownsVehicle?: boolean;
    workEligibility?: string[];
    visaCountries?: string[];
  };
};


export function findChild(typeId: string | null) {
  if (!typeId) return null;
  for (const p of TAXONOMY) {
    const c = p.children.find(x => x.id === typeId);
    if (c) return { parent: p, child: c };
  }
  return null;
}

// ── Smart defaults per Talent Type ───────────────────────────────────
// When a primary type is picked, we pre-suggest specialties and a bio
// template so the talent doesn't stare at a blank canvas. Untouched if
// the talent has already typed something.

export type TypeDefaults = {
  defaultSpecialties: string[];
  bioTemplate: (vars: { stageName?: string; homeBase?: string; languages?: string[] }) => string;
};


export const TYPE_DEFAULTS: Record<string, TypeDefaults> = {
  fashion:      { defaultSpecialties: ["Editorial"],       bioTemplate: (v) => `Editorial fashion model${v.homeBase ? ` based in ${v.homeBase}` : ""}.${v.languages?.length ? ` ${v.languages.slice(0, 2).join(" · ")}.` : ""}` },
  promotional:  { defaultSpecialties: ["Brand activation"],bioTemplate: (v) => `Promotional model${v.homeBase ? ` working ${v.homeBase} and surrounds` : ""}.${v.languages?.length ? ` ${v.languages.slice(0, 2).join(" · ")}.` : ""}` },
  content:      { defaultSpecialties: ["UGC"],              bioTemplate: (v) => `Content model + UGC creator${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  commercial:   { defaultSpecialties: ["Print"],            bioTemplate: (v) => `Commercial model${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  vip_host:     { defaultSpecialties: ["Hotel"],            bioTemplate: (v) => `VIP host${v.homeBase ? ` based in ${v.homeBase}` : ""}.${v.languages?.length ? ` Speaks ${v.languages.slice(0, 2).join(" + ")}.` : ""}` },
  brand_amb:    { defaultSpecialties: ["Activation"],       bioTemplate: (v) => `Brand ambassador${v.homeBase ? ` covering ${v.homeBase}` : ""}.` },
  mc:           { defaultSpecialties: ["Wedding"],          bioTemplate: (v) => `MC for events${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  promoter:     { defaultSpecialties: ["Nightclub"],        bioTemplate: (v) => `Promoter${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  dj:           { defaultSpecialties: ["House"],            bioTemplate: (v) => `DJ${v.homeBase ? ` from ${v.homeBase}` : ""} — clubs, festivals, private events.` },
  singer:       { defaultSpecialties: ["Pop"],              bioTemplate: (v) => `Vocalist${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  band:         { defaultSpecialties: [],                   bioTemplate: (v) => `Live band${v.homeBase ? ` from ${v.homeBase}` : ""}.` },
  musician:     { defaultSpecialties: [],                   bioTemplate: (v) => `Musician${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  private_chef: { defaultSpecialties: ["Mediterranean"],    bioTemplate: (v) => `Private chef${v.homeBase ? ` in ${v.homeBase}` : ""}. Tasting menus 6–24 guests.` },
  mixologist:   { defaultSpecialties: ["Cocktail menu"],    bioTemplate: (v) => `Mixologist${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  fire:         { defaultSpecialties: ["Poi"],              bioTemplate: (v) => `Fire performer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  dancer:       { defaultSpecialties: [],                   bioTemplate: (v) => `Dancer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  belly_dancer: { defaultSpecialties: ["Egyptian"],         bioTemplate: (v) => `Belly dancer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  acrobat:      { defaultSpecialties: ["Silk"],             bioTemplate: (v) => `Aerial acrobat${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  chauffeur:    { defaultSpecialties: ["VIP"],              bioTemplate: (v) => `Professional chauffeur${v.homeBase ? ` covering ${v.homeBase}` : ""}.` },
  airport:      { defaultSpecialties: [],                   bioTemplate: (v) => `Airport transfer driver${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  massage:      { defaultSpecialties: ["Deep tissue"],      bioTemplate: (v) => `Massage therapist${v.homeBase ? ` in ${v.homeBase}` : ""}, mobile + studio.` },
  yoga:         { defaultSpecialties: ["Vinyasa"],          bioTemplate: (v) => `Yoga instructor${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  housekeeper:  { defaultSpecialties: ["Villa"],            bioTemplate: (v) => `Housekeeper${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  butler:       { defaultSpecialties: ["Service"],          bioTemplate: (v) => `Butler${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  photographer: { defaultSpecialties: [],                   bioTemplate: (v) => `Photographer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  videographer: { defaultSpecialties: [],                   bioTemplate: (v) => `Videographer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
};


export function getTypeDefaults(typeId: string | null): TypeDefaults {
  if (!typeId) return { defaultSpecialties: [], bioTemplate: () => "" };
  return TYPE_DEFAULTS[typeId] ?? {
    defaultSpecialties: [],
    bioTemplate: (v) => `${(findChild(typeId)?.child.label ?? "Talent")}${v.homeBase ? ` based in ${v.homeBase}` : ""}.`,
  };
}

// Common language combos — one tap adds 2-3 languages with sensible levels.

export const LANGUAGE_PRESETS: { id: string; label: string; langs: string[] }[] = [
  { id: "en-es",    label: "EN + ES",       langs: ["English", "Spanish"] },
  { id: "en-fr",    label: "EN + FR",       langs: ["English", "French"] },
  { id: "en-it",    label: "EN + IT",       langs: ["English", "Italian"] },
  { id: "en-de",    label: "EN + DE",       langs: ["English", "German"] },
  { id: "en-fr-it", label: "EN + FR + IT",  langs: ["English", "French", "Italian"] },
  { id: "rivmaya",  label: "Riviera Maya",  langs: ["Spanish", "English", "French"] },
];

// Section IDs — used by mobile tab nav and the active-section accordion.
// Identity is the first section ever — name, pronouns, gender, DOB.

export const PROFILE_SECTIONS = [
  "identity", "services", "location", "logistics", "media", "albums", "polaroids",
  "about", "profile_fields",
  "physical", "wardrobe", "details", "rates", "availability",
  "refinement", "credits", "limits", "files",
  "social_proof", "verifications", "agency_fields", "admin",
] as const;

export type ProfileSectionId = typeof PROFILE_SECTIONS[number] | "";


export const SECTION_META: Record<Exclude<ProfileSectionId, "">, { label: string; emoji: string }> = {
  identity:      { label: "Identity",      emoji: "👤" },
  services:      { label: "Services",      emoji: "🎯" },
  location:      { label: "Location",      emoji: "📍" },
  logistics:     { label: "Logistics",     emoji: "🧳" },
  media:         { label: "Media",         emoji: "📷" },
  albums:        { label: "Albums",        emoji: "🗂" },
  polaroids:     { label: "Polaroids",     emoji: "🪪" },
  about:         { label: "About",         emoji: "✏️" },
  profile_fields:{ label: "Details", emoji: "🧬" },
  physical:      { label: "Physical",      emoji: "📐" },
  wardrobe:      { label: "Wardrobe",      emoji: "👗" },
  details:       { label: "Details",       emoji: "📋" },
  rates:         { label: "Rates",         emoji: "💶" },
  availability:  { label: "Availability",  emoji: "📅" },
  refinement:    { label: "Extra details",  emoji: "✦" },
  credits:       { label: "Credits",       emoji: "🏆" },
  limits:        { label: "Restrictions",  emoji: "⊘" },
  files:         { label: "Files",         emoji: "📎" },
  social_proof:  { label: "Past clients",  emoji: "⭐" },
  verifications: { label: "Trust",         emoji: "🛡" },
  agency_fields: { label: "Agency Fields", emoji: "🧬" },
  admin:         { label: "Admin",         emoji: "🔒" },
};


export function ageString(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// ════════════════════════════════════════════════════════════════════
// Profile state — single reducer to support undo/redo (Phase 4 +20).
// ════════════════════════════════════════════════════════════════════


export type ProfileState = {
  // Identity (Phase 4 +30 — separated from Talent Type per spec)
  identity: ProfileIdentity;

  // Display
  stageName: string;
  tagline: string;
  bios: LocaleBio[];
  bioActiveLocale: LocaleCode;
  bioTone: BioTone;
  personality: Personality;

  // Services
  primaryType: string | null;
  secondaryTypes: string[];
  /** What the talent is growing into. Surfaced as "open to grow" in Discover. */
  aspirations: string[];
  specialties: string[];

  // Location
  serviceArea: ServiceArea;
  /** Seasonal "I'm here X months a year" windows. */
  seasonalWindows: SeasonalWindow[];

  // Media
  /** Albums now carry per-photo metadata (tag, alt, caption). */
  albumsPro: { id: string; name: string; items: PhotoMeta[] }[];
  activeAlbumId: string;
  videoLinks: string[];
  /** Per-album short video clip (15s preview). */
  videoClip: VideoSlot | null;
  /** 30-sec hello reel — top-of-profile intro. */
  helloReel: VideoSlot | null;
  /** Industry-standard polaroid set: front / side / back / smile / no makeup. */
  polaroids: { id: string; angle: string; url: string | null; mediaAssetId?: string | null }[];

  // Files — work documents (W-8BEN, NDA, model release, certifications, …).
  // When `storagePath` is set, the file lives in the private media-originals
  // bucket and can be downloaded via actionGetTalentDocumentSignedUrl.
  files: { id: string; name: string; kind: string; sizeBytes?: number; uploadedAt: string; storagePath?: string; bucketId?: string; mimeType?: string; uploading?: boolean }[];

  // Limits — hard/soft constraints (no nudity, no fur, etc.)
  limits: { id: string; category: string; label: string; enforcement: "hard" | "soft" }[];

  // Credits — past work (campaigns, editorials, runway, lookbooks)
  credits: { id: string; year: string; brand: string; type: string; credit?: string; role?: string; pinned?: boolean }[];

  // Type-specific dynamic fields
  dynFields: Record<string, string | string[]>;
  /** Per-dyn-field visibility overrides keyed by field id. Engine
   *  reads this per channel; falls back to RegField.defaultVisibility
   *  when not set. */
  dynFieldVisibility: Record<string, ReadonlyArray<"public" | "agency" | "private">>;

  // Rates (per-unit + packages + travel/lodging toggles)
  rates: ProfileRate[];
  /** Channel-tier overrides — direct vs agency vs hub. */
  rateTiers: { typeId: string; tier: "direct" | "agency" | "hub"; amount: number; currency: string; unit: RateUnit }[];
  packageRates: PackageRate[];
  travelIncluded: boolean;
  lodgingIncluded: boolean;
  askForQuote: boolean;

  // Availability
  availability: AvailabilityCell[];
  recurring: RecurringPattern;
  vacation: VacationWindow | null;

  // Languages
  languages: ProfileLanguage[];

  // Refinement (skills with proficiency + contexts)
  skillEntries: SkillEntry[];
  contexts: string[];

  // Social proof
  pastClients: PastClient[];

  // Verification
  verifications: Verifications;

  // Admin
  profileStatus: "draft" | "pending" | "published" | "hidden";
  featureInDirectory: boolean;
  /** Talent master switch for cross-tenant Discover catalog. Distinct from
   *  `featureInDirectory` which is the per-roster admin "boost on Discover"
   *  flag. See web/docs/discover-and-unified-inquiry-2026-05-14.md. */
  isDiscoverable: boolean;
  internalNotes: string;
  /** Emergency contact — masked on public, visible during active
   *  bookings only. Stored on the profile because it's tied to the
   *  talent's identity, not workspace settings. */
  emergencyContact: { name: string; relation: string; phone: string };
  /** Rate card visibility — public / agency-only / on-request.
   *  Drives whether clients see numbers on the public profile or
   *  have to inquire through the agency. */
  rateCardVisibility: "public" | "agency-only" | "on-request";
  /** Field paths the agency has locked from talent self-edit. */
  fieldLocks: FieldLockPath[];
  /** Step 7 — per-lock reason text. Sparse map keyed by path; an
   *  entry without a reason renders an editable "(no reason)" prompt
   *  in the locks-overview panel and shows nothing in-context. */
  fieldLockReasons: Record<string, string>;
};


export type ProfileAction =
  | { type: "PATCH"; patch: Partial<ProfileState> }
  | { type: "TOGGLE_SET"; field: "secondaryTypes" | "specialties" | "contexts" | "aspirations"; value: string }
  | { type: "SET_SKILL"; skillId: string; proficiency: SkillProficiency | null }
  | { type: "RESET"; state: ProfileState };


export function profileReducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case "PATCH":
      return { ...state, ...action.patch };
    case "TOGGLE_SET": {
      const cur = state[action.field];
      const next = cur.includes(action.value)
        ? cur.filter(x => x !== action.value)
        : [...cur, action.value];
      return { ...state, [action.field]: next };
    }
    case "SET_SKILL": {
      // proficiency=null removes the skill; otherwise upserts the entry.
      const cur = state.skillEntries;
      const without = cur.filter(s => s.skillId !== action.skillId);
      if (action.proficiency === null) return { ...state, skillEntries: without };
      return { ...state, skillEntries: [...without, { skillId: action.skillId, proficiency: action.proficiency }] };
    }
    case "RESET":
      return action.state;
    default:
      return state;
  }
}


export function makeInitialProfileState(
  payload: ProfileShellPayload,
  isSelf: boolean,
  bridgeProfile: BridgeTalentSelfProfile | null = null,
): ProfileState {
  const seed = payload.seed ?? {};
  // Phase B — resolve canonical profile by talentId. When the drawer
  // is opened from a roster row click, payload.talentId is set; we
  // look up the full profile in TALENT_PROFILES_BY_ID. Falls back to
  // MY_TALENT_PROFILE for legacy callers that don't pass talentId
  // (registration wizard, brand-new "create" flow).
  // For real DB talents (UUID not in the prototype fixture map) we want empty
  // defaults — DB hydration via getTalentProfileEditorData fills the real values
  // on open. Falling back to MY_TALENT_PROFILE makes fresh talents display
  // Marta's measurements / specialties / credits until the user overwrites them.
  const isFixtureTalent = !!payload.talentId && payload.talentId in TALENT_PROFILES_BY_ID;
  const canonicalProfile: MyTalentProfile = isFixtureTalent
    ? getProfileById(payload.talentId!)
    : MY_TALENT_PROFILE;
  // #4 — Hydrate from the shared draft store. QuickAdd writes here on
  // every input; the Shell reads on mount. So first/last/email/phone/
  // photo flow through cleanly without prop-drilling each field through
  // the seed payload.
  const draft: ProfileDraft = !isSelf && payload.mode === "create"
    ? readProfileDraft("default")
    : {};
  const items: PhotoMeta[] = (() => {
    if (draft.photoUrl) {
      return [{ url: draft.photoUrl, tag: "headshot" as const }];
    }
    const photos = Array.from({ length: seed.photoCount ?? 0 })
      .map((_, i) => ({
        url: `https://i.pravatar.cc/300?img=${(i * 11 + 5) % 70}`,
        tag: i === 0 ? ("headshot" as const) : i === 1 ? ("full_body" as const) : ("portfolio" as const),
      })) as PhotoMeta[];
    // Hydrate portfolio videos from the canonical profile (any talent,
    // not just Marta). Drawer opens with motion work already present
    // when the talent has any. Replaces the old name-matching path.
    const hasCanonical = !!payload.talentId;
    if (hasCanonical && canonicalProfile.portfolioVideos) {
      for (const v of canonicalProfile.portfolioVideos) {
        const parsed = parseVideoUrl(v.url);
        if (!parsed) continue;
        photos.push({
          url: parsed.thumbUrl ?? "",
          videoUrl: v.url,
          videoProvider: parsed.provider,
          videoDurationSec: v.durationSec,
          caption: v.caption,
        });
      }
    }
    return photos;
  })();
  const verifications: Verifications = {
    idSubmitted: true,
    payoutConnected: true,
    bookingsCount: isSelf ? 3 : 1,
    hasFundedClient: false,
    emailVerified: !!draft.email,
    phoneVerified: false,
  };
  // Display name resolution. Priority order:
  //   1. explicit seed.stageName (registration wizard)
  //   2. shared QuickAdd draft (admin → "Add talent" flow)
  //   3. real bridge profile displayName (talent self-edit on real DB row)
  //   4. fixture canonical profile name (prototype mock talents)
  //   5. fallback "Sofia Lupo"
  // Without #3 the drawer fell back to canonicalProfile.name = MY_TALENT_PROFILE.name
  // for any non-fixture talent — i.e. every real DB talent — and pre-filled
  // their identity field with "Marta Reyes".
  const draftDisplay = draft.displayName?.trim()
    || `${draft.firstName?.trim() ?? ""} ${draft.lastName?.trim() ?? ""}`.trim();
  const stageName = seed.stageName
    ?? (draftDisplay
      || (bridgeProfile && !isFixtureTalent ? bridgeProfile.displayName : null)
      || (payload.talentId ? canonicalProfile.name : "Sofia Lupo"));
  // Bridge MY_TALENT_PROFILE → ProfileState for the canonical demo
  // talent (Marta). When the workspace admin opens "her" or the talent
  // Phase B — bridge canonical profile → ProfileState. Works for any
  // talent whose record exists in TALENT_PROFILES_BY_ID, not just
  // Marta. Identity by `payload.talentId` (no name matching). Falls
  // back to empty defaults for fresh `create` mode.
  const hasCanonical = !!payload.talentId && payload.mode !== "create";
  // Only read travel/passport fixture data from the mock profile if this is
  // actually a fixture talent — otherwise these values come from the DB.
  const travelSeedPassports = isFixtureTalent ? (canonicalProfile.travel?.passports ?? []) : [];
  const travelSeedAuth = isFixtureTalent ? (canonicalProfile.travel?.workAuth ?? []) : [];
  const bridgeFromMyTalent = isFixtureTalent ? {
    nationality:    seed.nationality    ?? (travelSeedPassports[0] ?? ""),
    homeCountry:    seed.homeCountry    ?? (travelSeedPassports[0] ?? ""),
    responseTime:   seed.responseTime   ?? "4h" as const,
    passport:       seed.passport       ?? (travelSeedPassports.length ? "valid" as const : undefined),
    driversLicense: seed.driversLicense ?? "standard" as const,
    ownsVehicle:    seed.ownsVehicle    ?? false,
    workEligibility: seed.workEligibility ?? travelSeedAuth.map(w => w.split(" ")[0]),
    visaCountries:  seed.visaCountries  ?? [],
  } : {
    nationality:    seed.nationality    ?? "",
    homeCountry:    seed.homeCountry    ?? "",
    responseTime:   seed.responseTime,
    passport:       seed.passport,
    driversLicense: seed.driversLicense,
    ownsVehicle:    seed.ownsVehicle    ?? false,
    workEligibility: seed.workEligibility ?? [],
    visaCountries:  seed.visaCountries  ?? [],
  };
  return {
    identity: {
      stageName,
      firstName: "",
      lastName: "",
      legalName: "",
      pronouns: null,
      gender: null,
      dob: null,
      ageDisplay: "range",
      // New canonical fields — defaults are sensible, real seed data
      // hydrates via the bridge above when the shell opens an
      // existing talent.
      nationality: bridgeFromMyTalent.nationality,
      homeCountry: bridgeFromMyTalent.homeCountry,
      responseTime: bridgeFromMyTalent.responseTime,
      visibility: {
        legalName: ["private"],
        pronouns: ["public", "agency"],
        gender: ["agency"],
        dob: ["private"],
      },
    },
    stageName,
    tagline: "",
    bios: [{ locale: "en", text: seed.bio ?? "" }],
    bioActiveLocale: "en",
    bioTone: "professional",
    personality: { loves: [], avoids: [] },
    // Phase B/C — primary + secondary type from canonical profile
    // when available. The drawer's dynamic-fields renderer iterates
    // [primaryType, ...secondaryTypes] so multi-role profiles see
    // every relevant section.
    primaryType: seed.primaryType ?? draft.primaryType ?? (isFixtureTalent ? canonicalProfile.primaryType : null),
    secondaryTypes: seed.secondaryTypes ?? (isFixtureTalent ? [...canonicalProfile.secondaryTypes] : []),
    aspirations: [],
    specialties: seed.specialties ?? (isFixtureTalent ? [...canonicalProfile.specialties] : []),
    serviceArea: {
      // Same priority logic as stageName: bridge wins over fixture for
      // real talents so QA admin's drawer doesn't open with "Madrid".
      homeBase: seed.homeBase
        ?? draft.homeBase
        ?? (bridgeProfile && !isFixtureTalent ? (bridgeProfile.homeCity ?? "") : ""),
      serviceCities: seed.serviceCities ?? [],
      travelKm: seed.travelKm ?? 50,
      travelFee: false,
      remoteOnly: false,
      // New travel & work-eligibility fields. Empty on fresh creates;
      // seeded talents get populated via the bridge above.
      passport: bridgeFromMyTalent.passport,
      driversLicense: bridgeFromMyTalent.driversLicense,
      ownsVehicle: bridgeFromMyTalent.ownsVehicle,
      workEligibility: bridgeFromMyTalent.workEligibility,
      visaCountries: bridgeFromMyTalent.visaCountries,
    },
    seasonalWindows: [],
    albumsPro: [{ id: "main", name: "Main", items }],
    activeAlbumId: "main",
    videoLinks: [],
    videoClip: null,
    helloReel: null,
    polaroids: [
      { id: "p-front",    angle: "Front",     url: null },
      { id: "p-side",     angle: "Side",      url: null },
      { id: "p-back",     angle: "Back",      url: null },
      { id: "p-smile",    angle: "Smile",     url: null },
      { id: "p-no-makeup",angle: "No makeup", url: null },
    ],
    files: [],
    limits: [],
    credits: [],
    // Phase B — hydrate dynFields from the canonical profile's
    // structured fields (measurements + wardrobe) so opening any
    // talent's drawer shows their actual data, not blanks. Maps
    // MyTalentProfile.measurements.* → dynFields keys that match
    // the TAXONOMY_FIELDS["models"] field ids.
    dynFields: seed.fields ?? (isFixtureTalent ? {
      height: canonicalProfile.measurements.heightImperial,
      weight: canonicalProfile.measurements.weight ?? "",
      bust: canonicalProfile.measurements.bust,
      waist: canonicalProfile.measurements.waist,
      hips: canonicalProfile.measurements.hips,
      inseam: canonicalProfile.measurements.inseam ?? "",
      shoe: canonicalProfile.measurements.shoeEU,
      shoe_us: canonicalProfile.measurements.shoeUS,
      shoe_uk: canonicalProfile.measurements.shoeUK,
      dress_size: canonicalProfile.measurements.dress,
      suit_size: canonicalProfile.measurements.suit ?? "",
      hair: canonicalProfile.measurements.hairColor,
      hair_length: canonicalProfile.measurements.hairLength === "long" ? "Long"
        : canonicalProfile.measurements.hairLength === "short" ? "Short"
        : canonicalProfile.measurements.hairLength === "medium" ? "Medium"
        : "",
      eyes: canonicalProfile.measurements.eyeColor,
      skin_tone: canonicalProfile.measurements.skinTone,
      tattoos: canonicalProfile.measurements.hasTattoos
        ? (canonicalProfile.measurements.tattoosNote?.includes("cover") ? "Small (coverable)" : "Medium (visible)")
        : "None",
      tattoos_note: canonicalProfile.measurements.tattoosNote ?? "",
      piercings: canonicalProfile.measurements.hasPiercings
        ? (canonicalProfile.measurements.piercingsNote?.includes("Lobes") ? "Ears only" : "Face / body")
        : "None",
    } as Record<string, string | string[]> : {}),
    dynFieldVisibility: {},
    rates: [],
    rateTiers: [],
    packageRates: [],
    travelIncluded: false,
    lodgingIncluded: false,
    askForQuote: false,
    availability: [],
    recurring: { kind: "none" },
    vacation: null,
    // Languages: ProfileLanguage uses "conversational" while TalentLanguage
    // uses "intermediate". Map between them on hydrate.
    languages: seed.languages ?? (hasCanonical
      ? canonicalProfile.languages.map(l => ({
          language: l.language,
          level: (l.level === "intermediate" ? "conversational" : l.level) as ProfileLanguage["level"],
        }))
      : []),
    skillEntries: [],
    contexts: [],
    pastClients: [],
    verifications,
    // Default profile status. Self-edit drawer used to assume "published"
    // (matched the demo Marta who's already live), but that's wrong for a
    // freshly-provisioned talent — their workflow_status is "draft" until
    // they actually publish. Read the real value from the bridge when
    // available; fall back to the legacy default for fixture / standalone
    // demo mode.
    profileStatus:
      bridgeProfile?.workflowStatus === "published" || bridgeProfile?.workflowStatus === "approved"
        ? "published"
        : bridgeProfile?.workflowStatus === "pending" || bridgeProfile?.workflowStatus === "submitted" || bridgeProfile?.workflowStatus === "under_review"
        ? "pending"
        : bridgeProfile?.workflowStatus === "hidden" || bridgeProfile?.workflowStatus === "archived"
        ? "hidden"
        : bridgeProfile?.workflowStatus === "invited" || bridgeProfile?.workflowStatus === "draft"
        ? "draft"
        : (isSelf ? "published" : "draft"),
    featureInDirectory: false,
    isDiscoverable: false,
    internalNotes: "",
    // Bridge from canonical profile's emergencyContact when known.
    // Empty defaults for new profiles. No more name-matching.
    emergencyContact: hasCanonical
      ? { ...canonicalProfile.emergencyContact }
      : { name: "", relation: "", phone: "" },
    rateCardVisibility: hasCanonical
      ? canonicalProfile.rateCard.visibility
      : "agency-only",
    fieldLocks: [],
    fieldLockReasons: {},
  };
}

// ════════════════════════════════════════════════════════════════════
// Profile shell — main drawer
// ════════════════════════════════════════════════════════════════════

// P3 fix — StrictMode-proof hydration dedupe.
// React StrictMode (dev) double-invokes effects: mount→effect→cleanup
// →effect. The old `profileShellHydratedForRef` guard was nulled by the
// cleanup between the two invocations, so the loader fired TWICE per
// open. This module-level in-flight cache makes the 2nd invocation
// REUSE the first in-flight fetch (zero duplicate network calls) while
// the per-run `cancelled` flag still ensures the data is applied once.
// Entry is auto-evicted when both promises settle, so a genuine reopen
// after load refetches normally.

export type _HydrationInFlight = {
  media: ReturnType<typeof actionLoadTalentMediaBundle>;
  editor: ReturnType<typeof loadTalentProfileEditorData>;
};

export const _editorHydrationInFlight = new Map<string, _HydrationInFlight>();

export function _getEditorHydration(
  tid: string,
  isSelf: boolean,
): { entry: _HydrationInFlight; reused: boolean } {
  const existing = _editorHydrationInFlight.get(tid);
  if (existing) return { entry: existing, reused: true };
  const entry: _HydrationInFlight = {
    media: actionLoadTalentMediaBundle(tid),
    editor: loadTalentProfileEditorData({ talentProfileId: tid, isSelf }),
  };
  _editorHydrationInFlight.set(tid, entry);
  void Promise.allSettled([entry.media, entry.editor]).finally(() => {
    _editorHydrationInFlight.delete(tid);
  });
  return { entry, reused: false };
}

// P3-phase-2 — defer per-agency overrides behind a collapsed section.
// `SkillOverridesPanel` fetches getResolvedSkills + getAgencySkillOverrides
// ON MOUNT and shows "Loading skill overrides…". Mounting it inline on
// every Services/overview open made the Services view feel slow/technical
// and duplicated getResolvedSkills (SkillSlotPanel already fetches it).
// This wrapper keeps it OUT of the default Services view: collapsed by
// default, the panel only mounts (and only then fetches) when expanded.
// Behaviour is unchanged once opened. Narrow scope — no relabeling/
// restructuring of the rest of Services.

