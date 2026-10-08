/**
 * TUL-38 unique-theme seed — pure planning + guards.
 *
 * Dry-run by default. Refuses any non-demo profile. Apply path is injected via
 * `Io` so tests never touch a database. The CLI (`unique-theme-seed.mts`) is
 * the only place that builds a real Supabase client; PM runs `--apply`.
 */

import { DEMO_BATCH } from "../../src/lib/talent-site/theme-catalog/demo-account";
import { DEMO_CODE_RE, isDemoEmail } from "./demo-identity";
import {
  FORBIDDEN_CODES,
  SLICE1_CODES,
  UNIQUE_THEME_DEMOS,
  demoByCode,
  demosForSlice,
  type UniqueThemeDemo,
} from "./unique-theme-map";

export class RefusedError extends Error {}

export type CliOptions = {
  apply: boolean;
  /** Profile codes to run; defaults to slice 1. */
  only: readonly string[];
  slice: number;
};

export type StockPhoto = {
  id: string;
  assetId: string;
  url: string;
  role: string;
  businessType: string | null;
  family: string;
  alt: { es: string; en: string };
};

export type ProfileRow = {
  id: string;
  profile_code: string;
  is_demo: boolean | null;
  user_id: string | null;
  display_name: string | null;
  short_bio: string | null;
  bio_i18n: Record<string, string> | null;
  preferred_locale: string | null;
};

export type SiteRow = {
  id: string;
  site_slug: string | null;
  theme_design_slug: string | null;
  status: string | null;
};

export type AuthMeta = {
  email: string | null;
  demo_batch: string | null;
  demo: boolean | null;
};

export type StockPick = {
  key: string;
  role: string;
  required: boolean;
  photo: StockPhoto | null;
  gap: string | null;
};

export type DemoPlan = {
  demo: UniqueThemeDemo;
  profile: ProfileRow | null;
  site: SiteRow | null;
  auth: AuthMeta | null;
  stockPicks: StockPick[];
  actions: string[];
  refused: string | null;
};

export type Io = {
  findProfile: (code: string) => Promise<ProfileRow | null>;
  findSite: (talentProfileId: string) => Promise<SiteRow | null>;
  findAuth: (userId: string) => Promise<AuthMeta | null>;
  listStock: (input: { businessType: string | null; family: string }) => Promise<StockPhoto[]>;
  writeProfile: (input: {
    id: string;
    patch: {
      short_bio: string;
      bio_i18n: Record<string, string>;
      preferred_locale: "es";
    };
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  writeSiteTheme: (input: { siteId: string; theme: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  attachStock: (input: {
    talentProfileId: string;
    userId: string;
    picks: Array<{ key: string; photo: StockPhoto }>;
  }) => Promise<{ ok: true; attached: number } | { ok: false; error: string }>;
};

export function parseCli(argv: readonly string[]): CliOptions {
  let apply = false;
  let only: string[] | null = null;
  let slice = 1;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") {
      apply = true;
      continue;
    }
    if (a === "--dry-run") {
      apply = false;
      continue;
    }
    if (a === "--slice") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1) throw new RefusedError("--slice needs a positive integer");
      slice = v;
      continue;
    }
    if (a.startsWith("--slice=")) {
      const v = Number(a.slice("--slice=".length));
      if (!Number.isInteger(v) || v < 1) throw new RefusedError("--slice needs a positive integer");
      slice = v;
      continue;
    }
    if (a === "--only") {
      only = splitCodes(argv[++i] ?? "");
      continue;
    }
    if (a.startsWith("--only=")) {
      only = splitCodes(a.slice("--only=".length));
      continue;
    }
    throw new RefusedError(`unknown argument ${a}`);
  }
  const codes = only ?? demosForSlice(slice).map((d) => d.profileCode);
  if (!codes.length) throw new RefusedError(`no demos in slice ${slice}`);
  for (const code of codes) assertAllowedCode(code, slice);
  return { apply, only: codes, slice };
}

function splitCodes(raw: string): string[] {
  const codes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!codes.length) throw new RefusedError("--only needs a comma list of profile codes");
  return codes;
}

/** Hard refuse: forbidden real/QA codes, non-demo pattern, or not in the slice map. */
export function assertAllowedCode(code: string, slice = 1): void {
  if (FORBIDDEN_CODES.includes(code)) {
    throw new RefusedError(`REFUSE: ${code} is forbidden (real or QA talent; never a unique-theme target)`);
  }
  if (!DEMO_CODE_RE.test(code)) {
    throw new RefusedError(`REFUSE: ${code} is not a TAL-93xxx demo code`);
  }
  const demo = demoByCode(code);
  if (!demo) {
    throw new RefusedError(`REFUSE: ${code} is not on the unique-theme curated map`);
  }
  if (demo.slice !== slice) {
    throw new RefusedError(`REFUSE: ${code} is slice ${demo.slice}, not slice ${slice}`);
  }
  if (slice === 1 && !SLICE1_CODES.includes(code)) {
    throw new RefusedError(`REFUSE: ${code} is not in the slice-1 allow-list`);
  }
}

/** Runtime row checks after a DB/auth read. */
export function assertDemoRow(input: {
  expected: UniqueThemeDemo;
  profile: ProfileRow;
  auth: AuthMeta | null;
}): void {
  const { expected, profile, auth } = input;
  if (profile.profile_code !== expected.profileCode) {
    throw new RefusedError(
      `REFUSE: profile row code ${profile.profile_code} does not match ${expected.profileCode}`,
    );
  }
  if (profile.is_demo !== true) {
    throw new RefusedError(`REFUSE: ${expected.profileCode} is not a demo profile (is_demo must be true)`);
  }
  if (!profile.user_id) {
    throw new RefusedError(`REFUSE: ${expected.profileCode} has no user_id`);
  }
  if (auth) {
    if (!isDemoEmail(auth.email ?? "")) {
      throw new RefusedError(`REFUSE: ${expected.profileCode} auth email is not a demo domain`);
    }
    if (auth.email && auth.email.toLowerCase() !== expected.email.toLowerCase()) {
      throw new RefusedError(
        `REFUSE: ${expected.profileCode} auth email ${auth.email} does not match map ${expected.email}`,
      );
    }
    if (auth.demo_batch !== DEMO_BATCH) {
      throw new RefusedError(
        `REFUSE: ${expected.profileCode} demo_batch is ${JSON.stringify(auth.demo_batch)}, expected ${DEMO_BATCH}`,
      );
    }
  }
}

export function pickStock(demo: UniqueThemeDemo, pool: readonly StockPhoto[]): StockPick[] {
  const used = new Set<string>();
  return demo.pack.stock.slots.map((slot) => {
    const photo =
      pool.find((p) => p.role === slot.role && !used.has(p.id)) ??
      pool.find((p) => p.role === slot.role) ??
      null;
    if (photo) used.add(photo.id);
    const gap =
      photo == null
        ? `no platform stock with role=${slot.role} for type=${demo.pack.stock.businessType ?? "null"} family=${demo.pack.stock.family}`
        : null;
    return { key: slot.key, role: slot.role, required: slot.required, photo, gap };
  });
}

export function planActions(demo: UniqueThemeDemo, profile: ProfileRow, site: SiteRow | null, picks: StockPick[]): string[] {
  const actions: string[] = [];
  const wantBio = demo.pack.bio;
  const haveBio = profile.bio_i18n ?? {};
  if (profile.short_bio !== wantBio.es || haveBio.es !== wantBio.es || haveBio.en !== wantBio.en) {
    actions.push("update profile short_bio + bio_i18n (es primary, en secondary)");
  }
  if (profile.preferred_locale !== "es") {
    actions.push("set preferred_locale=es");
  }
  if (!site) {
    actions.push("missing talent_sites row (theme cannot be aligned until a site exists)");
  } else if (site.theme_design_slug !== demo.theme) {
    actions.push(`align site theme_design_slug ${site.theme_design_slug ?? "null"} → ${demo.theme}`);
  }
  const attachable = picks.filter((p) => p.photo);
  if (attachable.length) {
    actions.push(`attach ${attachable.length} platform-stock image(s) onto the demo profile`);
  }
  const missingRequired = picks.filter((p) => p.required && !p.photo);
  if (missingRequired.length) {
    actions.push(`BLOCKED: ${missingRequired.length} required stock slot(s) unresolved`);
  }
  return actions;
}

export async function buildPlan(codes: readonly string[], io: Io, slice = 1): Promise<DemoPlan[]> {
  const plans: DemoPlan[] = [];
  for (const code of codes) {
    const demo = demoByCode(code);
    if (!demo) {
      plans.push({
        demo: {
          theme: "?",
          profileCode: code,
          email: "",
          siteSlug: "",
          displayName: code,
          slice,
          pack: UNIQUE_THEME_DEMOS[0]!.pack,
        },
        profile: null,
        site: null,
        auth: null,
        stockPicks: [],
        actions: [],
        refused: `not on curated map: ${code}`,
      });
      continue;
    }
    try {
      assertAllowedCode(code, slice);
      const profile = await io.findProfile(code);
      if (!profile) {
        plans.push({
          demo,
          profile: null,
          site: null,
          auth: null,
          stockPicks: [],
          actions: [],
          refused: `no talent_profiles row for ${code}`,
        });
        continue;
      }
      const auth = profile.user_id ? await io.findAuth(profile.user_id) : null;
      assertDemoRow({ expected: demo, profile, auth });
      if (auth && !isDemoEmail(demo.email)) {
        throw new RefusedError(`REFUSE: map email for ${code} is not a demo domain`);
      }
      const site = await io.findSite(profile.id);
      if (site && site.site_slug && site.site_slug !== demo.siteSlug) {
        throw new RefusedError(
          `REFUSE: ${code} site_slug ${site.site_slug} does not match map ${demo.siteSlug}`,
        );
      }
      const pool = await io.listStock({
        businessType: demo.pack.stock.businessType,
        family: demo.pack.stock.family,
      });
      const stockPicks = pickStock(demo, pool);
      const actions = planActions(demo, profile, site, stockPicks);
      plans.push({ demo, profile, site, auth, stockPicks, actions, refused: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      plans.push({
        demo,
        profile: null,
        site: null,
        auth: null,
        stockPicks: [],
        actions: [],
        refused: message,
      });
    }
  }
  return plans;
}

export function formatPlan(plans: readonly DemoPlan[], apply: boolean): string {
  const lines: string[] = [
    apply ? "APPLY (writes)" : "DRY RUN (no writes)",
    `demos: ${plans.length}`,
    "",
  ];
  for (const p of plans) {
    lines.push(`── ${p.demo.profileCode} · ${p.demo.theme} · ${p.demo.displayName} · pack ${p.demo.pack.id}`);
    if (p.refused) {
      lines.push(`   REFUSED: ${p.refused}`);
      lines.push("");
      continue;
    }
    lines.push(`   site: ${p.site?.site_slug ?? "(none)"} · theme now ${p.site?.theme_design_slug ?? "null"}`);
    lines.push(`   locales: es primary, en secondary`);
    lines.push(`   tagline.es: ${p.demo.pack.tagline.es}`);
    lines.push(`   tagline.en: ${p.demo.pack.tagline.en}`);
    for (const s of p.stockPicks) {
      if (s.photo) {
        lines.push(`   stock ${s.key} (${s.role}): ${s.photo.id} · ${s.photo.family}/${s.photo.businessType ?? "_"}`);
      } else {
        lines.push(`   stock ${s.key} (${s.role}): GAP${s.required ? " REQUIRED" : ""} — ${s.gap}`);
      }
    }
    for (const a of p.actions) lines.push(`   → ${a}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export type RunResult = { exitCode: number; plans: DemoPlan[]; wrote: string[] };

export async function run(argv: readonly string[], io: Io, log: (line: string) => void = console.log): Promise<RunResult> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
    return { exitCode: 2, plans: [], wrote: [] };
  }

  const plans = await buildPlan(opts.only, io, opts.slice);
  log(formatPlan(plans, opts.apply));

  if (plans.some((p) => p.refused)) {
    log("\nStopped: at least one demo was refused.");
    return { exitCode: 2, plans, wrote: [] };
  }

  const blocked = plans.filter((p) => p.stockPicks.some((s) => s.required && !s.photo));
  if (opts.apply && blocked.length) {
    log(`\nREFUSE apply: ${blocked.length} demo(s) missing required platform stock.`);
    return { exitCode: 2, plans, wrote: [] };
  }

  if (!opts.apply) {
    log("\nDry run done. Pass --apply for the PM to write.");
    return { exitCode: 0, plans, wrote: [] };
  }

  const wrote: string[] = [];
  for (const p of plans) {
    const profile = p.profile!;
    const bio = p.demo.pack.bio;
    const profileWrite = await io.writeProfile({
      id: profile.id,
      patch: {
        short_bio: bio.es,
        bio_i18n: { ...(profile.bio_i18n ?? {}), es: bio.es, en: bio.en },
        preferred_locale: "es",
      },
    });
    if (!profileWrite.ok) {
      log(`REFUSE write profile ${p.demo.profileCode}: ${profileWrite.error}`);
      return { exitCode: 1, plans, wrote };
    }
    wrote.push(`profile:${p.demo.profileCode}`);

    if (p.site && p.site.theme_design_slug !== p.demo.theme) {
      const themeWrite = await io.writeSiteTheme({ siteId: p.site.id, theme: p.demo.theme });
      if (!themeWrite.ok) {
        log(`REFUSE write theme ${p.demo.profileCode}: ${themeWrite.error}`);
        return { exitCode: 1, plans, wrote };
      }
      wrote.push(`theme:${p.demo.profileCode}:${p.demo.theme}`);
    }

    const picks = p.stockPicks.filter((s) => s.photo).map((s) => ({ key: s.key, photo: s.photo! }));
    if (picks.length) {
      if (!profile.user_id) {
        log(`REFUSE attach ${p.demo.profileCode}: no user_id`);
        return { exitCode: 1, plans, wrote };
      }
      const attach = await io.attachStock({
        talentProfileId: profile.id,
        userId: profile.user_id,
        picks,
      });
      if (!attach.ok) {
        log(`REFUSE attach stock ${p.demo.profileCode}: ${attach.error}`);
        return { exitCode: 1, plans, wrote };
      }
      wrote.push(`stock:${p.demo.profileCode}:${attach.attached}`);
    }
  }

  log(`\nApplied ${wrote.length} write group(s). Sites were not published.`);
  return { exitCode: 0, plans, wrote };
}

/** Themes must stay unique across the curated map. */
export function assertUniqueThemes(demos: readonly UniqueThemeDemo[] = UNIQUE_THEME_DEMOS): void {
  const seen = new Map<string, string>();
  for (const d of demos) {
    const prior = seen.get(d.theme);
    if (prior) throw new Error(`theme ${d.theme} claimed by both ${prior} and ${d.profileCode}`);
    seen.set(d.theme, d.profileCode);
  }
}
