/**
 * AI photo generator for the foundation demo talents (PHOTO-PLAN.md, Plan 1.3).
 *
 * Writes IMAGE FILES + a photos-only PACK JSON; it never touches the database.
 * Loading goes through the photos-only loader (load-photos.mts), whose pack
 * format this mirrors: {"TAL-x": {"photos": [{file, variant, alt, tag, source,
 * photographer}]}} with variants card (avatar) / hero (cover) / gallery.
 *
 * One consistent person per demo: a text model turns the demo's photo_brief_es,
 * identity, physical fields, media_plan, services and theme into ONE detailed
 * person description plus a scene per shot (cached per demo in plan.json). The
 * headshot is generated first; every later shot that shows the person is an
 * /images/edits call with that headshot as the reference image.
 *
 * Idempotent: every image file is content-addressed (model, quality, size,
 * final prompt, reference hash); existing files are skipped. Demo-only: a demo
 * is processed only when status.json lists it with a TAL-931xx..933xx code and
 * an @demo.tulala.digital / @impronta.test email.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs npx tsx --tsconfig scripts/demo-talents/tsconfig.json \
 *     --env-file=.env.local scripts/demo-talents/ai-photos.mts --dry-run [--all] [--only TAL-93103,...]
 *   ... --yes-write [--only ...] [--cap 40] [--watch-minutes 180 --poll-minutes 5]
 *
 * --dry-run  plans (text model, cached) and prints prompts, counts and a cost
 *            estimate; generates no images. --all includes unseeded demos.
 * --yes-write required to generate images and write the pack/status files.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_PRICES, imageCostFromUsage, type ImageTokenPrices, type ImageUsage } from "../../src/lib/ai/ai-image-model";
import { buildOpenAiImageRequestBody, type OpenAiImageQuality, type OpenAiImageSize } from "../../src/lib/ai/openai-image-request";

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (n: string) => args.includes(n);
const DRY = has("--dry-run");
const WRITE = has("--yes-write");
if (DRY === WRITE) throw new Error("pass exactly one of --dry-run or --yes-write");
const ALL = has("--all");
const ONLY = new Set((opt("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const CAP = Number(opt("--cap") ?? 40);
const CONCURRENCY = Number(opt("--concurrency") ?? 4);
const MODEL = opt("--model") ?? process.env.OPENAI_IMAGE_MODEL?.trim() ?? DEFAULT_IMAGE_MODEL;
const PLAN_MODEL = opt("--plan-model") ?? "gpt-4.1-mini";
const Q_PORTRAIT = (opt("--quality-portrait") ?? "medium") as OpenAiImageQuality;
const Q_WORK = (opt("--quality") ?? "low") as OpenAiImageQuality;
const WATCH_MIN = Number(opt("--watch-minutes") ?? 0);
const POLL_MIN = Number(opt("--poll-minutes") ?? 5);
const REPLAN = has("--replan");
const SAMPLES = Number(opt("--samples") ?? 3);

const ROOT = opt("--root") ?? path.join(os.homedir(), "Desktop/tulala-exports/demo-foundation");
const OUT = opt("--out") ?? path.join(ROOT, "photos");
const STATUS_OUT = path.join(ROOT, "photos-status.json");
const PACK_OUT = path.join(OUT, "pack.json");
const LOG = path.join(OUT, "run.log");
const PHOTOGRAPHER = "AI generated (Tulala demo)";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY missing");

// ── Inputs ───────────────────────────────────────────────────────────────────
type Service = { name_es: string; name_en?: string; description_es?: string; description_en?: string; category_en?: string };
type Demo = {
  demo_id: string; display_name: string; first_name: string; gender: string; age: number; city: string; neighbourhood?: string;
  state?: string; country: string; taxonomy_slug: string; locale: string; photo_brief_es: string; bio_es?: string; services: Service[];
};
type Fields = { demo_id: string; type_fields?: Record<string, unknown>; universal?: Record<string, unknown>; media_plan: { headshot: string; cover: string; gallery: string[]; albums?: { title_es: string; shots: number }[] } };
type StatusRow = { demo_id: string; code: string; email: string; profile_id: string; default_locale?: string; supported_locales?: string[] };

const readJson = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;
const batchFiles = (dir: string) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /^batch-\d+\.json$/.test(f)).map((f) => path.join(ROOT, dir, f));
const demos = new Map<string, Demo>();
for (const f of batchFiles("out")) for (const d of readJson<Demo[]>(f)) demos.set(d.demo_id, d);
const fields = new Map<string, Fields>();
for (const f of batchFiles("fields-out")) for (const x of readJson<Fields[]>(f)) fields.set(x.demo_id, x);
const guide = readJson<{ themes: { id: string; name: string; demos: string[] }[] }>(path.join(ROOT, "guide/demos.json"));
const themeOf = new Map<string, string>();
const themeOrder: string[] = [];
for (const t of guide.themes) for (const id of t.demos) { themeOf.set(id, t.name); themeOrder.push(id); }
const siteLang = new Map(readJson<{ demos: { id: string; default_locale: string; supported_locales: string[] }[] }>(path.join(ROOT, "site-languages.json")).demos.map((d) => [d.id, d]));
const readManifest = () => readJson<{ entries?: Record<string, { talentProfileId: string }> }>(path.join(ROOT, "manifest-foundation.json"));
const readStatus = () => readJson<Record<string, StatusRow>>(path.join(ROOT, "status.json"));

// ── Demo-only guard ──────────────────────────────────────────────────────────
const DEMO_CODE = /^TAL-93[123]\d{2}$/;
const DEMO_EMAIL = /@(demo\.tulala\.digital|impronta\.test)$/i;
function assertDemo(s: StatusRow | undefined): asserts s is StatusRow {
  if (!s) throw new Error("REFUSE: not seeded (no status.json row)");
  if (!DEMO_CODE.test(s.code)) throw new Error(`REFUSE: ${s.code} is not a TAL-931xx..933xx demo code`);
  if (!DEMO_EMAIL.test(s.email ?? "")) throw new Error(`REFUSE: ${s.code} email is not a demo email`);
  if (!/^[0-9a-f-]{36}$/.test(s.profile_id ?? "")) throw new Error(`REFUSE: ${s.code} has no profile_id`);
  const m = readManifest().entries?.[s.code];
  if (!m || m.talentProfileId !== s.profile_id) throw new Error(`REFUSE: ${s.code} is not in manifest-foundation.json with this profile`);
}

// ── Shot structure (deterministic; the planner only writes scenes + alts) ────
type Variant = "card" | "hero" | "gallery";
type Slot = { slot: string; variant: Variant; tag: string; size: OpenAiImageSize; hint: string; person: "required" | "optional" | "none"; service?: number; album?: string };

const NO_CLIENT_FACES = new Set(["Paw", "Nest", "Clarity", "Counsel"]);
/** A scene with someone other than the talent in it (or their mouth/teeth, for dental work). */
const OTHER_PERSON = /\b(client|clients|patient|patients|customer|customers|child|children|kid|kids|baby|babies|toddler|infant|student|students|family|families|couple|guest|guests|owner|owners|person|people|someone|senior|seniors|elder|elderly|mother|father|parent|parents|group|mouth|teeth|tooth|face)\b|children’s|children's/i;
function slotsFor(d: Demo, f: Fields, theme: string): Slot[] {
  const mp = f.media_plan;
  const portraitGallery = theme === "Folio";
  const gSize: OpenAiImageSize = portraitGallery ? "1024x1536" : "1024x1024";
  const s: Slot[] = [
    { slot: "card", variant: "card", tag: "headshot", size: "1024x1024", person: "required", hint: `Headshot / avatar. ${mp.headshot}. Face in the upper third, eyes about one third from the top, shoulders visible, room above the head.` },
    { slot: "hero", variant: "hero", tag: "bts", size: "1536x1024", person: "required", hint: `Wide cover / banner in their real working context. ${mp.cover}.` },
  ];
  const galleryHints = [...mp.gallery];
  galleryHints.push("Another finished result of their work, different from the others (trade-true, per the brief)");
  galleryHints.push("A candid in-progress moment of them working (per the brief)");
  const albums = mp.albums ?? [];
  galleryHints.forEach((h, i) => {
    const album = theme === "Folio" ? (i < 3 ? albums[0]?.title_es ?? "Capítulo 1" : albums[1]?.title_es ?? "Capítulo 2") : albums[0]?.title_es;
    s.push({ slot: `g${i + 1}`, variant: "gallery", tag: "portfolio", size: gSize, person: portraitGallery ? "required" : "optional", hint: h, album });
  });
  d.services.slice(0, 4).forEach((sv, i) => {
    s.push({ slot: `s${i + 1}`, variant: "gallery", tag: "portfolio", size: "1024x1024", person: "optional", service: i, hint: `Photo for the service "${sv.name_en ?? sv.name_es}": ${sv.description_en ?? sv.description_es ?? ""}. Show the service's real result or the service being delivered.` });
  });
  const extra = (n: number, hint: string, size: OpenAiImageSize, person: Slot["person"] = "optional", tag = "portfolio") => {
    for (let i = 1; i <= n; i++) s.push({ slot: `x${s.filter((z) => z.slot.startsWith("x")).length + 1}`, variant: "gallery", tag, size, person, hint: `${hint} (${i} of ${n}, each different)` });
  };
  switch (theme) {
    case "Maison":
    case "Maison v2":
      extra(1, "Recent work tied to one of the services: a close result shot", "1024x1024", "none");
      extra(1, "Small inset detail shot: tools, texture or a close detail of the finished work, shallow depth of field", "1024x1024", "none");
      break;
    case "Frame":
      extra(6, "Portfolio image from their photography/visual work (the kind of shoots they sell)", "1536x1024", "none");
      break;
    case "Orbit":
    case "Studio":
    case "Lumen":
      extra(1, "Vertical 9:16 cinematic poster frame of them in their craft, no text", "1024x1536", "required", "in_motion");
      extra(1, "Horizontal 16:9 cinematic poster frame of their work, no text", "1536x1024", "optional", "in_motion");
      break;
    case "Atlas":
    case "Route":
      extra(3, `Place photo: a real-feeling location they work in around ${d.city}${d.neighbourhood ? ` (${d.neighbourhood})` : ""}, no famous landmark close-ups, no people's faces in focus`, "1536x1024", "none");
      break;
    case "Spotlight":
    case "Stage":
    case "Ribbon":
      extra(3, "Event photo: them working at a live event (wedding, show or venue), guests blurred or from behind", "1536x1024", "optional", "in_motion");
      break;
    default:
      break;
  }
  return s;
}

// ── Planner (text model → person + scenes + alts), cached per demo ───────────
type PlannedShot = { slot: string; scene_en: string; shows_person: boolean; alt_es: string; alt_en: string };
type Plan = { inputHash: string; model: string; person_en: string; shots: PlannedShot[] };

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

async function openaiJson(pathName: string, body: unknown): Promise<unknown> {
  return withRetry(async () => {
    const res = await fetch(`https://api.openai.com/v1/${pathName}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new HttpError(res.status, (await res.text()).slice(0, 300));
    return res.json();
  });
}

function physicalOf(f: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f.type_fields ?? {})) {
    if (k.startsWith("physical.") && v !== "" && v !== null && !/(bust|waist|hips|inseam|shoe|dress|suit|weight|allerg)/.test(k)) out[k.slice(9)] = v;
  }
  return out;
}

async function planFor(d: Demo, f: Fields, theme: string, code: string): Promise<Plan> {
  const slots = slotsFor(d, f, theme);
  const input = {
    name: d.display_name, gender: d.gender, age: d.age, city: d.city, neighbourhood: d.neighbourhood, state: d.state, country: d.country,
    trade: d.taxonomy_slug, theme, photo_brief_es: d.photo_brief_es, physical: physicalOf(f),
    personality: f.universal?.personality, bio_es: d.bio_es?.slice(0, 600),
    services: d.services.slice(0, 4).map((s) => ({ en: s.name_en, es: s.name_es, desc: s.description_en ?? s.description_es })),
    slots: slots.map((s) => ({ slot: s.slot, hint: s.hint, person: s.person, size: s.size })),
    no_client_faces: NO_CLIENT_FACES.has(theme),
  };
  const inputHash = sha(JSON.stringify({ input, PLAN_MODEL, v: 4 })).slice(0, 16);
  const cacheFile = path.join(OUT, code, "plan.json");
  if (!REPLAN && fs.existsSync(cacheFile)) {
    const cached = readJson<Plan>(cacheFile);
    if (cached.inputHash === inputHash) return cached;
  }
  const system = [
    "You plan a photo set for a demo profile of a service professional on a booking marketplace. Output JSON only.",
    "person_en: ONE fixed description (70-110 words) of the professional, reused verbatim in every image prompt so the same person appears in every photo:",
    "exact age, gender, heritage consistent with the city/country and the brief, skin tone, face shape and distinguishing features, hair colour/length/style, eye colour, build and height impression,",
    "and ONE fixed work outfit (garments + colours) plus accessories. Use the brief and physical fields when given. Ordinary, real-looking person, not a model unless the trade is modelling. Adult. No celebrity resemblance.",
    "shots: one entry per input slot, same slot ids, same order. scene_en (40-80 words): the concrete photographic scene: setting, action, framing, props, light. Trade-true: show what this trade really",
    "produces (e.g. a nail artist: finished nails on hands; a plumber: pipes under a sink; a translator: documents and laptop at a desk). Local and specific to the city. Natural light, candid documentary style.",
    "Respect slot.person: required = the professional is clearly in frame; none = no people at all (objects, results, places, animals); optional = decide, but hands-only or over-the-shoulder is fine.",
    "VARIETY: across the gallery (g*), service (s*) and extra (x*) slots, at most 3 scenes may show the professional's face; the rest are results, close-ups of hands at work, overhead flat-lays, over-the-shoulder views, the space, or details.",
    "Vary framing and angle between shots (close-up, medium, wide, overhead, low angle); never repeat the headshot's pose or composition.",
    "shows_person: true ONLY when the professional's face is visible; hands-only or from-behind shots are false. If no_client_faces is true: never show any client's or patient's face or any child's face; use objects, rooms, pets, hands, backs.",
    "Clients may appear only partially (hands, back, out of focus). Never text, signage, logos, brand names, screens with readable text, watermarks.",
    "alt_es and alt_en: plain alt text (max 120 chars) describing the photo for screen readers, in Spanish and in English, naming the professional by first name when they are in it.",
  ].join(" ");
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const json = (await openaiJson("chat/completions", {
      model: attempt < 3 ? PLAN_MODEL : "gpt-4.1",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
    })) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    try {
      const p = JSON.parse(json.choices[0].message.content) as { person_en: string; shots: PlannedShot[] | Record<string, PlannedShot> };
      const list = Array.isArray(p.shots) ? p.shots : Object.entries(p.shots ?? {}).map(([k, v]) => ({ ...v, slot: v.slot ?? k }));
      const bySlot = new Map(list.map((s) => [s.slot, s]));
      // Talent-visible shots need the rate-limited reference edit, so optional ones are capped
      // (MAX_WORKING_FACES); the rest become hands-only work shots on the parallel lane.
      let faces = 0;
      const shots = slots.map((s) => {
        const x = bySlot.get(s.slot);
        if (!x?.scene_en || !x.alt_es || !x.alt_en) throw new Error(`planner missed slot ${s.slot}`);
        let shows = s.person === "required" ? true : s.person === "none" ? false : Boolean(x.shows_person);
        if (shows && s.person === "optional" && ++faces > MAX_WORKING_FACES) shows = false;
        return { ...x, shows_person: shows };
      });
      if (!p.person_en || p.person_en.length < 80) throw new Error("planner person_en too short");
      const plan: Plan = { inputHash, model: PLAN_MODEL, person_en: p.person_en, shots };
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(plan, null, 2));
      return plan;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`planner failed for ${code}: ${lastErr}`);
}

// ── Prompt assembly ──────────────────────────────────────────────────────────
const STYLE = "Photorealistic documentary photograph, natural light, true-to-life colour, real skin texture, shot on a full-frame camera with a 35-50mm lens.";
const RULES = "No text, letters, numbers, signage, logos, brand names, watermarks or frames anywhere in the image. Adults only. Not a celebrity. Tasteful and fully clothed.";
function promptFor(plan: Plan, shot: PlannedShot, theme: string, withRef: boolean, slotPerson: Slot["person"] = "optional"): string {
  const parts = [STYLE];
  if (shot.shows_person) {
    parts.push(withRef ? `The professional is the SAME person as in the reference photo: keep the identical face, hair, skin tone, build and outfit, but use a NEW camera angle, pose and composition (do not copy the reference framing). ${plan.person_en}` : `The professional: ${plan.person_en}`);
  } else if (slotPerson === "none") {
    parts.push("No person's face in the frame.");
  } else {
    // Without the reference a visible face would be a DIFFERENT person, so keep it out of frame.
    parts.push(`The professional's face is NOT in the frame: at most their hands and forearms appear, matching this description (skin tone, sleeves of the outfit): ${plan.person_en}`);
  }
  parts.push(`Scene: ${shot.scene_en}`);
  if (NO_CLIENT_FACES.has(theme)) {
    parts.push("No client, patient or child faces visible.");
    // The work models ignored the soft line (patients' faces in the dental chair, a child in speech
    // therapy), so any scene with another person puts that person fully out of frame.
    if (/\b(client|clients|patient|patients|customer|customers|child|children|kid|kids|baby|student|family|couple|guest|guests|owner|owners|person|people|someone|senior|elder|mother|father|parent|group|session)s?\b/i.test(shot.scene_en)) {
      parts.push("The client or patient is ENTIRELY OUT OF FRAME: show only the professional, their hands, the tools, the room or the result on an object; no other person, face or body anywhere in the image.");
    }
  }
  // Adults only: a scene the planner set around children (kids' parties, babysitting) keeps its
  // setting, but no child or baby may appear (the model drew them despite the rule line).
  if (/\b(child|children|kid|kids|baby|babies|toddler|toddlers|infant|infants|newborn|boy|girl|teen|teenager|student|family|families|parent|son|daughter|school|nursery|playground)s?\b|children’s|children's/i.test(shot.scene_en)) {
    parts.push("No children, babies or minors appear anywhere in the image: show only the setting, objects, adults or the professional's hands.");
  }
  // Screens and paper came out with garbled pseudo-text; keep any such surface unreadable.
  if (/\b(screen|laptop|monitor|tablet|phone|paper|document|page|notebook|journal|menu|sign|poster|book|chart|form|whiteboard|board|flipchart|sticky|label|jar|report|plan|audit|slide|presentation|spreadsheet|invoice|contract|resume|letter)s?\b/i.test(shot.scene_en)) {
    parts.push("Any screen, page or paper in the image shows only soft, blurred, unreadable shapes: no words or letters.");
  }
  parts.push(RULES);
  return parts.join("\n");
}

// ── Image API ────────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(public status: number, msg: string) { super(`HTTP ${status}: ${msg}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const waits = [15000, 30000, 60000, 90000, 120000];
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || i >= waits.length) throw e;
      await sleep(waits[i] * (1 + Math.random() * 0.3));
    }
  }
}

let active = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

// Rate lanes (measured 2026-09-29 from 429 bodies): each gpt-image rate GROUP allows only
// 5 requests ("input-images") per minute org-wide, generation or edit alike. 2.5-flare, 2.5-
// sunburst, 2 and 1.5 share the "gpt-image" group; 1-mini and 1 are outside it. So pacing is per
// GROUP, the headshot + cover use the portrait model, and work shots are spread (deterministic per
// shot) over models in different groups, including the portrait group's spare capacity. A 429
// pushes back only that group's lane.
const PER_MIN = Number(opt("--per-min") ?? 4.5);
// Work-shot edits run on the work lanes, so the face cap is off by default (a capped shot whose
// scene still shows the talent came out as a stranger).
const MAX_WORKING_FACES = Number(opt("--max-working-faces") ?? 99);
const DEMO_CONCURRENCY = Number(opt("--demo-concurrency") ?? 8);
const WORK_MODELS = (opt("--work-models") ?? `gpt-image-1-mini,gpt-image-1,${MODEL}`).split(",").map((m) => m.trim()).filter(Boolean);
/** USD per 1M tokens {textIn, imageIn, output} (OpenAI pricing page); others use the engine default. */
const MODEL_PRICES: Record<string, ImageTokenPrices> = {
  "gpt-image-1-mini": { textIn: 2, imageIn: 2.5, output: 8 },
  "gpt-image-1": { textIn: 5, imageIn: 10, output: 40 },
};
const pricesFor = (model: string): ImageTokenPrices => MODEL_PRICES[model] ?? DEFAULT_IMAGE_PRICES;
const workModelFor = (key: string) => WORK_MODELS[parseInt(sha(key).slice(0, 8), 16) % WORK_MODELS.length];
/** Every model a file may have been made with (earlier runs used other work lanes). */
const KNOWN_MODELS = [...new Set([MODEL, ...WORK_MODELS, "gpt-image-1-mini", "gpt-image-1", "gpt-image-2", "gpt-image-2.5-sunburst"])];
const rateGroup = (model: string) => (model === "gpt-image-1-mini" || model === "gpt-image-1" ? model : "gpt-image");
const nextAt = new Map<string, number>();
async function modelTurn(model: string) {
  const g = rateGroup(model);
  const gap = 60_000 / PER_MIN;
  const now = Date.now();
  const at = Math.max(now, nextAt.get(g) ?? 0);
  nextAt.set(g, at + gap);
  if (at > now) await sleep(at - now);
}
function backOff(model: string) {
  const g = rateGroup(model);
  nextAt.set(g, Math.max(nextAt.get(g) ?? 0, Date.now() + 30_000));
}

let spent = 0;
class CapReached extends Error {}
function estimate(model: string, size: OpenAiImageSize, quality: OpenAiImageQuality, withRef: boolean): number {
  // Output tokens measured 2026-09-29: flare 1024² low ≈ 196; mini 1024² low 272 / medium 1056.
  const area = size === "1024x1024" ? 1 : 1.5;
  const q = quality === "low" ? 1 : quality === "medium" ? (model === MODEL ? 2.2 : 3.9) : 6;
  const out = (model.startsWith("gpt-image-2") ? 196 : 272) * area * q;
  const refIn = withRef ? 1024 : 0;
  return imageCostFromUsage({ input_tokens: 80 + refIn, output_tokens: out, input_tokens_details: { text_tokens: 80, image_tokens: refIn } }, pricesFor(model));
}

async function generate(model: string, prompt: string, size: OpenAiImageSize, quality: OpenAiImageQuality, ref: Buffer | null): Promise<{ bytes: Buffer; usage: ImageUsage | null }> {
  const est = estimate(model, size, quality, !!ref);
  if (spent + est > CAP) throw new CapReached(`spend cap $${CAP} reached ($${spent.toFixed(3)} spent)`);
  // Calls wait for their model's turn OUTSIDE the concurrency pool, so other lanes keep flowing.
  return withRetry(async () => {
    await modelTurn(model);
    return slot(async () => {
      const body = { ...buildOpenAiImageRequestBody({ prompt, model, size, quality }), output_format: "jpeg", output_compression: 88 };
      let res: Response;
      if (ref) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(body)) fd.append(k, String(v));
        fd.append("image[]", new Blob([new Uint8Array(ref)], { type: "image/jpeg" }), "reference.jpg");
        res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
      } else {
        res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        if (res.status === 429) backOff(model);
        throw new HttpError(res.status, (await res.text()).slice(0, 300));
      }
      const json = (await res.json()) as { data?: { b64_json?: string }[]; usage?: ImageUsage };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new HttpError(502, "no image in response");
      spent += imageCostFromUsage(json.usage, pricesFor(model));
      return { bytes: Buffer.from(b64, "base64"), usage: json.usage ?? null };
    });
  });
}

// ── Pack + status files ──────────────────────────────────────────────────────
type PackPhoto = { file: string; variant: Variant; alt: string; alt_i18n: Record<string, string>; tag: string; source: string; photographer: string; album?: string; service_index?: number; slot: string };
export type ImageMeta = {
  key: string; code: string; demo_id: string; slot: string; variant: Variant; service: number | null; hint: string; size: OpenAiImageSize;
  quality: OpenAiImageQuality; model: string; prompt: string; alt_es: string; alt_en: string; taxonomy_slug: string; names: string[];
  cost_usd: number | null; generated_at: string;
};
type DemoResult = { demo_id: string; code: string; profile_id: string; theme: string; images: number; generated_this_run: number; cost_usd: number; errors: string[]; files: string[]; updated_at: string };

const log = (msg: string) => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  if (WRITE) fs.appendFileSync(LOG, line + "\n");
};
function mergeJson<T>(file: string, key: string, value: T) {
  const cur = fs.existsSync(file) ? readJson<Record<string, T>>(file) : {};
  cur[key] = value;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cur, null, 2));
  fs.renameSync(tmp, file);
}

// ── Per demo ─────────────────────────────────────────────────────────────────
async function runDemo(demoId: string, status: StatusRow): Promise<DemoResult> {
  const d = demos.get(demoId)!;
  const f = fields.get(demoId)!;
  const theme = themeOf.get(demoId) ?? "Common";
  const code = status.code;
  const planned = await planFor(d, f, theme, code);
  // The talent is in a shot when the planner says so OR the scene names them doing something that
  // is not hands-only; without the reference such a shot would show a different person.
  const slotList = slotsFor(d, f, theme);
  const named = new RegExp(`\\b(${[d.first_name, ...d.display_name.split(/\s+/)].filter((n) => n.length > 2).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const plan: Plan = {
    ...planned,
    shots: planned.shots.map((sh, i) => {
      const slot = slotList[i];
      const person = slot?.person;
      // No-client-face themes: a work shot built around another person (a patient's open mouth, a
      // child at a table) keeps showing them whatever the prompt says, so the scene itself becomes
      // an objects-and-space shot of the same brief, with alt text to match.
      if (NO_CLIENT_FACES.has(theme) && slot && slot.variant === "gallery" && OTHER_PERSON.test(sh.scene_en)) {
        const svc = slot.service != null ? d.services[slot.service] : undefined;
        const subjectEn = svc?.name_en ?? "the work";
        const subjectEs = svc?.name_es ?? slot.hint.split(/[.(]/)[0].trim();
        return {
          ...sh,
          shows_person: false,
          scene_en: `Objects-and-space photo for ${svc ? `the service "${subjectEn}" (${svc.description_en ?? ""})` : `"${slot.hint}"`} by a ${d.taxonomy_slug.replace(/-/g, " ")} in ${d.city}: the tools, materials, the room or the finished result, beautifully arranged in natural light. At most the professional's hands; no other person.`,
          alt_en: `${subjectEn}: tools and workspace`,
          alt_es: `${subjectEs}: herramientas y espacio de trabajo`,
        };
      }
      // Same for the cover: the talent stays (it is their banner) but works alone.
      if (NO_CLIENT_FACES.has(theme) && slot?.variant === "hero" && OTHER_PERSON.test(sh.scene_en)) {
        return {
          ...sh,
          scene_en: `Wide cover photo of ${d.first_name} alone at work in their real setting in ${d.city} (${slot.hint}): their tools, the space, natural light. Nobody else is in the frame, no other person or figure even in the distance.`,
        };
      }
      if (person !== "optional" || sh.shows_person) return sh;
      const inScene = named.test(sh.scene_en) && !/\b(hands?|from behind|back view|out of frame|only their)\b/i.test(sh.scene_en);
      return inScene ? { ...sh, shows_person: true } : sh;
    }),
  };
  const slots = slotsFor(d, f, theme);
  const dir = path.join(OUT, code);
  fs.mkdirSync(dir, { recursive: true });
  const locales = status.supported_locales ?? siteLang.get(demoId)?.supported_locales ?? [d.locale];
  const main = status.default_locale ?? siteLang.get(demoId)?.default_locale ?? d.locale;
  const result: DemoResult = { demo_id: demoId, code, profile_id: status.profile_id, theme, images: 0, generated_this_run: 0, cost_usd: 0, errors: [], files: [], updated_at: "" };
  let demoCost = 0;
  const photos: PackPhoto[] = [];

  const produce = async (s: Slot, shot: PlannedShot, ref: Buffer | null): Promise<string | null> => {
    const useRef = shot.shows_person ? ref : null;
    // Headshot + cover on the portrait model; every other shot on the work model (medium when the
    // talent's face must match the reference, low otherwise).
    const model = s.variant === "gallery" ? workModelFor(`${code}/${s.slot}`) : MODEL;
    const qualityFor = (m: string): OpenAiImageQuality => (s.variant !== "gallery" ? Q_PORTRAIT : m === MODEL ? Q_WORK : useRef ? "medium" : Q_WORK);
    const quality = qualityFor(model);
    const prompt = promptFor(plan, shot, theme, !!useRef, s.person);
    const hashFor = (m: string) => sha([m, qualityFor(m), s.size, prompt, useRef ? sha(useRef) : ""].join("|")).slice(0, 12);
    // A file made earlier by ANY model for the same prompt + reference is kept (no regeneration).
    const existing = KNOWN_MODELS.find((m) => fs.existsSync(path.join(dir, `${s.slot}-${hashFor(m)}.jpg`)));
    const usedModel = existing ?? model;
    const hash = hashFor(usedModel);
    const file = path.join(dir, `${s.slot}-${hash}.jpg`);
    let costUsd: number | null = null;
    if (!fs.existsSync(file)) {
      for (const old of fs.readdirSync(dir).filter((n) => n.startsWith(`${s.slot}-`) && (n.endsWith(".jpg") || n.endsWith(".jpg.json")))) {
        fs.renameSync(path.join(dir, old), path.join(dir, `_old-${old}`));
      }
      let out: { bytes: Buffer; usage: ImageUsage | null };
      try {
        out = await generate(model, prompt, s.size, quality, useRef);
      } catch (e) {
        // A safety-system refusal would leave the set incomplete forever (only full sets are
        // loaded), so fall back to a neutral, people-free detail of the same trade.
        if (!(e instanceof HttpError && e.status === 400 && /safety system/i.test(e.message))) throw e;
        const safe = [STYLE, `Scene: a tidy, well-lit detail of the tools, materials and workspace of a ${d.taxonomy_slug.replace(/-/g, " ")} in ${d.city}. No people.`, RULES].join("\n");
        log(`${code} ${s.slot}: safety refusal, using a neutral detail shot`);
        out = await generate(model, safe, s.size, "low", null);
      }
      const { bytes, usage } = out;
      fs.writeFileSync(file, bytes);
      result.generated_this_run++;
      costUsd = imageCostFromUsage(usage, pricesFor(model));
      demoCost += costUsd;
    }
    // Sidecar for the platform-stock step (ai-photos-stock.mts): prompt, size, alts, cost.
    if (costUsd !== null || !fs.existsSync(`${file}.json`)) {
      const meta: ImageMeta = {
        key: `${code}/${s.slot}-${hash}`, code, demo_id: demoId, slot: s.slot, variant: s.variant, service: s.service ?? null,
        hint: s.hint, size: s.size, quality, model: usedModel, prompt, alt_es: shot.alt_es, alt_en: shot.alt_en,
        taxonomy_slug: d.taxonomy_slug, names: [d.display_name, d.first_name, ...d.display_name.split(/\s+/)].filter((n) => n.length > 2),
        cost_usd: costUsd, generated_at: new Date(fs.statSync(file).mtimeMs).toISOString(),
      };
      fs.writeFileSync(`${file}.json`, JSON.stringify(meta, null, 2));
    }
    const alt_i18n: Record<string, string> = {};
    for (const l of locales) alt_i18n[l] = l === "es" ? shot.alt_es : shot.alt_en;
    photos.push({
      file, variant: s.variant, alt: main === "es" ? shot.alt_es : shot.alt_en, alt_i18n, tag: s.tag, slot: s.slot,
      source: `ai-generated:${usedModel}:${code}/${s.slot}-${hash}`, photographer: PHOTOGRAPHER,
      ...(s.album ? { album: s.album } : {}), ...(s.service != null ? { service_index: s.service } : {}),
    });
    return file;
  };

  try {
    const cardSlot = slots[0];
    const cardFile = await produce(cardSlot, plan.shots[0], null);
    const ref = cardFile ? fs.readFileSync(cardFile) : null;
    const rest = await Promise.allSettled(slots.slice(1).map((s, i) => produce(s, plan.shots[i + 1], ref)));
    for (const r of rest) if (r.status === "rejected") {
      if (r.reason instanceof CapReached) throw r.reason;
      result.errors.push(String((r.reason as Error).message ?? r.reason).slice(0, 200));
    }
  } catch (e) {
    result.errors.push(String((e as Error).message).slice(0, 200));
    if (e instanceof CapReached) {
      finish();
      throw e;
    }
  }
  finish();
  return result;

  function finish() {
    // Pack order = sort order. load-photos links gallery photos to offerings round-robin by
    // sort order, so the per-service shots (s1..s4, in offering order) go first.
    const rank = (s: Slot) => (s.variant === "card" ? 0 : s.variant === "hero" ? 1 : s.service != null ? 2 : 3);
    const ordered = [...slots].sort((a, b) => rank(a) - rank(b));
    const order = new Map(ordered.map((s, i) => [s.slot, i]));
    photos.sort((a, b) => (order.get(a.slot) ?? 0) - (order.get(b.slot) ?? 0));
    result.images = photos.length;
    result.files = photos.map((p) => p.file);
    result.cost_usd = Math.round(demoCost * 1e4) / 1e4;
    result.updated_at = new Date().toISOString();
    const galleryCount = photos.filter((p) => p.variant === "gallery").length;
    // Only a FULL set enters the pack: the loader skips a variant that is already loaded, so a
    // partial set would stick. Retries fill the gaps first.
    const complete = photos.length === slots.length && result.errors.length === 0 && galleryCount >= 4;
    if (complete) mergeJson(PACK_OUT, code, { photos: photos.map(({ slot: _slot, ...p }) => p) });
    mergeJson(STATUS_OUT, demoId, result);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
function selectIds(status: Record<string, StatusRow>): string[] {
  const byCode = new Map(Object.values(status).map((s) => [s.code, s.demo_id]));
  if (ONLY.size) return themeOrder.filter((id) => ONLY.has(id) || [...ONLY].some((c) => byCode.get(c) === id));
  return themeOrder.filter((id) => ALL || status[id]);
}

async function dryRun() {
  const status = readStatus();
  const ids = selectIds(status);
  let images = 0, cost = 0, refCalls = 0;
  const failed: string[] = [];
  const perTheme: Record<string, { demos: number; images: number }> = {};
  let shown = 0;
  await Promise.all(
    ids.map((id) =>
      slot(async () => {
        const d = demos.get(id), f = fields.get(id);
        if (!d || !f) return;
        const theme = themeOf.get(id) ?? "Common";
        const code = status[id]?.code ?? `UNSEEDED-${id}`;
        if (status[id]) assertDemo(status[id]);
        let plan: Plan;
        try {
          plan = await planFor(d, f, theme, code);
        } catch (e) {
          failed.push(`${code}: ${(e as Error).message}`);
          return;
        }
        const slots = slotsFor(d, f, theme);
        slots.forEach((s, i) => {
          const withRef = i > 0 && plan.shots[i].shows_person;
          if (withRef) refCalls++;
          cost += s.variant === "gallery" ? estimate(workModelFor(`${code}/${s.slot}`), s.size, withRef ? "medium" : Q_WORK, withRef) : estimate(MODEL, s.size, Q_PORTRAIT, false);
        });
        images += slots.length;
        perTheme[theme] = { demos: (perTheme[theme]?.demos ?? 0) + 1, images: (perTheme[theme]?.images ?? 0) + slots.length };
        if (shown < SAMPLES) {
          shown++;
          console.log(`\n=== ${code} ${d.display_name} · ${d.taxonomy_slug} · ${theme} · ${slots.length} images ===`);
          for (const i of [0, 1, 2, slots.findIndex((s) => s.service != null), slots.length - 1]) {
            if (i < 0) continue;
            console.log(`--- ${slots[i].slot} (${slots[i].variant}, ${slots[i].size})\n${promptFor(plan, plan.shots[i], theme, i > 0 && plan.shots[i].shows_person, slots[i].person)}\nalt: ${plan.shots[i].alt_es} | ${plan.shots[i].alt_en}`);
          }
        }
      }),
    ),
  );
  console.log("\nper theme:", JSON.stringify(perTheme));
  console.log(`demos ${ids.length} · images ${images} (reference edits ${refCalls}) · model ${MODEL} · quality portrait=${Q_PORTRAIT} work=${Q_WORK}`);
  console.log(`estimated cost $${cost.toFixed(2)} (≈ $${(cost / Math.max(1, ids.length)).toFixed(3)}/demo, $${(cost / Math.max(1, images)).toFixed(4)}/image)`);
}

/** Per-theme progress, kept under the "_progress" key of photos-status.json. */
function writeProgress(status: Record<string, StatusRow>) {
  const all = fs.existsSync(STATUS_OUT) ? readJson<Record<string, DemoResult>>(STATUS_OUT) : {};
  const themes: Record<string, { demos: number; seeded: number; generated: number; with_errors: number; cost_usd: number }> = {};
  for (const t of guide.themes) {
    const rows = t.demos.map((id) => all[id]).filter((r): r is DemoResult => !!r?.code);
    themes[t.name] = {
      demos: t.demos.length,
      seeded: t.demos.filter((id) => status[id]).length,
      generated: rows.filter((r) => r.images > 0 && r.errors.length === 0).length,
      with_errors: rows.filter((r) => r.errors.length > 0).length,
      cost_usd: Math.round(rows.reduce((s, r) => s + r.cost_usd, 0) * 100) / 100,
    };
  }
  mergeJson(STATUS_OUT, "_progress", { updated_at: new Date().toISOString(), run_spent_usd: Math.round(spent * 100) / 100, themes });
}

async function realRun() {
  fs.mkdirSync(OUT, { recursive: true });
  const deadline = Date.now() + WATCH_MIN * 60_000;
  const done = new Set<string>();
  const attempts = new Map<string, number>();
  for (;;) {
    const status = readStatus();
    const todo = selectIds(status).filter((id) => !done.has(id) && status[id]);
    for (const id of todo) {
      try {
        assertDemo(status[id]);
      } catch (e) {
        log(`${id} ${(e as Error).message}`);
        done.add(id);
        continue;
      }
    }
    const runnable = todo.filter((id) => !done.has(id));
    // A pool of demos in flight (theme order) keeps the 4-request generation lane full while
    // reference edits queue on their own 5/min lane.
    let stop = false;
    let next = 0;
    const worker = async () => {
      while (!stop && next < runnable.length) {
        const id = runnable[next++];
        let ok = false;
        attempts.set(id, (attempts.get(id) ?? 0) + 1);
        try {
          const r = await runDemo(id, status[id]);
          ok = r.errors.length === 0;
          log(`${r.code} ${id} ${r.theme}: ${r.images} images (${r.generated_this_run} new) $${r.cost_usd} errors=${r.errors.length} · run total $${spent.toFixed(3)}`);
        } catch (e) {
          log(`${id} STOPPED: ${(e as Error).message}`);
          if (e instanceof CapReached) stop = true;
        }
        // A demo with errors (usually 429s) is retried on the next poll, up to 3 attempts.
        if (ok || (attempts.get(id) ?? 0) >= 3) done.add(id);
        writeProgress(status);
      }
    };
    await Promise.all(Array.from({ length: DEMO_CONCURRENCY }, worker));
    if (stop || Date.now() >= deadline || (ONLY.size && runnable.length === 0)) break;
    if (Object.keys(status).length >= demos.size && runnable.length === 0) break;
    log(`waiting ${POLL_MIN} min for more seeded demos (${Object.keys(status).length}/${demos.size} in status.json) · run total $${spent.toFixed(3)}`);
    await sleep(POLL_MIN * 60_000);
  }
  log(`run finished · spent $${spent.toFixed(3)}`);
}

if (DRY) await dryRun();
else await realRun();
