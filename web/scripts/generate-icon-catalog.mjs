/**
 * generate-icon-catalog.mjs — build the operator icon catalog from lucide.
 *
 * lucide-react ships each icon as a structured `__iconNode` array of
 * `[element, attrs]` pairs — the SAME shape `BuilderIconDefinition` already
 * uses. So the catalog is generated, not hand-transcribed: no copy errors, and
 * regenerating after a lucide bump is one command.
 *
 * Why not import lucide components directly? Three reasons, in order:
 *   1. The published page must not gain a React component dependency for a
 *      glyph — the renderer emits inline SVG in `currentColor` (CSP + theming).
 *   2. A dynamic `lucide[name]` lookup would defeat tree-shaking and pull the
 *      entire set into the bundle.
 *   3. Stored trees reference icons by NAME; the registry must stay a data
 *      table we control, not a re-export of someone else's changing surface.
 *
 * Run: node scripts/generate-icon-catalog.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LUCIDE = path.join(HERE, "..", "node_modules", "lucide-react", "dist", "esm", "icons");
const OUT_DIR = path.join(HERE, "..", "src", "lib", "site-admin", "builder-node");

/** name in our registry → lucide file slug. Curated, never "everything". */
const CATALOGS = {
  ui: {
    file: "icon-catalog-ui.ts",
    title: "Interface, arrows and communication glyphs.",
    icons: [
      ["menu", "menu", "Menu", "hamburger bars nav"],
      ["close", "x", "Close", "x dismiss cancel"],
      ["search", "search", "Search", "find magnify"],
      ["plus", "plus", "Plus", "add new"],
      ["minus", "minus", "Minus", "remove subtract"],
      ["settings", "settings", "Settings", "gear preferences"],
      ["info", "info", "Info", "about details"],
      ["help_circle", "circle-question-mark", "Help", "question support faq"],
      ["alert_circle", "circle-alert", "Alert", "warning error"],
      ["external_link", "external-link", "External link", "new tab outbound"],
      ["link", "link", "Link", "chain url"],
      ["globe", "globe", "Globe", "world language international"],
      ["eye", "eye", "Eye", "view visible preview"],
      ["lock", "lock", "Lock", "secure private"],
      ["shield", "shield", "Shield", "safe protection trust"],
      ["download", "download", "Download", "save export"],
      ["filter", "funnel", "Filter", "refine sort"],
      ["grid", "layout-grid", "Grid", "tiles layout"],
      ["list", "list", "List", "bullets items"],
      ["more_horizontal", "ellipsis", "More", "ellipsis overflow"],
      ["trash", "trash-2", "Delete", "bin remove"],
      ["edit", "pencil", "Edit", "pencil write"],
      ["chevron_down", "chevron-down", "Chevron down", "caret expand"],
      ["chevron_up", "chevron-up", "Chevron up", "caret collapse"],
      ["chevron_left", "chevron-left", "Chevron left", "caret back"],
      ["chevron_right", "chevron-right", "Chevron right", "caret forward"],
      ["arrow_left", "arrow-left", "Arrow left", "back previous"],
      ["arrow_up", "arrow-up", "Arrow up", "top"],
      ["arrow_down", "arrow-down", "Arrow down", "bottom"],
      ["arrow_up_right", "arrow-up-right", "Arrow up right", "diagonal outbound"],
      ["message_circle", "message-circle", "Message", "chat comment"],
      ["send", "send", "Send", "paper plane submit"],
      ["bell", "bell", "Bell", "notification alert"],
      ["share", "share-2", "Share", "distribute"],
      ["bookmark", "bookmark", "Bookmark", "save favourite"],
      ["thumbs_up", "thumbs-up", "Thumbs up", "like approve"],
      ["at_sign", "at-sign", "At sign", "email mention"],
      ["inbox", "inbox", "Inbox", "enquiry messages"],
      ["quote", "quote", "Quote", "testimonial"],
    ],
  },
  objects: {
    file: "icon-catalog-objects.ts",
    title: "Commerce, media, places, people and nature glyphs.",
    icons: [
      ["shopping_bag", "shopping-bag", "Shopping bag", "buy retail"],
      ["cart", "shopping-cart", "Cart", "basket checkout"],
      ["credit_card", "credit-card", "Credit card", "payment pay"],
      ["tag", "tag", "Tag", "label price"],
      ["gift", "gift", "Gift", "present offer"],
      ["truck", "truck", "Truck", "delivery shipping"],
      ["package", "package", "Package", "box parcel"],
      ["percent", "percent", "Percent", "discount sale"],
      ["wallet", "wallet", "Wallet", "money balance"],
      ["image", "image", "Image", "photo picture"],
      ["video", "video", "Video", "film clip"],
      ["music", "music", "Music", "song audio"],
      ["mic", "mic", "Microphone", "record voice host"],
      ["film", "film", "Film", "cinema reel"],
      ["headphones", "headphones", "Headphones", "audio listen dj"],
      ["book_open", "book-open", "Book", "read story"],
      ["palette", "palette", "Palette", "colour art design"],
      ["scissors", "scissors", "Scissors", "cut stylist"],
      ["clock", "clock", "Clock", "time hours schedule"],
      ["map", "map", "Map", "location area"],
      ["compass", "compass", "Compass", "explore discover"],
      ["building", "building-2", "Building", "office venue"],
      ["briefcase", "briefcase", "Briefcase", "work business"],
      ["coffee", "coffee", "Coffee", "cafe drink"],
      ["utensils", "utensils", "Dining", "restaurant food chef"],
      ["bed", "bed", "Bed", "hotel stay resort"],
      ["plane", "plane", "Plane", "travel flight"],
      ["car", "car", "Car", "drive transport"],
      ["home", "house", "Home", "house start"],
      ["ticket", "ticket", "Ticket", "event admission"],
      ["user", "user", "Person", "profile account"],
      ["user_plus", "user-plus", "Add person", "invite join"],
      ["award", "award", "Award", "prize badge quality"],
      ["smile", "smile", "Smile", "happy friendly"],
      ["sun", "sun", "Sun", "day bright summer"],
      ["moon", "moon", "Moon", "night dark"],
      ["cloud", "cloud", "Cloud", "weather sky"],
      ["leaf", "leaf", "Leaf", "nature eco green"],
      ["flame", "flame", "Flame", "fire hot trending"],
      ["zap", "zap", "Lightning", "fast energy power"],
      ["droplet", "droplet", "Droplet", "water fresh"],
      ["waves", "waves", "Waves", "sea beach ocean"],
      ["palm_tree", "palmtree", "Palm tree", "tropical beach resort"],
      ["mountain", "mountain", "Mountain", "peak outdoor"],
    ],
  },
};

function parseIconNode(slug, depth = 0) {
  const file = path.join(LUCIDE, `${slug}.js`);
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  // Some names are ALIASES that re-export another file ("palmtree" → "tree-palm").
  const alias = src.match(/export \{ default \} from '\.\/([\w-]+)\.js'/);
  if (alias && depth < 3) return parseIconNode(alias[1], depth + 1);
  const start = src.indexOf("const __iconNode = [");
  if (start === -1) return null;
  // Terminator is `];` — anchoring on a NEWLINE missed every single-line
  // definition (`const __iconNode = [["path", …]];`). Inner entries end with
  // `],` so the first `];` is always the array's own close.
  const end = src.indexOf("];", start);
  if (end === -1) return { unsupported: `unterminated node list in ${slug}` };
  const body = src.slice(start + "const __iconNode = ".length, end + 1);
  // The literal is plain JS with unquoted keys — evaluate it in isolation.
  // Input is a vendored file in node_modules, not user data.
  let nodes;
  try {
    nodes = new Function(`return ${body}`)();
  } catch {
    return { unsupported: `unparseable node list in ${slug}` };
  }
  if (!Array.isArray(nodes)) return { unsupported: `no node list in ${slug}` };

  const paths = [];
  const circles = [];
  const rects = [];
  const polygons = [];

  for (const [el, attrs] of nodes) {
    switch (el) {
      case "path":
        paths.push(attrs.d);
        break;
      case "circle":
        circles.push({ cx: Number(attrs.cx), cy: Number(attrs.cy), r: Number(attrs.r) });
        break;
      case "rect":
        rects.push({
          x: Number(attrs.x ?? 0),
          y: Number(attrs.y ?? 0),
          width: Number(attrs.width),
          height: Number(attrs.height),
          ...(attrs.rx !== undefined ? { rx: Number(attrs.rx) } : {}),
        });
        break;
      case "line":
        // A line is a two-point path — one shape type fewer to render.
        paths.push(`M${attrs.x1} ${attrs.y1}L${attrs.x2} ${attrs.y2}`);
        break;
      case "polyline":
        paths.push(`M${String(attrs.points).trim().replace(/\s+/g, "L")}`);
        break;
      case "polygon":
        polygons.push(String(attrs.points));
        break;
      case "ellipse":
        // No ellipse support in the definition shape; approximate as a circle
        // when it is one, otherwise skip the icon entirely (caller reports).
        if (attrs.rx === attrs.ry) {
          circles.push({ cx: Number(attrs.cx), cy: Number(attrs.cy), r: Number(attrs.rx) });
        } else {
          return { unsupported: `ellipse rx!=ry in ${slug}` };
        }
        break;
      default:
        return { unsupported: `${el} in ${slug}` };
    }
  }
  return { paths, circles, rects, polygons };
}

function emit(catalogKey, catalog) {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * ${catalog.title}`);
  lines.push(` *`);
  lines.push(` * GENERATED by scripts/generate-icon-catalog.mjs from lucide-react 1.7.0`);
  lines.push(` * (ISC licensed — https://lucide.dev). Do not hand-edit: re-run the script.`);
  lines.push(` *`);
  lines.push(` * Path data only. Glyphs paint in currentColor as inline SVG, which is both`);
  lines.push(` * the CSP-safe option (no icon font, no CDN) and the theming contract every`);
  lines.push(` * other glyph in the builder already follows.`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import type { BuilderIconCatalogEntry } from "./icon-registry-types";`);
  lines.push(``);
  // `as const satisfies` keeps every `name` a LITERAL type, so the merged
  // registry can still derive a union and a typo'd icon fails at compile time
  // rather than silently rendering the fallback glyph.
  lines.push(`export const ICON_CATALOG_${catalogKey.toUpperCase()} = [`);

  const missing = [];
  for (const [name, slug, label, keywords] of catalog.icons) {
    const parsed = parseIconNode(slug);
    if (!parsed || parsed.unsupported) {
      missing.push(`${name} (${slug}): ${parsed?.unsupported ?? "not found"}`);
      continue;
    }
    const category = catalogKey === "ui" ? uiCategory(name) : objectCategory(name);
    lines.push(`  {`);
    lines.push(`    name: "${name}",`);
    lines.push(`    label: "${label}",`);
    lines.push(`    category: "${category}",`);
    lines.push(`    keywords: [${keywords.split(" ").map((k) => `"${k}"`).join(", ")}],`);
    lines.push(`    paths: [${parsed.paths.map((d) => JSON.stringify(d)).join(", ")}],`);
    if (parsed.circles.length) {
      lines.push(`    circles: ${JSON.stringify(parsed.circles)},`);
    }
    if (parsed.rects.length) {
      lines.push(`    rects: ${JSON.stringify(parsed.rects)},`);
    }
    if (parsed.polygons.length) {
      lines.push(`    polygons: [${parsed.polygons.map((p) => JSON.stringify(p)).join(", ")}],`);
    }
    lines.push(`  },`);
  }
  lines.push(`] as const satisfies ReadonlyArray<BuilderIconCatalogEntry>;`);
  writeFileSync(path.join(OUT_DIR, catalog.file), lines.join("\n") + "\n");
  return missing;
}

function uiCategory(name) {
  if (/^(chevron|arrow)/.test(name)) return "arrows";
  if (/(message|send|bell|share|bookmark|thumbs|at_sign|inbox|quote)/.test(name)) {
    return "communication";
  }
  return "ui";
}

function objectCategory(name) {
  if (/(shopping|cart|credit|tag|gift|truck|package|percent|wallet)/.test(name)) return "commerce";
  if (/(image|video|music|mic|film|headphones|book|palette|scissors)/.test(name)) return "media";
  if (/(clock|map|compass|building|briefcase|coffee|utensils|bed|plane|car|home|ticket)/.test(name)) {
    return "places";
  }
  if (/(user|award|smile)/.test(name)) return "people";
  return "nature";
}

let allMissing = [];
for (const [key, catalog] of Object.entries(CATALOGS)) {
  allMissing = allMissing.concat(emit(key, catalog));
}
const total = Object.values(CATALOGS).reduce((n, c) => n + c.icons.length, 0);
console.log(`wrote ${total - allMissing.length}/${total} glyphs`);
if (allMissing.length) {
  console.log("MISSING (fix the slug or drop the entry):");
  for (const m of allMissing) console.log("  " + m);
  process.exit(1);
}
