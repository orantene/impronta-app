/**
 * TUL-73: pure guards, diff computation and runner for the Jorgelina content
 * script. No imports from the app, no database client: every read and write goes
 * through the injected `Io`, so the tests drive it with a fake and nothing here
 * can reach production by itself.
 *
 * Two kinds of change, never mixed up:
 *   DRAFT  the home page tree in `talent_pages.blocks` (visitors see
 *          `blocks_published`, which only Publish writes). Written by
 *          `--apply-draft --yes`. This script never publishes.
 *   LIVE   rows with no draft concept (`talent_offerings`, the profile's
 *          `social_links`). Written ONLY with `--include-live-fields` on top.
 */

import {
  ALLOWED_PROFILE_CODE,
  ALLOWED_SITE_SLUG,
  CONTACT,
  FORBIDDEN_PROFILE_CODES,
  FORBIDDEN_SITE_SLUGS,
  HERO,
  NAIL_NAMES_ES,
  NAIL_NOTE_ES,
  POLICIES_ES,
  SERVICE_DESCRIPTIONS_EN,
  SERVICE_DESCRIPTIONS_ES,
  TICKER,
  TICKER_SEPARATOR,
} from "./content";

// ---------------------------------------------------------------- types

export type Json = unknown;
export type Node = { id?: string; kind?: string; props?: Record<string, unknown>; children?: Node[]; [k: string]: unknown };

export interface ProfileRow { id: string; profile_code: string }
export interface SiteRow { id: string; site_slug: string | null }
export interface HomePageRow { id: string; blocks: unknown; updated_at: string }
export interface OfferingRow {
  id: string;
  title: string | null;
  description: string | null;
  title_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
  status: string | null;
}

export interface Io {
  findProfile(profileCode: string): Promise<ProfileRow | null>;
  findSite(profileId: string): Promise<SiteRow | null>;
  findHomePage(profileId: string): Promise<HomePageRow | null>;
  listOfferings(profileId: string): Promise<OfferingRow[]>;
  readSocialLinks(profileId: string): Promise<unknown>;
  /** DRAFT. Compare-and-swap on updated_at; also keeps a revision of the previous draft. Never touches published state. */
  writeDraftHome(input: { pageId: string; expectedUpdatedAt: string; before: unknown; after: unknown }): Promise<{ ok: boolean; error?: string }>;
  /** LIVE. */
  updateOffering(input: { id: string; patch: Record<string, unknown> }): Promise<{ ok: boolean; error?: string }>;
  /** LIVE. */
  writeSocialLinks(input: { profileId: string; after: unknown }): Promise<{ ok: boolean; error?: string }>;
}

export interface Options {
  profileCode: string;
  applyDraft: boolean;
  yes: boolean;
  includeLiveFields: boolean;
  /** Optional so existing callers are unchanged. Writes description_i18n.en only. */
  includeEnglishDescriptions?: boolean;
}

export type Scope = "DRAFT" | "LIVE (immediately visible)";
export interface DiffRow { scope: Scope; field: string; before: string; after: string }

export interface Plan {
  rows: DiffRow[];
  notApplied: string[];
  draftHome: { pageId: string; expectedUpdatedAt: string; before: Node[]; after: Node[] } | null;
  offeringPatches: Array<{ id: string; label: string; patch: Record<string, unknown> }>;
  /** English descriptions (description_i18n.en only). Kept apart from `rows`; written only with --include-english-descriptions. */
  englishRows: DiffRow[];
  englishPatches: Array<{ id: string; label: string; patch: Record<string, unknown> }>;
  socialLinks: { profileId: string; before: unknown; after: unknown[] } | null;
}

// ---------------------------------------------------------------- guards

export class RefusedError extends Error {}

export function parseArgs(argv: readonly string[]): Options {
  let profileCode = ALLOWED_PROFILE_CODE;
  const known = new Set(["--apply-draft", "--yes", "--include-live-fields", "--include-english-descriptions"]);
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--profile") { profileCode = (argv[++i] ?? "").trim(); continue; }
    if (a.startsWith("--profile=")) { profileCode = a.slice("--profile=".length).trim(); continue; }
    if (!known.has(a)) throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  return {
    profileCode,
    applyDraft: flags.has("--apply-draft"),
    yes: flags.has("--yes"),
    includeLiveFields: flags.has("--include-live-fields"),
    includeEnglishDescriptions: flags.has("--include-english-descriptions"),
  };
}

/** Mode guard: writing needs BOTH --apply-draft and --yes; live fields ride on top of them. */
export function assertMode(o: Options): void {
  if (o.yes && !o.applyDraft) throw new RefusedError("--yes without --apply-draft does nothing; refusing");
  if (o.applyDraft && !o.yes) throw new RefusedError("--apply-draft needs --yes as well (dry run is the default)");
  if (o.includeLiveFields && !(o.applyDraft && o.yes)) {
    throw new RefusedError("--include-live-fields only works together with --apply-draft --yes");
  }
  if (o.includeEnglishDescriptions && !o.includeLiveFields) {
    throw new RefusedError(
      "--include-english-descriptions writes offering fields, which are LIVE (immediately visible); it needs --apply-draft --yes --include-live-fields as well",
    );
  }
  if (o.includeEnglishDescriptions && !(o.applyDraft && o.yes)) {
    throw new RefusedError("--include-english-descriptions only works together with --apply-draft --yes --include-live-fields");
  }
}

/** Target guard: only TAL-93938, and never the QA talent. */
export function assertProfileCode(code: string): void {
  if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`refusing ${code}: the QA talent is never a target`);
  if (code !== ALLOWED_PROFILE_CODE) throw new RefusedError(`refusing ${code}: only ${ALLOWED_PROFILE_CODE} is allowed`);
}

export function assertSiteSlug(slug: string | null | undefined): void {
  if (slug && FORBIDDEN_SITE_SLUGS.includes(slug)) throw new RefusedError(`refusing site ${slug}: the QA site is never a target`);
  if (slug !== ALLOWED_SITE_SLUG) throw new RefusedError(`refusing: resolved site slug is ${JSON.stringify(slug)}, expected ${ALLOWED_SITE_SLUG}`);
}

// ---------------------------------------------------------------- helpers

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const norm = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").toLowerCase() : "");
const show = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "(empty)" : JSON.stringify(v));

function walk(nodes: Node[], visit: (n: Node, parent: Node[]) => void): void {
  for (const n of nodes) {
    visit(n, nodes);
    if (Array.isArray(n.children)) walk(n.children, visit);
  }
}

const propsOf = (n: Node): Record<string, unknown> => (n.props ??= {});

// ---------------------------------------------------------------- tree edits (DRAFT)

function isHeroLede(n: Node): boolean {
  const p = n.props ?? {};
  return n.kind === "paragraph" && (p.liveText === "hero_tagline" || p.layerLabel === "Hero lede" || p.text === "{{tagline}}");
}

/**
 * Set a text prop to the ES copy with the EN copy in the i18n overlay, and stop
 * following the profile (drop `liveText`) so the approved line is what shows.
 */
function setBilingualText(n: Node, es: string, en: string): void {
  const p = propsOf(n);
  p.text = es;
  const overlay = (p.i18n && typeof p.i18n === "object" ? clone(p.i18n) : {}) as Record<string, Record<string, string>>;
  overlay.es = { ...(overlay.es ?? {}), text: es };
  overlay.en = { ...(overlay.en ?? {}), text: en };
  p.i18n = overlay;
  delete p.liveText;
}

function textState(n: Node) {
  const p = n.props ?? {};
  const ov = (p.i18n ?? {}) as Record<string, Record<string, string> | undefined>;
  return { text: p.text, es: ov.es?.text, en: ov.en?.text, liveText: p.liveText };
}

export function planTree(blocks: unknown): { after: Node[]; rows: DiffRow[]; notApplied: string[] } {
  const notApplied: string[] = [];
  const rows: DiffRow[] = [];
  if (!Array.isArray(blocks)) {
    return { after: [], rows, notApplied: ["Home page tree is not an array: hero and ticker NOT applied (report, do not guess)"] };
  }
  const after = clone(blocks) as Node[];

  const h1s: Node[] = [];
  const lede: Node[] = [];
  const marquees: Node[] = [];
  walk(after, (n) => {
    if (n.kind === "heading" && (n.props?.level === 1 || n.props?.level === "1")) h1s.push(n);
    if (isHeroLede(n)) lede.push(n);
    if (n.kind === "marquee") marquees.push(n);
  });

  const heroEdit = (label: string, nodes: Node[], es: string, en: string) => {
    if (nodes.length !== 1) {
      notApplied.push(`${label}: found ${nodes.length} candidate nodes on the home page (need exactly 1); NOT applied`);
      return;
    }
    const n = nodes[0]!;
    const before = textState(n);
    setBilingualText(n, es, en);
    const next = textState(n);
    const same = eq(before.text, next.text) && eq(before.es, next.es) && eq(before.en, next.en) && before.liveText === undefined;
    if (same) return;
    rows.push({
      scope: "DRAFT",
      field: `${label} (ES)`,
      before: show(before.es ?? before.text) + (before.liveText ? `  [live-bound: ${before.liveText}]` : ""),
      after: es,
    });
    rows.push({ scope: "DRAFT", field: `${label} (EN)`, before: show(before.en), after: en });
  };
  heroEdit("Hero headline", h1s, HERO.headline.es, HERO.headline.en);
  heroEdit("Hero subline", lede, HERO.subline.es, HERO.subline.en);

  if (marquees.length !== 1) {
    notApplied.push(`Ticker: found ${marquees.length} marquee nodes on the home page (need exactly 1); NOT applied`);
  } else {
    const p = propsOf(marquees[0]!);
    const beforeItems = Array.isArray(p.items) ? (p.items as Array<{ text?: unknown }>).map((i) => String(i?.text ?? "")) : [];
    const esItems = TICKER.es.split(TICKER_SEPARATOR);
    if (!eq(beforeItems, esItems)) {
      p.items = esItems.map((text) => ({ text }));
      rows.push({ scope: "DRAFT", field: "Ticker items (ES)", before: beforeItems.join(TICKER_SEPARATOR) || "(empty)", after: esItems.join(TICKER_SEPARATOR) });
    }
  }
  notApplied.push(
    "Ticker EN (" + TICKER.en + "): not applied, marquee items have no per-language overlay (only ES items are written)",
  );
  return { after, rows, notApplied };
}

// ---------------------------------------------------------------- offerings (LIVE)

export function planOfferings(offerings: readonly OfferingRow[]) {
  const rows: DiffRow[] = [];
  const notApplied: string[] = [];
  const patches: Plan["offeringPatches"] = [];

  const matches = (want: string) =>
    offerings.filter((o) => norm(o.title) === norm(want) || norm(o.title_i18n?.es) === norm(want));

  for (const { title, description } of SERVICE_DESCRIPTIONS_ES) {
    const found = matches(title);
    if (found.length === 0) { notApplied.push(`Service "${title}": no offering with that exact title (title or title_i18n.es); description NOT applied`); continue; }
    if (found.length > 1) { notApplied.push(`Service "${title}": ${found.length} offerings share that title; description NOT applied (ambiguous)`); continue; }
    const o = found[0]!;
    const nextI18n = { ...(o.description_i18n ?? {}), es: description };
    if (o.description === description && eq(o.description_i18n, nextI18n)) continue;
    patches.push({ id: o.id, label: title, patch: { description, description_i18n: nextI18n } });
    rows.push({ scope: "LIVE (immediately visible)", field: `Service "${title}" description`, before: show(o.description), after: description });
  }

  for (const name of NAIL_NAMES_ES) {
    const found = matches(name);
    if (found.length === 0) { notApplied.push(`Nail "${name}": no offering with that title; Spanish name NOT applied`); continue; }
    if (found.length > 1) { notApplied.push(`Nail "${name}": ${found.length} offerings match; NOT applied (ambiguous)`); continue; }
    const o = found[0]!;
    if (o.title_i18n?.es === name) continue;
    patches.push({ id: o.id, label: name, patch: { title_i18n: { ...(o.title_i18n ?? {}), es: name } } });
    rows.push({ scope: "LIVE (immediately visible)", field: `Nail "${name}" Spanish name`, before: show(o.title_i18n?.es), after: name });
  }
  notApplied.push(`Nails note ("${NAIL_NOTE_ES}"): not applied, no storage location for a category note was identified`);

  const approved = new Set([...SERVICE_DESCRIPTIONS_ES.map((s) => s.title), ...NAIL_NAMES_ES].map(norm));
  for (const o of offerings) {
    if (![o.title, o.title_i18n?.es].some((t) => approved.has(norm(t)))) {
      notApplied.push(`Offering "${o.title}" (${o.id}) is not in the approved list; left untouched`);
    }
  }
  return { rows, notApplied, patches };
}

// ---------------------------------------------------------------- English descriptions (LIVE)

/**
 * Plan description_i18n.en for the approved services. Same exact-title matching
 * as planOfferings; mismatches and duplicates are reported and skipped. Merges
 * into the existing object (es and any other locale preserved) and sets `en`
 * only. When the ES planner already has a pending patch for the same offering,
 * the merge starts from that patch so the sequential writes do not undo each other.
 */
export function planEnglishDescriptions(offerings: readonly OfferingRow[], pending: Plan["offeringPatches"] = []) {
  const rows: DiffRow[] = [];
  const notApplied: string[] = [];
  const patches: Plan["offeringPatches"] = [];
  for (const { title, description } of SERVICE_DESCRIPTIONS_EN) {
    const found = offerings.filter((o) => norm(o.title) === norm(title) || norm(o.title_i18n?.es) === norm(title));
    if (found.length === 0) { notApplied.push(`English description for "${title}": no offering with that exact title; NOT applied`); continue; }
    if (found.length > 1) { notApplied.push(`English description for "${title}": ${found.length} offerings share that title; NOT applied (ambiguous)`); continue; }
    const o = found[0]!;
    const queued = pending.find((p) => p.id === o.id)?.patch.description_i18n;
    const base = (queued && typeof queued === "object" ? queued : o.description_i18n ?? {}) as Record<string, string>;
    if (o.description_i18n?.en === description) continue;
    patches.push({ id: o.id, label: title, patch: { description_i18n: { ...base, en: description } } });
    rows.push({ scope: "LIVE (immediately visible)", field: `Service "${title}" description_i18n.en`, before: show(o.description_i18n?.en), after: description });
  }
  return { rows, notApplied, patches };
}

// ---------------------------------------------------------------- contact (LIVE)

type Link = Record<string, unknown>;
const hrefOf = (l: Link) => (typeof l.href === "string" ? l.href.trim() : "");

function isWhatsapp(l: Link): boolean {
  const h = hrefOf(l);
  return l.platform === "whatsapp" || h.startsWith("shell://whatsapp/") || /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(h);
}
function isInstagram(l: Link): boolean {
  const h = hrefOf(l);
  if (l.platform === "instagram") return true;
  try { if (/(^|\.)instagram\.com$/i.test(new URL(h).hostname)) return true; } catch { /* not a URL */ }
  return /^@?jorgbeauty$/i.test(h) || /instagram/i.test(String(l.label ?? ""));
}

export function planSocialLinks(raw: unknown) {
  const before: Link[] = Array.isArray(raw) ? (raw.filter((x) => x && typeof x === "object") as Link[]) : [];
  const after = clone(before);
  const rows: DiffRow[] = [];
  const upsert = (name: string, test: (l: Link) => boolean, make: () => Link, want: string) => {
    const idx = after.findIndex(test);
    if (idx >= 0) {
      if (hrefOf(after[idx]!) === want) return;
      rows.push({ scope: "LIVE (immediately visible)", field: `${name} link`, before: show(hrefOf(after[idx]!)), after: want });
      after[idx] = { ...after[idx]!, href: want };
    } else {
      rows.push({ scope: "LIVE (immediately visible)", field: `${name} link`, before: "(none)", after: want });
      after.push(make());
    }
  };
  upsert("WhatsApp", isWhatsapp, () => ({ label: "WhatsApp", platform: "whatsapp", href: CONTACT.whatsappHref }), CONTACT.whatsappHref);
  upsert("Instagram", isInstagram, () => ({ label: "Instagram", platform: "instagram", href: CONTACT.instagramHref }), CONTACT.instagramHref);
  return { rows, after, changed: rows.length > 0 };
}

// ---------------------------------------------------------------- plan + run

export const POLICIES_NOT_APPLIED =
  `Booking policies (${POLICIES_ES.length} approved clauses, ES + faithful EN in content.ts): NOT applied. ` +
  "Policy text is rendered from facts + 2 answers and stored only as immutable published versions " +
  "(talent_policy_versions: no draft, stamped onto bookings, overwritten by her next publish). " +
  "Needs a product decision (custom-clauses field).";

export async function computePlan(io: Io, o: Options): Promise<Plan> {
  assertProfileCode(o.profileCode);
  const profile = await io.findProfile(o.profileCode);
  if (!profile) throw new RefusedError(`profile ${o.profileCode} not found`);
  assertProfileCode(profile.profile_code);
  const site = await io.findSite(profile.id);
  assertSiteSlug(site?.site_slug);

  const rows: DiffRow[] = [];
  const notApplied: string[] = [POLICIES_NOT_APPLIED];

  let draftHome: Plan["draftHome"] = null;
  const page = await io.findHomePage(profile.id);
  if (!page) {
    notApplied.push("Home page: no is_home page found; hero and ticker NOT applied");
  } else {
    const t = planTree(page.blocks);
    rows.push(...t.rows);
    notApplied.push(...t.notApplied);
    if (t.rows.length > 0) {
      draftHome = { pageId: page.id, expectedUpdatedAt: page.updated_at, before: clone(page.blocks) as Node[], after: t.after };
    }
  }

  const offeringsList = await io.listOfferings(profile.id);
  const off = planOfferings(offeringsList);
  rows.push(...off.rows);
  notApplied.push(...off.notApplied);
  const en = planEnglishDescriptions(offeringsList, off.patches);
  notApplied.push(...en.notApplied);

  const rawLinks = await io.readSocialLinks(profile.id);
  const social = planSocialLinks(rawLinks);
  rows.push(...social.rows);

  return {
    rows,
    notApplied,
    draftHome,
    offeringPatches: off.patches,
    englishRows: en.rows,
    englishPatches: en.patches,
    socialLinks: social.changed ? { profileId: profile.id, before: rawLinks, after: social.after } : null,
  };
}

export function formatPlan(plan: Plan, o: Options): string {
  const out: string[] = [];
  const mode = o.applyDraft && o.yes ? (o.includeLiveFields ? "APPLY DRAFT + LIVE FIELDS" : "APPLY DRAFT ONLY") : "DRY RUN (nothing is written)";
  out.push(`TUL-73 Jorgelina content, target ${o.profileCode} / ${ALLOWED_SITE_SLUG}. Mode: ${mode}`, "");
  if (plan.rows.length === 0) out.push("No changes: everything approved is already in place.");
  for (const r of plan.rows) {
    const live = r.scope !== "DRAFT";
    const skipped = live && !o.includeLiveFields ? "  [will NOT be written: needs --include-live-fields]" : "";
    out.push(`[${r.scope}] ${r.field}${skipped}`, `   before: ${r.before}`, `   after:  ${r.after}`);
  }
  if (plan.englishRows.length > 0) {
    out.push("", "English service descriptions (description_i18n.en only):");
    const skipEn = !(o.includeLiveFields && o.includeEnglishDescriptions) ? "  [will NOT be written: needs --include-live-fields --include-english-descriptions]" : "";
    for (const r of plan.englishRows) out.push(`[${r.scope}] ${r.field}${skipEn}`, `   before: ${r.before}`, `   after:  ${r.after}`);
  }
  out.push("", "Not applied / report:");
  for (const n of plan.notApplied) out.push(`  - ${n}`);
  out.push("", "This script never publishes. Publishing the site is a separate step.");
  return out.join("\n");
}

export interface RunResult { exitCode: number; plan?: Plan; wrote: string[] }

export async function run(argv: readonly string[], io: Io, log: (s: string) => void = console.log): Promise<RunResult> {
  const wrote: string[] = [];
  let opts: Options;
  try {
    opts = parseArgs(argv);
    assertMode(opts);
    assertProfileCode(opts.profileCode);
  } catch (e) {
    log(`REFUSED: ${(e as Error).message}`);
    return { exitCode: 2, wrote };
  }
  let plan: Plan;
  try {
    plan = await computePlan(io, opts);
  } catch (e) {
    log(`REFUSED: ${(e as Error).message}`);
    return { exitCode: 2, wrote };
  }
  log(formatPlan(plan, opts));
  if (!(opts.applyDraft && opts.yes)) return { exitCode: 0, plan, wrote };

  if (plan.draftHome) {
    const r = await io.writeDraftHome(plan.draftHome);
    if (!r.ok) { log(`FAILED draft write: ${r.error ?? "no row matched (a save landed in between); re-run"}`); return { exitCode: 1, plan, wrote }; }
    wrote.push("draft:home");
  }
  if (opts.includeLiveFields) {
    for (const p of plan.offeringPatches) {
      const r = await io.updateOffering({ id: p.id, patch: p.patch });
      if (!r.ok) { log(`FAILED offering "${p.label}": ${r.error}`); return { exitCode: 1, plan, wrote }; }
      wrote.push(`live:offering:${p.label}`);
    }
    if (opts.includeEnglishDescriptions) {
      for (const p of plan.englishPatches) {
        const r = await io.updateOffering({ id: p.id, patch: p.patch });
        if (!r.ok) { log(`FAILED English description "${p.label}": ${r.error}`); return { exitCode: 1, plan, wrote }; }
        wrote.push(`live:offering-en:${p.label}`);
      }
    }
    if (plan.socialLinks) {
      const r = await io.writeSocialLinks({ profileId: plan.socialLinks.profileId, after: plan.socialLinks.after });
      if (!r.ok) { log(`FAILED social links: ${r.error}`); return { exitCode: 1, plan, wrote }; }
      wrote.push("live:social_links");
    }
  }
  log(`Wrote: ${wrote.length ? wrote.join(", ") : "nothing (already in place)"}. NOT published.`);
  return { exitCode: 0, plan, wrote };
}
