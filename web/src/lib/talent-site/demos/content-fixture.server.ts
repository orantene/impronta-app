import "server-only";

/**
 * The CONTENT step of a demo rebuild: the profile-side facts a demo's website
 * reads at render time (hero facts, Location) plus, at integration, the services
 * and copy from the mockup's content fixture
 * (`design-references/<design>/content.json`).
 *
 * `applyContentFixture` applies what existing code already supports (hero facts,
 * location) and reports what it could not apply in `skipped`. Services, bio,
 * tagline and stats are typed here so the fixture can be wired without a
 * contract change; the services hook is the integration seam.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyReferenceContent } from "./content-state.server";
import { loadDemoContentFixture } from "./content-fixture";
import { fixtureHeroFacts, fixtureLocation } from "./fixture-plan";
import { applyHeroFacts, HERO_FACTS, type HeroFacts } from "./hero-facts";
import { applyDemoLocation, DEMO_LOCATIONS, type DemoLocation } from "./location";
import type { DemoRegistryEntry, DemoStepId } from "./types";

/** One service row of a content fixture. Shape is provisional until A3's fixture is wired. */
export interface DemoFixtureService {
  title: { en: string; es: string };
  description?: { en: string; es: string };
  category?: { en: string; es: string };
  amountCents?: number | null;
  currency?: string;
  durationMinutes?: number | null;
}

export interface DemoContentFixture {
  heroFacts?: HeroFacts;
  location?: DemoLocation;
  /** TODO(integration): applied through `hooks.services` once the fixture lands. */
  services?: DemoFixtureService[];
  /** Not applied yet (no shared writer); reported in `skipped`. */
  bio?: string;
  tagline?: string;
  stats?: Array<{ label: { en: string; es: string }; value: string }>;
}

export type ApplyServicesHook = (
  admin: SupabaseClient,
  entry: DemoRegistryEntry,
  services: DemoFixtureService[],
  write: boolean,
) => Promise<boolean>;

export interface ContentFixtureOptions {
  write: boolean;
  /** Integration seam for the services of a content fixture. Absent = skipped. */
  hooks?: { services?: ApplyServicesHook };
}

export interface ContentFixtureResult {
  /** Steps that changed (or, in a dry run, would change) something. */
  changed: DemoStepId[];
  /** Fixture parts this build cannot apply yet. */
  skipped: string[];
}

/** The fixture a demo gets when none is supplied: what the codebase already knows about it. */
export function defaultFixtureFor(entry: DemoRegistryEntry): DemoContentFixture {
  if (entry.reference && entry.contentFixture) {
    // A reference demo takes its hero facts and Location from the mockup fixture itself.
    const f = loadDemoContentFixture(entry.contentFixture);
    const heroFacts = fixtureHeroFacts(f, HERO_FACTS[entry.profileCode]);
    const location = fixtureLocation(f);
    return { ...(heroFacts ? { heroFacts } : {}), ...(location ? { location } : {}) };
  }
  const heroFacts = HERO_FACTS[entry.profileCode];
  const location = DEMO_LOCATIONS[entry.profileCode];
  return { ...(heroFacts ? { heroFacts } : {}), ...(location ? { location } : {}) };
}

/** The single active hub tenant the profile field values are scoped to. */
export async function resolveHubTenantId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from("agencies")
    .select("id")
    .eq("kind", "hub")
    .eq("plan_tier", "network")
    .eq("status", "active");
  if (error) throw error;
  if (data?.length !== 1) throw new Error(`expected exactly one active hub, found ${data?.length ?? 0}`);
  return data[0]!.id as string;
}

export async function applyContentFixture(
  admin: SupabaseClient,
  entry: DemoRegistryEntry,
  fixture: DemoContentFixture,
  opts: ContentFixtureOptions = { write: false },
): Promise<ContentFixtureResult> {
  const changed: DemoStepId[] = [];
  const skipped: string[] = [];
  if (fixture.heroFacts) {
    // applyHeroFacts reads HERO_FACTS by code; a fixture's own facts take over the same table row.
    const hub = await resolveHubTenantId(admin);
    const res = await applyHeroFacts(admin, {
      profileCode: entry.profileCode,
      hubTenantId: hub,
      write: opts.write,
      facts: fixture.heroFacts,
    });
    if (res && res.wrote.length > 0) changed.push("hero_facts");
  }
  if (fixture.location) {
    const res = await applyDemoLocation(admin, {
      profileCode: entry.profileCode,
      location: fixture.location,
      write: opts.write,
    });
    if (res === "would_write" || res === "wrote") changed.push("location");
  }
  if (fixture.services?.length) {
    const hook = opts.hooks?.services;
    if (hook) {
      if (await hook(admin, entry, fixture.services, opts.write)) changed.push("content");
    } else skipped.push("services");
  }
  if (entry.reference && entry.contentFixture) {
    // Mockup content of a reference demo: tagline, bio, city, languages, services, FAQ, height.
    const hub = await resolveHubTenantId(admin);
    const res = await applyReferenceContent(admin, entry, { write: opts.write, hubTenantId: hub });
    for (const step of res.changed) if (!changed.includes(step)) changed.push(step);
    skipped.push(...res.skipped);
  } else {
    if (fixture.bio) skipped.push("bio");
    if (fixture.tagline) skipped.push("tagline");
    if (fixture.stats?.length) skipped.push("stats");
  }
  return { changed, skipped };
}
