/**
 * Test support: a small foundation demo, field definitions and a seed context
 * over the in-memory fake client. Mirrors the shapes foundation-load.ts returns.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FoundationDemo, FoundationService } from "./foundation-load";
import { emptyNamespace, type FieldDef } from "./foundation-plan";
import { loadAuthUsers, type Manifest, type SeedContext, type StatusEntry } from "./foundation-seed-core";
import { FakeDb, fakeClient } from "./test-fake-supabase";

export const HUB = "hub-tenant-1";
/** A throwaway password that exists only inside the tests. */
export const PW = "Throwaway-Pass-1234";

export function svc(over: Partial<FoundationService> = {}): FoundationService {
  const name = over.name ?? "Servicio";
  const description = over.description ?? "Descripcion";
  return {
    name,
    description,
    nameEn: name,
    descriptionEn: description,
    category: "Categoria",
    categoryEn: null,
    mode: "request",
    currency: "MXN",
    priceArsReference: null,
    price: 500,
    priceDisplay: "exact",
    pricingUnit: "session",
    durationMin: 60,
    prepMin: 0,
    cleanupMin: 0,
    noticeHours: 24,
    location: "studio",
    ...over,
  };
}

export function makeDemo(over: Partial<FoundationDemo> = {}): FoundationDemo {
  return {
    demoId: "DEMO003",
    profileCode: "TAL-93103",
    email: "demo-nails-003@demo.tulala.digital",
    isLive: false,
    country: "MX",
    localePrimary: "es",
    displayName: "Itzel Canché",
    firstName: "Itzel",
    lastName: "Canché",
    gender: "female",
    age: 29,
    city: "Playa del Carmen",
    neighbourhood: "Centro",
    state: "Quintana Roo",
    languages: ["Español", "Inglés"],
    siteSlug: "",
    serviceCategorySlug: "beauty-services",
    talentTypeSlug: "nail-artist",
    taxonomyPending: false,
    theme: "maison",
    tagline: "Uñas y nail art en Playa del Carmen",
    taglineEn: "Nails and nail art in Playa del Carmen",
    bio: "Hago uñas en mi estudio con citas tranquilas y sin prisa, y te explico como cuidarlas.",
    bioEn: "I do nails in my studio with calm appointments and explain how to care for them.",
    services: [
      svc({ name: "Manicure en gel", mode: "instant", price: 350, durationMin: 60, prepMin: 5, cleanupMin: 10, noticeHours: 12 }),
      svc({ name: "Set acrilico", mode: "request", price: 550, priceDisplay: "from", durationMin: 120, prepMin: 10, cleanupMin: 20, noticeHours: 24, location: "client_home" }),
      svc({ name: "Proyecto", mode: "request", price: 3000, pricingUnit: "project", durationMin: null, location: "venue" }),
      svc({ name: "Evento", mode: "quote", price: 1200, priceDisplay: "from", pricingUnit: "event", durationMin: null, prepMin: 60, cleanupMin: 300, noticeHours: 2, location: "online" }),
    ],
    hours: { days: [2, 3, 4, 5, 6], startMin: 600, endMin: 1140, timezone: "America/Cancun" },
    photoBriefEs: null,
    universal: {
      pronouns: "ella",
      dob: "1997-03-04",
      ageDisplay: "range",
      nationality: "MX",
      homeCountry: "MX",
      responseTime: "under_4h",
      bioEn: "I do nails in my studio with calm appointments and explain how to care for them.",
      bioTone: "cálida y tranquila",
      personality: ["paciente"],
      languages: ["Español", "Inglés"],
      homeBase: "Playa del Carmen, Quintana Roo",
      travelTo: ["Cancún"],
      travelRadiusKm: 30,
      travelFeeRequired: true,
      remoteOnly: false,
      passportStatus: "valid",
      driversLicense: true,
      workEligibility: ["MX"],
      availabilityNoteEs: "Atiendo martes a sábado, de 10:00 a 19:00.",
      restrictions: ["Solo una clienta a la vez"],
    },
    typeFields: {
      "wellness.modalities": ["Gel", "Acrílico"],
      "wellness.min_session_duration": "90 min",
      "wellness.license_country": "MX",
      "equipment.owns_equipment": false,
      "wellness.max_per_session": 1,
      "wellness.certifications": [],
      "physical.height_cm": 162,
      "ops.notes": "",
    },
    typeFieldMeta: {
      "wellness.license_country": { key: "wellness.license_country", label: null, kind: "text", options: null, sensitive: true },
    },
    mediaPlan: { gallery: ["a", "b", "c"], albums: [{ title_es: "Sets", shots: 3 }] },
    ...over,
  };
}

let n = 0;
function def(key: string, kind: string, options: string[] | null = null, extra: Partial<FieldDef> = {}): FieldDef {
  n += 1;
  return { id: `def-${n}-${key}`, field_key: key, kind, options, is_sensitive: false, deprecated_at: null, validation_rules: null, ...extra };
}

export function makeDefs(): Map<string, FieldDef> {
  const list = [
    def("identity.pronouns", "select", ["she_her", "he_him", "they_them", "ze_zir", "custom"]),
    def("identity.gender", "select", ["Woman", "Man", "Non-binary"]),
    def("identity.ageDisplayMode", "select", ["exact", "range", "hidden"]),
    def("identity.response_time", "select", ["1h", "4h", "24h", "48h"]),
    def("identity.tagline", "text"),
    def("about.bioTone", "select", ["professional", "warm", "playful", "bold", "minimal"]),
    def("bios", "text"),
    def("logistics.passportStatus", "select", ["valid", "expired", "none"]),
    def("logistics.driversLicense", "select", ["none", "standard", "international", "commercial"]),
    def("logistics.workEligibility", "chips"),
    def("limits", "text"),
    def("wellness.modalities", "chips"),
    def("wellness.min_session_duration", "select", ["30 min", "60 min", "90 min", "2 hr"]),
    def("wellness.license_country", "text", null, { is_sensitive: true }),
    def("equipment.owns_equipment", "toggle"),
    def("wellness.max_per_session", "number", null, { validation_rules: { min: 1, max: 20 } }),
    def("wellness.certifications", "chips"),
    def("physical.height_cm", "number"),
    def("ops.notes", "textarea"),
  ];
  return new Map(list.map((d) => [d.field_key, d]));
}

export type Harness = {
  db: FakeDb;
  admin: SupabaseClient;
  ctx: SeedContext;
  statuses: StatusEntry[];
  logs: string[];
  manifest: Manifest;
  manifestSaves: () => number;
};

export async function harness(over: { withTerm?: boolean; password?: string } = {}): Promise<Harness> {
  const db = new FakeDb();
  db.table("agencies").push({ id: HUB, kind: "hub", plan_tier: "network", status: "active" });
  const admin = fakeClient(db);
  const manifest: Manifest = { batch: "demo-2026-09-28", targetRef: "ref", entries: {} };
  const statuses: StatusEntry[] = [];
  const logs: string[] = [];
  let saves = 0;
  const locations = new Map([["MX:playadelcarmen", "loc-playa"], ["MX:cancun", "loc-cancun"], ["US:santafe", "loc-santafe-us"], ["AR:santafe", "loc-santafe-ar"], ["US:newyork", "loc-nyc"]]);
  const ctx: SeedContext = {
    admin,
    hubTenantId: HUB,
    termIds: over.withTerm === false ? new Map() : new Map([["nail-artist", "term-nail"], ["fashion-model", "term-model"]]),
    fieldDefs: makeDefs(),
    namespace: emptyNamespace(),
    locations,
    auth: await loadAuthUsers(admin),
    password: over.password ?? PW,
    now: new Date("2026-09-29T15:00:00Z"),
    manifest,
    saveManifest: () => { saves += 1; },
    onStatus: (e) => statuses.push(e),
    log: (l) => logs.push(l),
  };
  return { db, admin, ctx, statuses, logs, manifest, manifestSaves: () => saves };
}

/** Put an existing demo auth user + profile row into the fake db, as a live demo would have. */
export function addExistingLive(db: FakeDb, d: FoundationDemo, over: { demoMarker?: boolean } = {}) {
  const uid = `user-${d.profileCode}`;
  db.users.push({
    id: uid,
    email: d.email,
    app_metadata: over.demoMarker === false ? {} : { demo: true, demo_batch: "demo-2026-09-28" },
    user_metadata: {},
  });
  db.table("profiles").push({ id: uid });
  db.table("talent_profiles").push({
    id: `tp-${d.profileCode}`,
    profile_code: d.profileCode,
    user_id: uid,
    is_demo: true,
    display_name: d.displayName,
    first_name: d.firstName,
    home_city_text: d.city,
    visibility: "public",
    booking_terms: { depositPct: 10, directBookingOptIn: true },
    selling_defaults: { cancelHours: 48 },
    availability_data: {},
    public_slug_part: d.siteSlug || null,
  });
  db.table("talent_sites").push({
    id: `site-${d.profileCode}`,
    talent_profile_id: `tp-${d.profileCode}`,
    site_slug: d.siteSlug,
    status: "published",
    site_published_at: "2026-09-28T00:00:00Z",
    shell_published: [{ kind: "x" }],
  });
  return { uid, profileId: `tp-${d.profileCode}` };
}
