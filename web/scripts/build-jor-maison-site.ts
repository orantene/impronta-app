/**
 * build-jor-maison-site.ts — the Maison mockup (/dev/jor-beauty), rebuilt as
 * ordinary PAGE-BUILDER nodes on Jorgelina's real site.
 *
 * Run: tsx --env-file=.env.local scripts/build-jor-maison-site.ts
 *
 * Every measurement below was read off the mockup's computed styles at 1280px
 * and 390px, not eyeballed. Desktop is the base style; the phone layout lives
 * in each node's `style.responsive.mobile` (the builder's own breakpoint
 * layer), so both are editable in the page builder. `customCss` is used only
 * where the builder has no field: the marquee motion, the FAQ "+" marker and
 * the phone-only booking bar.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  JOR_CATEGORIES,
  JOR_GALLERY,
  JOR_MAISON_CONTENT as C,
  JOR_OFFERINGS,
} from "../src/app/dev/jor-beauty/seed";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required. Run with tsx --env-file=.env.local`);
  return v;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const admin: SupabaseClient = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROFILE_CODE = "TAL-JORGBEAUTY";
const BUCKET = "media-public";
const BOOK_HREF = "https://tulala.digital/t/TAL-JORGBEAUTY#servicios";

const INK = "#241F26";
const MUTED = "#665F6B";
const PRIMARY = "#A82458";
const TINT = "#FFF5F8";
const LINE = "#EDE8EB";
const WHITE = "#FFFFFF";
const BODY_FONT = '"Inter", var(--font-inter-body), system-ui, sans-serif';

const MAISON_TOKENS: Record<string, string> = {
  "color.background": WHITE,
  "color.ink": INK,
  "color.text": INK,
  "color.muted": MUTED,
  "color.primary": PRIMARY,
  "color.accent": "#F4D7E2",
  "color.surface-raised": TINT,
  "color.line": LINE,
  "typography.heading-font-family": "Fraunces",
  "typography.body-font-family": BODY_FONT,
};

const T = {
  primary: "token:color.primary",
  ink: "token:color.ink",
  muted: "token:color.muted",
  tint: "token:color.surface-raised",
  line: "token:color.line",
  display: "token:typography.heading-font-family",
};

// ── assets ─────────────────────────────────────────────────────────────────
const uploaded = new Map<string, string>();
let profileId = "";
async function asset(localPath: string): Promise<string> {
  if (!localPath.startsWith("/mockups/")) return localPath;
  const hit = uploaded.get(localPath);
  if (hit) return hit;
  const bytes = await readFile(path.join(process.cwd(), "public", localPath));
  const key = `talent/${profileId}/site/${localPath.replace("/mockups/jor-beauty/", "").replace(/\//g, "-")}`;
  const contentType = localPath.endsWith(".png") ? "image/png" : "image/jpeg";
  const { error } = await admin.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: true });
  if (error) throw error;
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
  uploaded.set(localPath, url);
  return url;
}

// ── node helpers ───────────────────────────────────────────────────────────
type N = Record<string, unknown>;
type S = Record<string, unknown>;
let seq = 0;
const id = () => `mn-${(seq += 1).toString(36)}`;

/** Base style + optional phone overrides, in the builder's own shape. */
function st(base: S, mobile?: S): { style: S } {
  return { style: mobile ? { ...base, responsive: { mobile } } : base };
}

const node = (kind: string, props: N, children?: N[]): N =>
  children ? { id: id(), kind, props, children } : { id: id(), kind, props };

const box = (children: N[], base: S = {}, mobile?: S, extra: N = {}): N =>
  node("container", { layout: "stack", gap: "s", ...extra, ...st({ gap: "0", maxWidthFree: "none", paddingTop: "0", paddingRight: "0", paddingBottom: "0", paddingLeft: "0", ...base }, mobile) }, children);
const row = (children: N[], base: S = {}, mobile?: S, extra: N = {}): N =>
  node("container", { layout: "row", gap: "s", align: "center", responsive: { mobile: { layout: "row" } }, ...extra, ...st({ gap: "0", flexWrap: "wrap", maxWidthFree: "none", paddingTop: "0", paddingRight: "0", paddingBottom: "0", paddingLeft: "0", ...base }, mobile) }, children);
const grid = (children: N[], base: S, mobile?: S, extra: N = {}): N =>
  node("container", { layout: "grid", gap: "s", columns: 2, responsive: { mobile: { layout: "grid" } }, ...extra, ...st({ maxWidthFree: "none", paddingTop: "0", paddingRight: "0", paddingBottom: "0", paddingLeft: "0", ...base }, mobile) }, children);

const text = (t: string, base: S = {}, mobile?: S): N =>
  node("paragraph", { text: t, ...st({ marginTopFree: "0", marginBottomFree: "0", fontSize: "16px", lineHeight: "1.5", textColor: T.ink, ...base }, mobile) });
const muted = (t: string, base: S = {}, mobile?: S) => text(t, { textColor: T.muted, ...base }, mobile);

const H2 = { fontSize: "50px", lineHeight: "0.98", letterSpacing: "-0.03em" };
const H2_M = { fontSize: "36px" };
const heading = (t: string, level: 1 | 2 | 3, base: S = {}, mobile?: S): N =>
  node("heading", {
    text: t, level,
    ...st({ marginTopFree: "0", marginBottomFree: "0", fontFamily: T.display, fontWeight: 400, textColor: T.ink, ...base }, mobile),
  });

const kicker = (t: string, base: S = {}) =>
  text(t, { fontSize: "12px", lineHeight: "18px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", textColor: T.primary, marginBottomFree: "18px", ...base });

const img = (src: string, alt: string, base: S = {}, mobile?: S): N =>
  node("image", { src, alt, ...st({ width: "100%", objectFit: "cover", borderRadius: "18px", ...base }, mobile) });

const BTN = { textTransform: "none", fontSize: "15px", fontWeight: 500, letterSpacing: "0.005em", borderRadius: "10px", paddingTop: "15px", paddingBottom: "15px", paddingLeft: "30px", paddingRight: "30px", lineHeight: "22px", whiteSpace: "nowrap", width: "auto" };
const primaryBtn = (label: string, href: string, base: S = {}, extra: N = {}, mobile?: S): N =>
  node("button", { label, href, tone: "primary", ...extra, ...st({ ...BTN, backgroundColor: T.primary, textColor: WHITE, borderWidth: "0", ...base }, mobile) });
const outlineBtn = (label: string, href: string, base: S = {}, extra: N = {}, mobile?: S): N =>
  node("button", { label, href, tone: "secondary", ...extra, ...st({ ...BTN, paddingTop: "14px", paddingBottom: "14px", backgroundColor: WHITE, textColor: T.ink, borderColor: T.line, borderWidth: "1px", borderStyle: "solid", ...base }, mobile) });
const linkBtn = (label: string, href: string, base: S = {}, extra: N = {}): N =>
  node("button", { label, href, tone: "secondary", ...extra, ...st({ ...BTN, backgroundColor: "transparent", borderWidth: "0", paddingLeft: "0", paddingRight: "0", textColor: T.ink, ...base }) });

/** The content column every band shares: 1184px inside 48px gutters (20px on a phone). */
function band(anchorId: string | null, children: N[], base: S = {}, mobile: S = {}, inner: S = {}): N {
  return node("container", {
    layout: "stack", gap: "s", ...(anchorId ? { anchorId } : {}),
    ...st(
      { gap: "0", width: "100%", maxWidthFree: "none", marginLeftFree: "0", marginRightFree: "0", paddingTop: "128px", paddingBottom: "128px", paddingLeft: "48px", paddingRight: "48px", textColor: T.ink, fontFamily: BODY_FONT, ...base },
      { paddingTop: "72px", paddingBottom: "72px", paddingLeft: "20px", paddingRight: "20px", ...mobile },
    ),
  }, [box(children, { width: "100%", maxWidthFree: "1184px", marginLeftFree: "auto", marginRightFree: "auto", ...inner })]);
}

const reveal = (child: N, opts: { effect?: string; delayMs?: number; distance?: number; style?: S } = {}): N =>
  node("reveal", { effect: opts.effect ?? "rise", direction: "up", distance: opts.distance ?? 20, durationMs: 550, delayMs: opts.delayMs ?? 0, once: true, threshold: 0.05, ...(opts.style ? st(opts.style) : {}) }, [child]);

const money = (cents: number | null | undefined) =>
  cents == null ? "Consultar" : `$${Math.round(cents / 100).toLocaleString("en-US")}`;
function dur(m: number | null | undefined): string | null {
  if (!m) return null;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h ? `${h} h` : ""}${h && r ? " " : ""}${r ? `${r} min` : ""} · duración estimada`;
}

// ── sections ───────────────────────────────────────────────────────────────
async function hero(): Promise<N> {
  const heroImg = await asset(C.heroImageUrl ?? "/mockups/jor-beauty/v2/hero-lash.jpg");
  const inset = await asset(C.heroInsetUrl ?? "/mockups/jor-beauty/v2/hero-nails.jpg");
  const copy = box([
    reveal(kicker(C.heroKicker ?? "Playa del Carmen Centro")),
    reveal(heading(`${C.heroTitle} {i}${C.heroTitleAccent}{/i}`, 1,
      { fontSize: "84px", lineHeight: "1", letterSpacing: "-0.03em" },
      { fontSize: "44px", lineHeight: "1.02" }), { delayMs: 70 }),
    reveal(muted(C.heroLead ?? "", { fontSize: "17px", lineHeight: "1.62", maxWidthFree: "558px", marginTopFree: "22px" }), { delayMs: 150 }),
    reveal(row([
      primaryBtn("Ver servicios y reservar", "#servicios", {}, { trailingIcon: "arrow_down" }),
      outlineBtn("Conóceme", "#sobre-mi"),
    ], { gap: "14px", marginTopFree: "34px" }, { flexDirection: "column", alignItems: "flex-start", gap: "12px" }), { delayMs: 230 }),
    reveal(muted(`7 años de experiencia   {color:${PRIMARY}}•{/color}   Especialista en pestañas`, { fontSize: "15px", marginTopFree: "28px", whiteSpace: "pre-wrap" }), { delayMs: 300 }),
  ], { alignSelf: "center" });

  const media = box([
    reveal(img(heroImg, "Extensiones de pestañas de Jorg Beauty", { aspectRatioFree: "551 / 734" }, { aspectRatioFree: "4 / 5" }), { effect: "fade" }),
    reveal(img(inset, "Manicura de Jorg Beauty", {
      position: "absolute", right: "-30px", bottom: "-35px", width: "222px", height: "222px",
      aspectRatioFree: "1 / 1", borderWidth: "9px", borderStyle: "solid", borderColor: WHITE, backgroundColor: T.tint,
    }, { width: "150px", height: "150px", right: "0px", bottom: "-24px", borderWidth: "6px" }), { effect: "fade", delayMs: 260 }),
  ], { position: "relative" });

  return grid([copy, media], {
    gridTemplateColumns: "562fr 551fr", gap: "72px", alignItems: "center",
    width: "100%", maxWidthFree: "1280px", marginLeftFree: "auto", marginRightFree: "auto",
    paddingTop: "48px", paddingLeft: "48px", paddingRight: "48px", textColor: T.ink, fontFamily: BODY_FONT,
  }, { gridTemplateColumns: "1fr", gap: "40px", paddingTop: "24px", paddingLeft: "20px", paddingRight: "20px" }, { layerLabel: "Hero" });
}

function marquee(): N {
  const words = (C.marquee ?? JOR_CATEGORIES.map((c) => c.label)) as string[];
  const loop = [...words, ...words, ...words, ...words];
  const items = loop.flatMap((w, i) => [
    text(i % 2 ? w : `{i}${w}{/i}`, {
      fontFamily: T.display, fontSize: "28px", lineHeight: "1.2", whiteSpace: "nowrap", width: "auto",
      textColor: i % 2 ? T.ink : T.primary,
    }, { fontSize: "22px" }),
    text("✦", { fontSize: "18px", textColor: T.primary, width: "auto" }),
  ]);
  const track = row(items, {
    gap: "34px", flexWrap: "nowrap", width: "max-content",
    customCss: "@keyframes jbMarquee { from { transform: translateX(0) } to { transform: translateX(-50%) } } { animation: jbMarquee 38s linear infinite; } @media (prefers-reduced-motion: reduce) { { animation: none; } }",
  }, { gap: "24px" }, { layerLabel: "Cinta" });
  return box([track], {
    width: "100%", maxWidthFree: "none", marginLeftFree: "0", marginRightFree: "0", overflow: "hidden", marginTopFree: "96px",
    borderColor: T.line, borderWidth: "1px 0", borderStyle: "solid", paddingTop: "18px", paddingBottom: "18px",
  }, { marginTopFree: "64px", paddingTop: "14px", paddingBottom: "14px" }, { layerLabel: "Categorías (cinta)" });
}

async function artist(): Promise<N> {
  const portrait = await asset("/mockups/jor-beauty/jorgelina-portrait-v2.jpg");
  const more = node("accordion", { allowMultiple: false, defaultOpenItemIds: [], ...st({ gap: "0", marginTopFree: "8px" }) }, [
    node("accordion_item", {
      title: C.artist?.moreLabel ?? "Leer la historia completa",
      ...st({
        borderWidth: "0", paddingTop: "0", paddingBottom: "0", paddingLeft: "0", paddingRight: "0",
        customCss: `summary { list-style: none; font-size: 15px; font-weight: 500 !important; color: ${INK}; padding: 10px 0; } summary::-webkit-details-marker { display: none; } summary::after { content: " ↓"; }`,
      }),
    }, (C.artist?.more ?? []).map((t) => muted(t, { fontSize: "16px", lineHeight: "28px", maxWidthFree: "565px" }))),
  ]);
  return band("sobre-mi", [
    grid([
      img(portrait, "Jorgelina, creadora de Jorg Beauty", { aspectRatioFree: "4 / 5" }),
      box([
        reveal(heading(C.artist?.greeting ?? "Hola, soy Jorgelina", 2, H2, H2_M)),
        ...(C.artist?.paragraphs ?? []).map((t, i) =>
          muted(t, { fontSize: "16px", lineHeight: "28px", maxWidthFree: "565px", marginTopFree: i === 0 ? "28px" : "20px" })),
        more,
      ], { alignSelf: "center" }),
    ], { gridTemplateColumns: "458fr 654fr", gap: "72px", alignItems: "center" }, { gridTemplateColumns: "1fr", gap: "32px" }),
  ]);
}

async function services(): Promise<N> {
  const rowFor = async (o: (typeof JOR_OFFERINGS)[number]): Promise<N> => {
    const thumb = o.imageUrls?.[0] ? await asset(o.imageUrls[0]) : null;
    const variants = (o as { variants?: unknown[] }).variants ?? [];
    const from = variants.length > 1;
    const d = dur((o as { durationMinutes?: number | null }).durationMinutes);
    const price = (o as { amountCents?: number | null }).amountCents;
    return grid([
      thumb
        ? img(thumb, o.title, { width: "92px", height: "92px", aspectRatioFree: "1 / 1", borderRadius: "12px" }, { width: "84px", height: "84px" })
        : box([]),
      box([
        heading(o.title, 3, { fontFamily: BODY_FONT, fontSize: "17px", lineHeight: "1.3", fontWeight: 600, letterSpacing: "-0.01em" }),
        ...(o.description ? [muted(o.description, { fontSize: "15px", lineHeight: "1.55", maxWidthFree: "435px", marginTopFree: "7px" })] : []),
        ...(d ? [muted(d, { fontSize: "13px", marginTopFree: "10px" })] : []),
      ]),
      text(`${from ? "Desde " : ""}${money(price)}`, { fontSize: "18px", fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", justifySelf: "end", alignSelf: "center" },
        { justifySelf: "start" }),
      outlineBtn(from ? "Elegir opciones" : "Seleccionar", BOOK_HREF,
        { fontWeight: 600, paddingLeft: "20px", paddingRight: "20px", paddingTop: "11px", paddingBottom: "11px", alignSelf: "center", justifySelf: "end" }, {}, { justifySelf: "end", width: "auto" }),
    ], {
      gridTemplateColumns: "92px minmax(0, 1fr) 96px 126px", gap: "16px 30px", alignItems: "start",
      paddingTop: "31px", paddingBottom: "31px", borderColor: T.line, borderWidth: "1px 0 0 0", borderStyle: "solid",
      customCss: "@media (max-width: 640px) { > a:last-child { justify-self: end !important; width: auto !important; min-width: 150px; } }",
    }, { gridTemplateColumns: "84px minmax(0, 1fr)", gap: "16px 16px", paddingTop: "24px", paddingBottom: "24px" }, { layerLabel: o.title });
  };

  const panels: N[] = [];
  for (const cat of JOR_CATEGORIES) {
    const items = JOR_OFFERINGS.filter((o) => o.category === cat.id);
    if (!items.length) continue;
    panels.push(node("tab_panel", { title: cat.label, ...st({ gap: "0" }) }, [
      ...(cat.note ? [muted(cat.note, { fontSize: "15px", paddingBottom: "18px", textColor: T.primary })] : []),
      ...(await Promise.all(items.map(rowFor))),
    ]));
  }
  const PILL_CSS = [
    "{ gap: 38px !important; }",
    "[role=tablist] { gap: 10px !important; }",
    "[role=tabpanel] > [data-builder-node-kind=tab_panel] { gap: 0 !important; }",
    `[role=tab] { height: 46px; display: inline-flex; align-items: center; border: 1px solid ${LINE} !important; border-radius: 999px !important; padding: 12px 22px !important; font-size: 15px !important; line-height: 22px !important; font-weight: 500 !important; background: ${WHITE} !important; color: ${MUTED} !important; font-family: inherit !important; }`,
    `[role=tab][aria-selected=true] { background: ${INK} !important; color: ${WHITE} !important; border-color: ${INK} !important; }`,
    `[role=tabpanel] > div > [data-builder-node-kind=container]:last-child { border-bottom: 1px solid ${LINE}; }`,
  ].join(" ");
  const menuTabs = node("tabs", {
    layerLabel: "Menú por categoría",
    ...st({ gap: "38px", marginTopFree: "40px", maxWidthFree: "none", paddingTop: "0", paddingRight: "0", paddingBottom: "0", paddingLeft: "0", customCss: PILL_CSS }, { gap: "28px", marginTopFree: "28px" }),
  }, panels);

  const counter = (n: number, label: string) => box([
    text(String(n), { fontFamily: T.display, fontSize: "40px", lineHeight: "1", letterSpacing: "-0.02em" }, { fontSize: "32px" }),
    muted(label, { fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginTopFree: "8px" }),
  ], { width: "auto" });

  return band("servicios", [
    kicker("El menú"),
    grid([
      box([
        reveal(heading("Servicios {i}y precios{/i}", 2, H2, H2_M)),
        muted(C.menuNote ?? "", { fontSize: "17px", lineHeight: "1.62", marginTopFree: "18px" }),
      ]),
      row([counter(JOR_OFFERINGS.length, "Servicios"), counter(JOR_CATEGORIES.length, "Categorías")],
        { gap: "34px", justifyContent: "flex-end", alignItems: "flex-end", alignSelf: "end" },
        { justifyContent: "flex-start" }),
    ], { gridTemplateColumns: "minmax(0, 1fr) auto", gap: "32px", alignItems: "end" }, { gridTemplateColumns: "1fr", gap: "28px" }),
    menuTabs,
  ], { backgroundColor: T.tint });
}

async function results(): Promise<N> {
  const shots: N[] = [];
  for (const [i, g] of JOR_GALLERY.entries()) {
    const wide = Boolean((g as { wide?: boolean }).wide);
    const shot = img(await asset(g.url), `${g.label} — Jorg Beauty`, {
      borderRadius: "14px", backgroundColor: T.tint, height: "100%",
      aspectRatioFree: wide ? "582 / 364" : "281 / 351",
    }, wide ? { aspectRatioFree: "16 / 10" } : undefined);
    shots.push(reveal(shot, { effect: "fade", delayMs: (i % 4) * 70, style: wide ? { gridColumn: "span 2" } : {} }));
  }
  return band("resultados", [
    reveal(heading("Trabajos {i}recientes{/i}", 2, H2, H2_M)),
    grid(shots, { gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "20px", alignItems: "stretch", marginTopFree: "40px" },
      { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginTopFree: "28px" }, { layerLabel: "Galería" }),
    muted(C.galleryNote ?? "", { fontSize: "13px", marginTopFree: "28px" }),
  ]);
}

async function visit(): Promise<N> {
  const map = await asset(C.visiting?.map?.imageUrl ?? "/mockups/jor-beauty/area-map.jpg");
  const ICON: Record<string, string> = { place: "map", studio: "sparkle", days: "calendar", heart: "heart", clock: "clock", languages: "globe" };
  const facts = C.visiting?.facts ?? [];
  const mapCard = box([
    img(map, "Zona aproximada: Playa del Carmen Centro", { borderRadius: "0", height: "100%", aspectRatioFree: "580 / 634" }, { aspectRatioFree: "4 / 3" }),
    row([
      node("icon", { icon: "map", decorative: true, size: "sm", ...st({ textColor: T.primary }) }),
      text(C.visiting?.map?.caption ?? "Playa del Carmen Centro", { fontSize: "13px", fontWeight: 600, width: "auto" }),
    ], { position: "absolute", top: "16px", left: "16px", gap: "8px", backgroundColor: WHITE, borderRadius: "999px", paddingTop: "8px", paddingBottom: "8px", paddingLeft: "14px", paddingRight: "16px", flexWrap: "nowrap", width: "auto" }),
    text(C.visiting?.map?.attribution ?? "", {
      position: "absolute", left: "0", right: "0", bottom: "0", fontSize: "11px", lineHeight: "1.5", textColor: WHITE,
      paddingTop: "40px", paddingBottom: "14px", paddingLeft: "16px", paddingRight: "16px",
      backgroundImage: "linear-gradient(to top, rgba(36,31,38,0.72), rgba(36,31,38,0))",
    }),
  ], { position: "relative", borderRadius: "18px", overflow: "hidden" }, undefined, { layerLabel: "Mapa" });

  const list = box(facts.map((f, i) => grid([
    node("icon", { icon: ICON[f.icon ?? ""] ?? "check", decorative: true, size: "sm", ...st({ textColor: T.primary, alignSelf: "flex-start", marginTopFree: "2px" }) }),
    box([
      muted(f.label, { fontSize: "11px", lineHeight: "16.5px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }),
      text(f.value, { fontSize: "17px", lineHeight: "1.6", marginTopFree: "8px", maxWidthFree: "490px" }),
    ], { minWidth: "0" }),
  ], {
    gridTemplateColumns: "20px minmax(0, 1fr)", gap: "0 18px", alignItems: "start", paddingTop: "22px", paddingBottom: "22px", paddingLeft: "26px", paddingRight: "26px",
    ...(i < facts.length - 1 ? { borderColor: T.line, borderWidth: "0 0 1px 0", borderStyle: "solid" } : {}),
  }, { paddingLeft: "20px", paddingRight: "20px" })), { backgroundColor: WHITE, borderRadius: "18px", overflow: "hidden" }, undefined, { layerLabel: "Datos de la cita" });

  return band("tu-cita", [
    reveal(heading("Tu {i}cita{/i}", 2, H2, H2_M)),
    grid([mapCard, list], { gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start", marginTopFree: "52px" },
      { gridTemplateColumns: "1fr", gap: "16px", marginTopFree: "28px" }),
  ], { backgroundColor: T.tint });
}

function faq(): N {
  const items = (C.faq ?? []).map((q) => node("accordion_item", {
    title: q.q,
    ...st({
      borderWidth: "0 0 1px 0", borderStyle: "solid", borderColor: T.line, borderRadius: "0",
      paddingTop: "0", paddingBottom: "0", paddingLeft: "0", paddingRight: "0",
      customCss: `summary { list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 25px 0; font-size: 17px; font-weight: 500 !important; line-height: 1.4; color: ${INK}; } summary::-webkit-details-marker { display: none; } summary::after { content: "+"; font-size: 22px; line-height: 1; font-weight: 300; color: ${INK}; } > div { padding: 0 32px 24px 0 !important; }`,
    }),
  }, [
    muted(q.a, { fontSize: "16px", lineHeight: "26.4px" }),
    ...((q as { steps?: { title: string; detail: string }[] }).steps ?? []).map((s, i) => grid([
      text(String(i + 1), { width: "28px", height: "28px", minWidth: "28px", borderRadius: "999px", backgroundColor: T.tint, textColor: T.primary, fontSize: "13px", fontWeight: 600, align: "center", lineHeight: "28px" }),
      box([text(s.title, { fontSize: "16px", fontWeight: 500 }), muted(s.detail, { fontSize: "14px", lineHeight: "21px" })], { minWidth: "0" }),
    ], { gridTemplateColumns: "28px minmax(0, 1fr)", gap: "0 12px", alignItems: "start", paddingTop: "12px", paddingBottom: "12px" })),
  ]));
  return band("preguntas", [
    reveal(heading("Antes de tu cita", 2, { ...H2, align: "center" }, H2_M)),
    muted(C.faqIntro ?? "", { fontSize: "17px", lineHeight: "1.62", align: "center", marginTopFree: "22px" }),
    node("accordion", { allowMultiple: false, defaultOpenItemIds: [], ...st({ gap: "0", marginTopFree: "36px", borderColor: T.line, borderWidth: "1px 0 0 0", borderStyle: "solid", customCss: "{ gap: 0 !important; } > details { padding-bottom: 5px !important; }" }) }, items),
  ], {}, {}, { maxWidthFree: "638px" });
}

function closing(): N {
  const social = (label: string, icon: string) => outlineBtn(label, BOOK_HREF, {
    borderRadius: "999px", paddingLeft: "20px", paddingRight: "20px", paddingTop: "12px", paddingBottom: "12px",
  }, { leadingIcon: icon });
  return band(null, [
    reveal(heading(`${C.closing?.title} {i}${C.closing?.titleAccent}{/i}`, 2, { ...H2, align: "center" }, H2_M)),
    muted(C.closing?.body ?? "", { fontSize: "17px", lineHeight: "1.62", align: "center", marginTopFree: "22px" }),
    row([primaryBtn("Reservar con Jorg Beauty", BOOK_HREF)], { justifyContent: "center", marginTopFree: "34px" }),
    box([], { height: "1px", backgroundColor: T.line, maxWidthFree: "684px", width: "100%", marginTopFree: "48px", marginLeftFree: "auto", marginRightFree: "auto" }),
    row([
      muted("¿No encontrás tu respuesta? Escribime y lo vemos juntas.", { fontSize: "15px", width: "auto", align: "center" }),
      linkBtn("Hacer una pregunta", BOOK_HREF, { textColor: T.primary, fontWeight: 600, paddingTop: "10px", paddingBottom: "10px" }),
    ], { justifyContent: "center", gap: "12px", marginTopFree: "36px" }, { flexDirection: "column", gap: "4px" }),
    row([
      social("WhatsApp", "whatsapp"), social("@jorgbeauty", "instagram"), social("TikTok", "tiktok"), social("Correo", "email"),
    ], { justifyContent: "center", gap: "10px", marginTopFree: "18px" }),
    muted(C.contact?.note ?? "", { fontSize: "13px", align: "center", maxWidthFree: "426px", marginTopFree: "18px", marginLeftFree: "auto", marginRightFree: "auto" }),
  ], { backgroundColor: T.tint }, {}, { alignItems: "center" });
}

function bookingBar(): N {
  return row([
    box([
      text("Elige tu servicio", { fontSize: "15px", fontWeight: 600 }),
      muted("El menú completo, con sus opciones", { fontSize: "13px" }),
    ], { minWidth: "0", flexGrow: 1, flexShrink: 1, flexBasis: "0%" }),
    primaryBtn("Ver servicios", "#servicios", { paddingLeft: "22px", paddingRight: "22px" }),
  ], {
    gap: "12px", flexWrap: "nowrap", backgroundColor: WHITE, borderColor: T.line, borderWidth: "1px 0 0 0", borderStyle: "solid",
    paddingTop: "12px", paddingBottom: "12px", paddingLeft: "20px", paddingRight: "20px", fontFamily: BODY_FONT,
    customCss: "{ display: none !important; } @media (max-width: 640px) { { display: flex !important; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; box-shadow: 0 -8px 24px rgba(36,31,38,0.08); } }",
  }, undefined, { layerLabel: "Barra de reserva (móvil)" });
}

async function buildHome(): Promise<N[]> {
  return [
    await hero(),
    marquee(),
    await artist(),
    await services(),
    await results(),
    await visit(),
    faq(),
    closing(),
    bookingBar(),
  ];
}

async function buildShell(): Promise<N[]> {
  const logo = await asset("/mockups/jor-beauty/jorg-beauty-logo.png");
  const navLink = (label: string, href: string) => linkBtn(label, href, {
    fontWeight: 400, textColor: T.muted, paddingTop: "11px", paddingBottom: "11px", letterSpacing: "0",
  });
  const header = row([
    node("image", { src: logo, alt: "Jorg Beauty", ...st({ width: "134px", height: "44px", objectFit: "contain", borderRadius: "0" }, { width: "118px", height: "40px" }) }),
    row([
      navLink("Sobre mí", "#sobre-mi"), navLink("Servicios", "#servicios"), navLink("Resultados", "#resultados"),
      navLink("Tu cita", "#tu-cita"), navLink("Preguntas", "#preguntas"),
    ], { gap: "32px", flexWrap: "nowrap", width: "auto" }, { visibility: "hidden" }, { layerLabel: "Menú" }),
    row([
      text(`{b}ES{/b}  /  EN`, { alignSelf: "center", lineHeight: "20px", fontSize: "13px", letterSpacing: "0.04em", textColor: T.muted, width: "auto", whiteSpace: "pre" }),
      primaryBtn("Reservar", BOOK_HREF, {}, {}, { paddingLeft: "22px", paddingRight: "22px", paddingTop: "13px", paddingBottom: "13px" }),
    ], { gap: "24px", flexWrap: "nowrap", width: "auto" }, { gap: "14px" }),
  ], {
    justifyContent: "space-between", alignItems: "center", flexWrap: "nowrap", gap: "24px", width: "100%", maxWidthFree: "none", marginLeftFree: "0", marginRightFree: "0",
    paddingTop: "16px", paddingBottom: "16px", paddingLeft: "48px", paddingRight: "48px",
    backgroundColor: "rgba(255,255,255,0.86)", backdropFilter: "saturate(1.8) blur(14px)",
    borderColor: T.line, borderWidth: "0 0 1px 0", borderStyle: "solid",
    position: "sticky", top: "0", zIndex: 40, textColor: T.ink, fontFamily: BODY_FONT,
  }, { paddingLeft: "20px", paddingRight: "20px", paddingTop: "12px", paddingBottom: "12px" }, { layerLabel: "Header" });

  const footer = row([
    node("image", { src: logo, alt: "Jorg Beauty", ...st({ width: "134px", height: "44px", objectFit: "contain", borderRadius: "0" }) }),
    row(["Sobre mí:#sobre-mi", "Servicios:#servicios", "Resultados:#resultados", "Tu cita:#tu-cita", "Preguntas:#preguntas"].map((x) => {
      const [l, h] = x.split(":");
      return linkBtn(l, h, { fontWeight: 400, textColor: T.muted, paddingTop: "11px", paddingBottom: "11px", letterSpacing: "0" });
    }), { gap: "22px", width: "auto" }, { gap: "16px" }),
    muted("Playa del Carmen, Quintana Roo · Español · Inglés básico", { fontSize: "13px", width: "auto" }),
  ], {
    justifyContent: "space-between", alignItems: "center", gap: "24px", width: "100%", maxWidthFree: "none", marginLeftFree: "0", marginRightFree: "0",
    paddingTop: "48px", paddingBottom: "48px", paddingLeft: "48px", paddingRight: "48px",
    borderColor: T.line, borderWidth: "1px 0 0 0", borderStyle: "solid", textColor: T.ink, fontFamily: BODY_FONT, backgroundColor: WHITE,
  }, { flexDirection: "column", alignItems: "flex-start", paddingLeft: "20px", paddingRight: "20px", paddingBottom: "110px" }, { layerLabel: "Footer" });

  return [header, footer];
}

async function main(): Promise<void> {
  const { data: profile, error } = await admin.from("talent_profiles").select("id").eq("profile_code", PROFILE_CODE).maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error("profile not found");
  profileId = profile.id as string;

  const { data: site, error: sErr } = await admin.from("talent_sites").select("id, site_slug").eq("talent_profile_id", profileId).maybeSingle();
  if (sErr) throw sErr;
  if (!site) throw new Error("no site — create it in the workspace first");

  seq = 0;
  const shell = await buildShell();
  const home = await buildHome();
  const now = new Date().toISOString();

  const { error: siteErr } = await admin.from("talent_sites").update({
    shell_tree: shell, shell_published: shell,
    design_tokens: MAISON_TOKENS, design_tokens_draft: MAISON_TOKENS,
    site_published_at: now, updated_at: now,
  }).eq("id", site.id);
  if (siteErr) throw siteErr;

  // The site-level Look layer is only read behind TALENT_THEME_GALLERY_ENABLED,
  // so the palette also goes on the page's own theme slice.
  const { data: homeRow, error: hErr } = await admin.from("talent_pages").select("theme").eq("talent_profile_id", profileId).eq("slug", "home").single();
  if (hErr) throw hErr;
  const prevTheme = (homeRow?.theme ?? {}) as Record<string, unknown>;
  const prevDesign = (prevTheme.__design ?? {}) as Record<string, unknown>;
  const theme = {
    ...prevTheme,
    __design: {
      componentStyles: {}, componentStylesDraft: {}, presetSlug: null, version: 0,
      ...prevDesign,
      tokens: MAISON_TOKENS, tokensDraft: MAISON_TOKENS, publishedAt: now,
    },
  };
  const { error: pageErr } = await admin.from("talent_pages").update({
    theme, blocks: home, status: "published", published_at: now, updated_at: now,
  }).eq("talent_profile_id", profileId).eq("slug", "home");
  if (pageErr) throw pageErr;

  console.log(`shell ${shell.length} · home ${home.length} sections · ${seq} nodes · ${uploaded.size} assets`);
  console.log(`http://localhost:3210/t/site/${site.site_slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
