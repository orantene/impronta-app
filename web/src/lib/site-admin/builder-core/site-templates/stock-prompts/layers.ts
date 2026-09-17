/**
 * stock-prompts/layers.ts — the five prompt layers of the Visual Asset Engine
 * (docs/plans/templates/03-visual-asset-engine.md §3):
 *
 *   global rules → family art direction → business-type context
 *     → slot composition → visual direction (+ per-site facts) = prompt
 *
 * Every layer carries a version; `resolveStockPrompt` returns the prompt AND
 * the versions so an asset records exactly what produced it. Adding a business
 * type is one line in `TYPE_CONTEXT`; everything else is inherited.
 */

import type { BusinessFamilyId } from "@/lib/words/business-types";
import type { ImageRole, ImageSlotKey } from "../types";

// ── Layer 1: global photographic rules ──────────────────────────────────────

export const GLOBAL_RULES_VERSION = "global@v1";

export const GLOBAL_RULES =
  "Realistic photograph, natural light, no HDR, not an illustration, not a render. " +
  "No logos, no brand marks, no readable text or signage, no watermarks, no recognisable face of a real person, no minors. " +
  "Culturally right for a small business in Mexico's Riviera Maya; ordinary, believable, lived-in, never a luxury-resort advertisement.";

// ── Layer 2: family art direction ───────────────────────────────────────────

export const FAMILY_DIRECTION_VERSION = "family@v1";

export const FAMILY_DIRECTION: Readonly<Record<BusinessFamilyId, string>> = {
  dining: "Warm tungsten and daylight mix, appetising, honest textures, real plates and worn wood; people only as hands or backs.",
  beauty: "Soft daylight, clean surfaces, warm neutrals with one accent colour from the products; calm premium mood; hands at work, no faces.",
  wellness: "Airy and quiet, natural materials, plants, soft morning light, unhurried; a person only from behind or cropped.",
  fitness: "Bright and energetic, clean lines, real sweat and movement, saturated but true colour; athletes mid-motion, backs or profiles, no faces.",
  events: "Evening or stage light, one warm source against darkness, atmosphere over detail; crowds as silhouettes only.",
  agency: "Neutral daylight studio, white and grey, one strong object or gesture, editorial restraint; no recognisable faces.",
  professional: "Daylight, orderly, tools of the trade, honest working detail; a person only as hands or from behind.",
  education: "Daylight classroom or workshop, materials laid out, hands learning; nobody's face.",
  hospitality: "Architectural daylight, wood and white, generous empty space, a room ready for people; no people.",
  craft: "Close working light, materials and hands, texture over scene; no faces.",
  tours: "Outdoor daylight, water, jungle or limestone, wide open air; people small or from behind.",
  custom: "Neutral daylight, simple honest scene of a small business at work; no faces.",
};

// ── Layer 3: business-type context (one line per type) ──────────────────────

export const TYPE_CONTEXT_VERSION = "type@v1";

/** The place, the work, the objects. Cuisine, clientele and setting are NOT here: those come from the brief (§3c). */
export const TYPE_CONTEXT: Readonly<Record<string, string>> = {
  // dining
  restaurant: "a small independent restaurant: an open kitchen pass, plated food, a set table",
  bar: "a neighbourhood bar: a bar top, bottles on a back shelf, glasses catching light",
  "beach-club": "a beach club: loungers, sand, a palapa shade, drinks on a low table",
  "sushi-restaurant": "a sushi counter: fresh fish, a knife, rice, a wooden board",
  "home-takeaway": "a home kitchen packing takeaway orders: paper boxes, foil, a stove",
  "bakery-cafe": "a bakery cafe: loaves and pastries on a counter, flour, a coffee cup",
  "brewery-taproom": "a taproom: steel tanks, tap handles, a glass of beer, wood",
  cafe: "a cafe: an espresso machine, a pour, a cup on a small table",
  "catering-company": "catering prep: trays of finished dishes, a service table being set",
  "cocktail-lounge": "a cocktail lounge: a bartender's hands stirring, a coupe glass, low light",
  "dessert-shop": "a dessert shop: cakes and pastries in a case, a plated slice",
  "food-truck": "a food truck: the serving window, a griddle, food handed over",
  "ice-cream-shop": "an ice cream shop: tubs behind glass, a scoop, a cone",
  pizzeria: "a pizzeria: a wood oven, dough being stretched, a pizza on a peel",
  "pool-club": "a pool club: a clear pool, loungers, a drink on a ledge",
  "rooftop-lounge": "a rooftop lounge: low seating, a skyline or sea at dusk, a drink",
  "wine-tasting-room": "a wine tasting room: glasses in a row, a bottle being poured, oak",
  // beauty
  "nail-salon": "a nail salon: manicure stations, a polish wall, a technician's hands finishing nails",
  "hair-salon": "a hair salon: a styling chair, a mirror, a stylist's hands cutting or colouring",
  "barber-shop": "a barber shop: a barber chair, clippers, a hot towel, a fade in progress",
  "bridal-beauty-team": "bridal beauty: brushes and pins laid out, a veil, hands pinning hair",
  "brow-studio": "a brow studio: tweezers, a brow pencil, a client's brow being mapped, eyes cropped",
  "eyelash-studio": "a lash studio: lash trays, tweezers, a client's closed eye during application",
  "makeup-artist": "a makeup artist's kit: brushes, palettes, a hand applying makeup, face cropped",
  "pet-grooming": "a pet grooming table: a dog being brushed or dried, clippers, towels",
  "piercing-studio": "a piercing studio: sterile tools, jewellery in a case, gloved hands",
  "waxing-studio": "a waxing studio: a treatment bed, wax warmer, folded towels",
  // wellness
  spa: "a day spa: a treatment room, folded towels, oils, a massage table",
  "massage-therapist": "a massage room: hands on a shoulder, a towel, soft light",
  "tattoo-studio": "a tattoo studio: a machine, gloved hands, a fresh fine-line tattoo on a forearm",
  "breathwork-facilitator": "a breathwork space: mats in a circle, a window, a bell",
  clinic: "a small clinic: a clean consulting room, a desk, a plant, no medical drama",
  "couples-treatment-spa": "a couples treatment room: two massage tables side by side, candles",
  "float-therapy-centre": "a float centre: a float pod open, blue light, towels",
  "meditation-practitioner": "a meditation room: cushions, a low table, incense, morning light",
  "mobile-massage-service": "a portable massage table set up in a living room or terrace",
  "sauna-and-steam-bath": "a sauna: cedar benches, a ladle and bucket, steam",
  "sound-bath-studio": "a sound bath: singing bowls, gongs, mats, soft light",
  "wellness-retreat": "a retreat: a jungle deck, mats, breakfast bowls, a hammock",
  // fitness
  "yoga-studio": "a yoga studio: rolled mats, blocks, a wooden floor, a wide window",
  "boxing-studio": "a boxing gym: heavy bags, wraps on hands, a ring rope",
  "dance-studio": "a dance studio: a mirror wall, a barre, dancers in motion, backs to camera",
  gym: "a gym: racks, plates, a bench, chalk on hands",
  "martial-arts-school": "a martial arts dojo: mats, belts, a bow, gis in motion",
  "padel-club": "a padel court: blue court, glass walls, two players mid-rally from behind",
  "personal-trainer": "a personal training session: a kettlebell, a coach's hand correcting form",
  "pilates-studio": "a pilates studio: reformers in a row, light wood, a stretch",
  "sports-court-rental": "a sports court: fresh lines, a net, a ball, empty and ready",
  "swimming-school": "a swimming pool: lane ropes, a kickboard, water surface",
  "tennis-coaching-business": "a tennis court: a basket of balls, a racket, a serve from behind",
  // events
  "art-gallery": "an art gallery: white walls, one hung work seen from an angle, a bench",
  "attraction-day-pass-operator": "a day attraction: an entrance path, a pool or cenote, wristbands",
  "event-host": "an event host: a microphone on a stand, a lit stage edge, a crowd as silhouettes",
  "event-venue": "an event venue: long tables dressed, string lights, an empty dance floor",
  "independent-dj": "a DJ booth: decks, hands on a fader, coloured light",
  "independent-musician": "a musician: a guitar on a stool, a small stage, warm light",
  "karaoke-venue": "a karaoke room: a screen glow, two microphones, a sofa",
  "live-music-venue": "a live music stage: instruments set, stage lights on, empty before doors",
  nightclub: "a nightclub: a lit bar, haze, a DJ booth, silhouettes",
  theatre: "a theatre: red seats, a lit empty stage, a curtain",
  // agency
  "branding-agency": "a branding studio: a moodboard on a wall, swatches, a sketchbook",
  "casting-agency": "a casting studio: a backdrop, a chair, a camera on a tripod",
  "entertainment-agency": "an entertainment agency: a stage plan, a rack of costumes, a lit backdrop",
  "event-staffing-agency": "event staff at work: hands setting glasses, uniforms from behind",
  "influencer-agency": "a content studio: a ring light, a phone on a tripod, a styled corner",
  "modelling-agency": "a model agency: a white cyclorama, a clothing rail, a light stand",
  "music-booking-agency": "a booking agency: a small stage being set, a guitar case, a rider list blurred",
  "photography-studio": "a photography studio: a backdrop roll, softboxes, a camera",
  "promotional-staffing-agency": "a promotion stand: branded-free counter, samples, a hand offering one",
  "provisional-service": "a small service business at work: a desk, a laptop, a notebook",
  "social-media-agency": "a social media desk: a phone showing a blank grid, a laptop, a coffee",
  "talent-agency": "a talent agency: a casting wall of blank cards, a camera, a chair",
  "web-design-agency": "a design studio: a large monitor with abstract shapes, a sketchbook, a plant",
  // professional
  "business-consultant": "a consultant's table: a notebook, a whiteboard with blank shapes, coffee",
  "car-detailing": "car detailing: a foam wash, a polisher on a panel, water beads",
  "career-coach": "a coaching session: two chairs at a table, a notebook, a window",
  "commercial-cleaning-company": "commercial cleaning: a cart, gloved hands, a shining floor",
  "dog-trainer": "dog training: a lead, a treat in a hand, a dog sitting on grass",
  "dog-walker": "a dog walk: leads in one hand, dogs from behind, a shaded street",
  "dry-cleaning-service": "a dry cleaner: pressed shirts on hangers, plastic covers, steam",
  "event-planner": "an event planner: a table plan, a clipboard, a sample centrepiece",
  handyman: "a handyman: a tool belt, a drill, a wall being fixed",
  "home-organisation-service": "home organisation: labelled boxes, a tidy shelf, folded linen",
  "house-cleaner": "house cleaning: a bucket and cloth, a sunny clean kitchen, gloved hands",
  "immigration-practice": "an immigration office: a desk, folders, a passport-shaped blank booklet, a pen",
  "interior-designer": "an interior designer: fabric swatches, a floor plan, a tape measure",
  interpreter: "an interpreter: a headset, a notepad, a conference table edge",
  "laundry-service": "a laundry: folded towels stacked, machines in a row, a basket",
  "life-coach": "a coaching room: two armchairs, a plant, a notebook, soft daylight",
  "personal-stylist": "a personal stylist: a rail of clothes, a hand choosing a hanger",
  "pet-sitter": "pet sitting: a cat on a sofa, a food bowl, a lead by the door",
  "private-chef": "a private chef: a home kitchen, a plated course, a knife roll",
  translator: "a translator: a desk with two open documents, a laptop, a dictionary",
  "virtual-assistant-business": "a virtual assistant: a laptop, a headset, a calendar, a tidy desk",
  "voice-over": "a voice-over booth: a microphone with a pop filter, headphones, foam panels",
  "wedding-planner": "a wedding planner: a seating chart, ribbon samples, a flower stem",
  // education
  "art-workshop-studio": "an art workshop: easels, paint tubes, hands with a brush",
  "beauty-academy": "a beauty academy: practice heads, a tray of tools, a student's hands",
  "cooking-school": "a cooking school: a long steel bench, ingredients in bowls, hands chopping",
  "corporate-training": "a training room: a flipchart with blank shapes, notebooks, a table of people from behind",
  "diving-school": "a dive school: tanks in a row, a mask and fins, a cenote or boat",
  "language-school": "a language classroom: a whiteboard with blank shapes, small tables, notebooks",
  "language-tutor": "a language lesson: two notebooks, a pen, a cup of coffee, a window",
  "music-school": "a music school: a piano keyboard, sheet music, a small practice room",
  "photography-school": "a photography class: cameras on a table, a lit backdrop, a student's hands",
  "pottery-studio": "a pottery studio: a wheel, clay hands, shelves of unglazed pots",
  "singing-coach": "a singing lesson: a microphone, a piano, a sheet on a stand",
  "yoga-instructor": "a private yoga session: one mat on a terrace, a block, morning light",
  // hospitality
  "conference-centre": "a conference room: a long table, chairs, a screen off, daylight",
  coworking: "a coworking space: a bright open desk area, plants, a glass meeting box, empty",
  "meeting-room-rental": "a meeting room: a table for eight, a whiteboard, a window",
  "podcast-studio": "a podcast studio: two microphones, headphones, a small table, acoustic panels",
  "pop-up-event-space": "a pop-up space: white walls, a rail, a folding table, an open door",
  "recording-studio": "a recording studio: a mixing desk, a monitor pair, a vocal booth window",
  "rehearsal-room-rental": "a rehearsal room: a drum kit, amps, cables, foam on walls",
  "wedding-venue": "a wedding venue: a ceremony aisle set with chairs, an arch, a garden or beach",
  // craft
  "content-production-studio": "a content studio: a camera on a slider, a lit set corner, a monitor",
  "custom-jewelry": "a jeweller's bench: a ring in a clamp, a loupe, tools, gold filings",
  "escape-room": "an escape room: a themed door, a padlock, a clue on a table, dim light",
  "floral-studio": "a floral studio: stems on a bench, scissors, a finished arrangement",
  "graphic-design-studio": "a graphic design studio: printed proofs, a colour fan, a tablet",
  "portrait-photographer": "a portrait setup: a stool, a softbox, a backdrop, camera in hand",
  "videography-business": "a videographer: a gimbal, a camera, a lens case, an outdoor location",
  // tours
  "boat-excursion-operator": "a boat excursion: a boat deck, turquoise water, a rope, a horizon",
  "food-tour-operator": "a food tour: a street food stand, tacos on a plate, a small group from behind",
  "horse-riding-experience": "horse riding: a horse's mane and saddle, a beach or jungle trail",
  "private-tours": "a private tour: a cenote or ruin path, a guide's hand pointing, no faces",
  "snorkelling-guide": "snorkelling: masks and fins on a boat edge, clear shallow water",
  "surf-school": "a surf school: boards in a rack, a wax bar, a beach at morning",
  "tour-operator": "a tour van door open, a map, a cenote or jungle road",
  // custom
  custom: "a small local business at work: a counter, a hand at work, daylight",
};

// ── Layer 4: slot composition ───────────────────────────────────────────────

export const SLOT_COMPOSITION_VERSION = "slot@v1";

export const SLOT_COMPOSITION: Readonly<Record<ImageRole, string>> = {
  hero: "Website hero, 3:2 landscape: keep the LEFT third as calm negative space for a headline; the subject sits in the right two thirds; medium distance.",
  wide: "Wide band, 3:1 feel inside a 3:2 frame: a horizontal scene with the subject low and centred, quiet top and bottom.",
  portrait: "Portrait crop, 3:4: one subject, shallow depth, room above.",
  gallery: "Square, 1:1: one clear subject filling the frame, simple background.",
  team: "4:3: two or three people at work from behind or cropped at the shoulders, no faces, the room around them.",
  detail: "Square close-up, 1:1: texture and material, one object, shallow depth.",
};

/** Output size per role for the images API (multiples of 16, gpt-image-2 family). */
export const SLOT_SIZE: Readonly<Record<ImageRole, "1536x1024" | "1024x1024" | "1024x1536">> = {
  hero: "1536x1024",
  wide: "1536x1024",
  portrait: "1024x1536",
  gallery: "1024x1024",
  team: "1536x1024",
  detail: "1024x1024",
};

// ── Layer 5: visual directions (five per family, setting fixed explicitly) ──

export const DIRECTION_VERSION = "direction@v2";

export const DIRECTION_IDS = ["editorial", "service", "result", "lifestyle", "minimal"] as const;
export type DirectionId = (typeof DIRECTION_IDS)[number];

/**
 * The comparison run (evidence/cost-measurement/hero-quality) showed the model
 * collapses to ONE Tulum beach room when the setting is left implicit, so every
 * direction names its setting, framing and time of day.
 */
export const DIRECTION_TEXT: Readonly<Record<DirectionId, string>> = {
  editorial: "Editorial: the styled space itself, nobody working; interior, late afternoon side light, urban street glimpsed through a door, not a beach.",
  service: "Service: the work being done, hands and tools mid-action, close; interior, neutral midday light, plain wall behind.",
  result: "Result: the finished outcome close up, the product of the work; shallow depth, no room visible, warm evening light.",
  lifestyle: "Lifestyle: a client's moment, seen from behind or cropped; a terrace or open door, morning light, greenery, no sea.",
  minimal: "Minimal: tools and materials arranged as a still composition on one surface; overhead or three-quarter view, flat soft light, no room.",
};

// ── Resolver ────────────────────────────────────────────────────────────────

export interface StockPromptInput {
  family: BusinessFamilyId;
  /** business-types.ts id; unknown ids fall back to the family (family seed rows pass null). */
  typeId: string | null;
  slot: ImageSlotKey;
  direction: DirectionId;
  /** Stated brief facts (03 §3c). Absent = neutral. */
  facts?: StockPromptFacts;
}

/** Only what the owner actually stated. Never derived from the business name. */
export interface StockPromptFacts {
  cuisine?: string;
  /** Non-dining "what kind" (fine-line tattoo, vinyasa, balayage). */
  specialty?: string;
  clientele?: string;
  setting?: string;
  /** The owner's own phrases about their place, verbatim, max three. */
  words?: string[];
  visualDirection?: string;
}

export interface ResolvedStockPrompt {
  prompt: string;
  role: ImageRole;
  size: (typeof SLOT_SIZE)[ImageRole];
  layerVersions: { global: string; family: string; type: string; slot: string; direction: string };
  /** The facts that made it into the prompt, to be stored as `tags`. */
  tags: Record<string, string>;
}

const FACT_MAX = 60;
const clean = (v: string) => v.replace(/[\r\n"“”]+/g, " ").replace(/\s+/g, " ").trim().slice(0, FACT_MAX);

export function roleForSlot(slot: ImageSlotKey): ImageRole {
  return slot.startsWith("gallery") ? "gallery" : (slot as ImageRole);
}

export function resolveStockPrompt(input: StockPromptInput): ResolvedStockPrompt {
  const role = roleForSlot(input.slot);
  const typeLine = (input.typeId && TYPE_CONTEXT[input.typeId]) || TYPE_CONTEXT.custom;
  const tags: Record<string, string> = {};
  const factLines: string[] = [];
  const f = input.facts ?? {};
  if (f.cuisine && clean(f.cuisine)) {
    tags.cuisine = clean(f.cuisine);
    factLines.push(`The food is ${tags.cuisine}.`);
  }
  if (f.specialty && clean(f.specialty)) {
    tags.specialty = clean(f.specialty);
    factLines.push(`The specialty is ${tags.specialty}.`);
  }
  if (f.clientele && clean(f.clientele)) {
    tags.clientele = clean(f.clientele);
    factLines.push(`The clientele: ${tags.clientele}.`);
  }
  if (f.setting && clean(f.setting)) {
    tags.setting = clean(f.setting);
    factLines.push(`Setting: ${tags.setting}.`);
  }
  const words = (f.words ?? []).map(clean).filter(Boolean).slice(0, 3);
  if (words.length > 0) {
    tags.words = words.join(" | ");
    factLines.push(`In the owner's words: ${words.map((w) => `"${w}"`).join(", ")}.`);
  }
  if (f.visualDirection && clean(f.visualDirection)) {
    tags.visual_direction = clean(f.visualDirection);
    factLines.push(`Overall feel: ${tags.visual_direction}.`);
  }
  const prompt = [
    GLOBAL_RULES,
    `Art direction: ${FAMILY_DIRECTION[input.family]}`,
    `Subject: ${typeLine}.`,
    ...factLines,
    SLOT_COMPOSITION[role],
    DIRECTION_TEXT[input.direction],
  ].join(" ");
  return {
    prompt,
    role,
    size: SLOT_SIZE[role],
    layerVersions: {
      global: GLOBAL_RULES_VERSION,
      family: FAMILY_DIRECTION_VERSION,
      type: input.typeId && TYPE_CONTEXT[input.typeId] ? `${TYPE_CONTEXT_VERSION}:${input.typeId}` : `${TYPE_CONTEXT_VERSION}:custom`,
      slot: SLOT_COMPOSITION_VERSION,
      direction: DIRECTION_VERSION,
    },
    tags,
  };
}

/** Direction for the n-th alternative of a slot, so two assets of one slot never share a direction. */
export function directionForIndex(index: number): DirectionId {
  return DIRECTION_IDS[((index % DIRECTION_IDS.length) + DIRECTION_IDS.length) % DIRECTION_IDS.length];
}
