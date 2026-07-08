/**
 * AI page-builder eval harness (no live API key required).
 *
 * We can't call the live Anthropic generator here (no key, and keys can't be
 * entered from this environment). But the generator's job is: brief → raw
 * BuilderNode JSON → coerce/validate (generateBuilderNodes) → renderer. This
 * harness feeds hand-authored "model output" (written to the exact prompt rules
 * the system prompt enforces) through the REAL generateBuilderNodes composer and
 * the REAL renderBuilderNodes renderer, then writes standalone pages so we can
 * screenshot render quality across the component gallery on light + dark themes.
 *
 * It proves the deterministic half of the pipeline (coerce → validate → render),
 * which is exactly what the Wave-1 quality fixes touched. It does NOT prove the
 * live prompt reliably steers real API output — that needs a key + eval run.
 *
 * Run:  NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/ai-builder-eval.tsx
 * Output: web/public/_eval/*.html  (served by the dev server at /_eval/<name>.html)
 */
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { generateBuilderNodes } from "../src/lib/site-admin/builder-core/ai/generate-nodes";
import { renderBuilderNodes } from "../src/lib/site-admin/builder-node/render";
import type { BuilderNode } from "../src/lib/site-admin/builder-node/types";

// The generator emits `section`-rooted trees (structural frames for builder
// insertion). The pure renderer draws `section` as null — a published page is
// a stack of full-width CONTAINER bands (exactly what the composition presets
// emit). So to render a generated page faithfully we lower each root `section`
// to a full-width container band, carrying the section's own style onto the
// full-bleed band and letting the inner containers keep their 1120px cap.
const BG_KEYS = new Set(["backgroundColor", "textColor", "background", "paddingY"]);
function sectionsToBands(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return tree.map((node) => {
    if (node.kind !== "section") return node;
    const kids = (node.children ?? []) as BuilderNode[];
    // Full-bleed pattern: when a section is a single container that carries a
    // band background, hoist the background (+ vertical padding) to a 100%-wide
    // wrapper and keep the container's own layout/content capped at 1120 and
    // centered — so the color runs edge-to-edge like a real website section,
    // not a floating 1120px box.
    const only = kids.length === 1 && kids[0].kind === "container" ? kids[0] : null;
    const onlyStyle = only
      ? (((only.props as Record<string, unknown>).style as Record<string, unknown> | undefined) ?? {})
      : {};
    const hasBand = only && ("backgroundColor" in onlyStyle || "background" in onlyStyle);
    if (only && hasBand) {
      const bandStyle: Record<string, unknown> = { width: "100%", maxWidthFree: "100%" };
      const innerStyle: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(onlyStyle)) {
        (BG_KEYS.has(k) ? bandStyle : innerStyle)[k] = v;
      }
      return {
        ...node,
        kind: "container",
        props: { layout: "stack", gap: "0px", align: "stretch", style: bandStyle },
        children: [{ ...only, props: { ...(only.props as object), style: innerStyle } }],
      } as unknown as unknown as BuilderNode;
    }
    return {
      ...node,
      kind: "container",
      props: {
        layout: "stack",
        gap: "0px",
        align: "stretch",
        style: { width: "100%", maxWidthFree: "100%" },
      },
      children: node.children,
    } as unknown as BuilderNode;
  });
}

// ── Themes to render each case under ──────────────────────────────────────────
// A light (default :root) + the Impronta signature dark (editorial-noir, black +
// gold) — the pair where the Wave-1 token fixes matter most — plus one warm dark.
const THEMES: Array<{ id: string; label: string; mode: string | null }> = [
  { id: "light", label: "Light (default :root)", mode: null },
  { id: "noir", label: "Editorial Noir (black + gold)", mode: "editorial-noir" },
  { id: "espresso", label: "Espresso (warm dark)", mode: "espresso" },
];

// ── Eval cases: brief + hand-authored model output ───────────────────────────
// Each modelOutput is written the way the system prompt steers the model:
//  - uppercase muted eyebrow above each non-hero level:2 heading (AIQ-23)
//  - verb-led CTA labels, never "Learn more" (AIQ-26)
//  - brand language: client/book/inquire/roster, never buyer/cart (AIQ-10)
//  - dark bands via backgroundColor+textColor PAIRS, never a lone token (AIQ-6)
//  - images by role only (curated photo injected by the composer) (AIQ-9)

type Case = { name: string; brief: string; modelOutput: unknown };

const CASES: Case[] = [
  {
    name: "modeling-agency",
    brief: "homepage for a boutique modeling agency in Milan",
    modelOutput: {
      sections: [
        // 1 — Hero
        {
          kind: "section",
          label: "Hero",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "m", align: "center", style: { paddingY: "xl" } },
              children: [
                { kind: "paragraph", props: { text: "MILAN · SINCE 2009", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "Faces that move culture", level: 1, style: { size: "display" } } },
                { kind: "paragraph", props: { text: "A boutique roster booked by the brands setting the pace across editorial, runway, and campaign." } },
                {
                  kind: "cta_group",
                  props: { align: "center" },
                  children: [
                    { kind: "button", props: { label: "Book a model", href: "/inquire", tone: "primary" } },
                    { kind: "button", props: { label: "View the roster", href: "/roster", tone: "secondary" } },
                  ],
                },
                { kind: "image", props: { role: "hero", alt: "Studio session" } },
              ],
            },
          ],
        },
        // 2 — Services (eyebrow + grid of elevated cards with icons)
        {
          kind: "section",
          label: "Services",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center" },
              children: [
                { kind: "paragraph", props: { text: "WHAT WE OFFER", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "Casting, built around the brief", level: 2 } },
              ],
            },
            {
              kind: "container",
              props: { layout: "grid", columns: 3, gap: "m" },
              children: [
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Editorial", level: 3 } },
                    { kind: "paragraph", props: { text: "Campaign and magazine casting with a founder on every shoot.", style: { tone: "muted" } } },
                  ],
                },
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Runway", level: 3 } },
                    { kind: "paragraph", props: { text: "Show bookings across the European fashion calendar.", style: { tone: "muted" } } },
                  ],
                },
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Commercial", level: 3 } },
                    { kind: "paragraph", props: { text: "Brand and lifestyle work, negotiated end to end.", style: { tone: "muted" } } },
                  ],
                },
              ],
            },
          ],
        },
        // 3 — Editorial split (image + copy, surface band)
        {
          kind: "section",
          label: "Approach",
          children: [
            {
              kind: "container",
              props: { layout: "split", gap: "l", align: "center", style: { background: "surface", paddingY: "l" } },
              children: [
                { kind: "image", props: { role: "portrait", alt: "Model portrait" } },
                {
                  kind: "container",
                  props: { layout: "stack", gap: "s" },
                  children: [
                    { kind: "paragraph", props: { text: "THE APPROACH", style: { tone: "muted" } } },
                    { kind: "heading", props: { text: "One founder, from first call to wrap", level: 2 } },
                    { kind: "paragraph", props: { text: "No account layers. The person you brief is the person on set, protecting the talent and the timeline." } },
                    {
                      kind: "cta_group",
                      props: { align: "left" },
                      children: [{ kind: "button", props: { label: "Start an inquiry", href: "/inquire", tone: "primary" } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        // 4 — FAQ accordion
        {
          kind: "section",
          label: "FAQ",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center" },
              children: [
                { kind: "paragraph", props: { text: "GOOD TO KNOW", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "Before you brief us", level: 2 } },
              ],
            },
            {
              kind: "accordion",
              props: { allowMultiple: false },
              children: [
                { kind: "accordion_item", props: { title: "Do the models travel?" }, children: [{ kind: "paragraph", props: { text: "Across the peninsula and internationally, visas handled in-house." } }] },
                { kind: "accordion_item", props: { title: "How do bookings work?" }, children: [{ kind: "paragraph", props: { text: "Send a brief, we return a shortlist within 48 hours with availability and rates." } }] },
                { kind: "accordion_item", props: { title: "What about usage and buyout?" }, children: [{ kind: "paragraph", props: { text: "Every quote itemizes usage, territory, and term so there are no surprises." } }] },
              ],
            },
          ],
        },
        // 5 — Closing CTA band (dark pair)
        {
          kind: "section",
          label: "Closing",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "m", align: "center", style: { backgroundColor: "#15120e", textColor: "#f3ece0", paddingY: "xl" } },
              children: [
                { kind: "heading", props: { text: "Have a shoot on the calendar?", level: 2 } },
                { kind: "paragraph", props: { text: "Tell us the concept and the dates. We will build the lineup." } },
                {
                  kind: "cta_group",
                  props: { align: "center" },
                  children: [{ kind: "button", props: { label: "Book a model", href: "/inquire", tone: "primary" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: "private-chef",
    brief: "landing page for an independent private chef doing intimate dinners",
    modelOutput: {
      sections: [
        {
          kind: "section",
          label: "Hero",
          children: [
            {
              kind: "container",
              props: { layout: "split", gap: "l", align: "center", style: { paddingY: "xl" } },
              children: [
                {
                  kind: "container",
                  props: { layout: "stack", gap: "s" },
                  children: [
                    { kind: "paragraph", props: { text: "PRIVATE DINING", style: { tone: "muted" } } },
                    { kind: "heading", props: { text: "A tasting menu, at your table", level: 1, style: { size: "display" } } },
                    { kind: "paragraph", props: { text: "Seasonal, produce-led menus cooked in your home for six to fourteen guests." } },
                    {
                      kind: "cta_group",
                      props: { align: "left" },
                      children: [{ kind: "button", props: { label: "Reserve a date", href: "/inquire", tone: "primary" } }],
                    },
                  ],
                },
                { kind: "image", props: { role: "wide", alt: "Chef plating a course" } },
              ],
            },
          ],
        },
        {
          kind: "section",
          label: "Menus",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center" },
              children: [
                { kind: "paragraph", props: { text: "THE EXPERIENCE", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "Three ways to host", level: 2 } },
              ],
            },
            {
              kind: "pricing_table",
              props: {
                tiers: [
                  { name: "The Supper", price: "€120", period: "guest", features: [{ label: "Five courses", included: true }, { label: "Seasonal produce", included: true }, { label: "Wine pairing", included: false }] },
                  { name: "The Table", price: "€180", period: "guest", highlighted: true, ctaLabel: "Reserve the Table", ctaHref: "/inquire", features: [{ label: "Seven courses", included: true }, { label: "Wine pairing", included: true }, { label: "Menu co-designed with you", included: true }] },
                  { name: "The Occasion", price: "€260", period: "guest", features: [{ label: "Nine courses", included: true }, { label: "Sommelier on service", included: true }, { label: "Bespoke tableware", included: true }] },
                ],
              },
            },
          ],
        },
        {
          kind: "section",
          label: "Testimonial",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center", style: { background: "surface", paddingY: "l" } },
              children: [
                { kind: "icon", props: { icon: "heart" } },
                { kind: "heading", props: { text: "“The best meal we have had in our own home, hands down.”", level: 2 } },
                { kind: "paragraph", props: { text: "Giulia R., anniversary dinner for twelve", style: { tone: "muted" } } },
              ],
            },
          ],
        },
        {
          kind: "section",
          label: "Enquire",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center" },
              children: [
                { kind: "paragraph", props: { text: "CHECK A DATE", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "Tell me about your evening", level: 2 } },
                { kind: "paragraph", props: { text: "Share the date, the headcount, and anything you are celebrating.", style: { tone: "muted" } } },
              ],
            },
            {
              kind: "form",
              props: {
                method: "post",
                fields: [
                  { name: "name", type: "text", label: "Your name" },
                  { name: "email", type: "email", label: "Email" },
                  { name: "date", type: "text", label: "Preferred date" },
                  { name: "guests", type: "text", label: "Number of guests" },
                  { name: "details", type: "textarea", label: "What are we celebrating?" },
                  { name: "send", type: "submit", label: "Send my enquiry" },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  {
    name: "tattoo-studio",
    brief: "site for a fine-line tattoo studio, moody and editorial",
    modelOutput: {
      sections: [
        {
          kind: "section",
          label: "Hero",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "m", align: "center", style: { backgroundColor: "#141414", textColor: "#f4f4f5", paddingY: "xl" } },
              children: [
                { kind: "paragraph", props: { text: "FINE-LINE · BY APPOINTMENT", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "Ink that ages well", level: 1, style: { size: "display" } } },
                { kind: "paragraph", props: { text: "A two-artist studio for considered, single-session fine-line work." } },
                {
                  kind: "cta_group",
                  props: { align: "center" },
                  children: [{ kind: "button", props: { label: "Request a booking", href: "/inquire", tone: "primary" } }],
                },
              ],
            },
          ],
        },
        {
          kind: "section",
          label: "Artists",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center" },
              children: [
                { kind: "paragraph", props: { text: "THE ARTISTS", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "Two hands, one register", level: 2 } },
              ],
            },
            {
              kind: "container",
              props: { layout: "grid", columns: 2, gap: "m" },
              children: [
                {
                  kind: "card",
                  props: { variant: "outline" },
                  children: [
                    { kind: "image", props: { role: "team", alt: "Artist portrait" } },
                    { kind: "heading", props: { text: "Sena", level: 3 } },
                    { kind: "paragraph", props: { text: "Botanical fine-line and micro-script.", style: { tone: "muted" } } },
                  ],
                },
                {
                  kind: "card",
                  props: { variant: "outline" },
                  children: [
                    { kind: "image", props: { role: "portrait", alt: "Artist portrait" } },
                    { kind: "heading", props: { text: "Rafa", level: 3 } },
                    { kind: "paragraph", props: { text: "Geometric blackwork and ornamental.", style: { tone: "muted" } } },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: "section",
          label: "Process",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center" },
              children: [
                { kind: "paragraph", props: { text: "HOW IT WORKS", style: { tone: "muted" } } },
                { kind: "heading", props: { text: "From idea to healed", level: 2 } },
              ],
            },
            {
              kind: "container",
              props: { layout: "grid", columns: 3, gap: "m" },
              children: [
                {
                  kind: "container",
                  props: { layout: "stack", gap: "s", align: "center" },
                  children: [
                    { kind: "icon", props: { icon: "mail" } },
                    { kind: "heading", props: { text: "1 · Enquire", level: 3 } },
                    { kind: "paragraph", props: { text: "Send references and placement.", style: { tone: "muted" } } },
                  ],
                },
                {
                  kind: "container",
                  props: { layout: "stack", gap: "s", align: "center" },
                  children: [
                    { kind: "icon", props: { icon: "calendar" } },
                    { kind: "heading", props: { text: "2 · Design", level: 3 } },
                    { kind: "paragraph", props: { text: "We sketch and confirm a date.", style: { tone: "muted" } } },
                  ],
                },
                {
                  kind: "container",
                  props: { layout: "stack", gap: "s", align: "center" },
                  children: [
                    { kind: "icon", props: { icon: "check" } },
                    { kind: "heading", props: { text: "3 · Session", level: 3 } },
                    { kind: "paragraph", props: { text: "One calm sitting, aftercare included.", style: { tone: "muted" } } },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: "section",
          label: "Closing",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "m", align: "center", style: { paddingY: "l" } },
              children: [
                { kind: "heading", props: { text: "Books open monthly", level: 2 } },
                { kind: "paragraph", props: { text: "Join the list and we will reach out when the next window opens.", style: { tone: "muted" } } },
                {
                  kind: "cta_group",
                  props: { align: "center" },
                  children: [{ kind: "button", props: { label: "Request a booking", href: "/inquire", tone: "primary" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

// ── Render + write ────────────────────────────────────────────────────────────
const OUT_DIR = join(process.cwd(), "public", "_eval");
mkdirSync(OUT_DIR, { recursive: true });

const tokenCss = readFileSync(join(process.cwd(), "src", "app", "token-presets.css"), "utf8");

function pageHtml(bodyHtml: string, theme: (typeof THEMES)[number], caseName: string): string {
  const modeAttr = theme.mode ? ` data-token-background-mode="${theme.mode}"` : "";
  return `<!doctype html>
<html lang="en"${modeAttr}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${caseName} — ${theme.label}</title>
<style>
:root { --site-heading-font: "Georgia", serif; --site-body-font: system-ui, -apple-system, sans-serif; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: var(--site-page-background, #fff); color: var(--token-color-ink, #111); font-family: var(--site-body-font); }
.eval-canvas { min-height: 100vh; background: var(--site-page-background, #fff); }
img { max-width: 100%; height: auto; display: block; }
</style>
<style>${tokenCss}</style>
</head>
<body>
<div class="eval-canvas" data-theme-canvas-root>
${bodyHtml}
</div>
</body>
</html>`;
}

async function run() {
  const index: string[] = [];
  for (const c of CASES) {
    const res = await generateBuilderNodes({
      brief: c.brief,
      scope: "page",
      generateWithModel: async () => JSON.stringify(c.modelOutput),
    });
    if (!res.ok) {
      console.error(`[FAIL] ${c.name}: ${res.code} — ${res.error}`);
      continue;
    }
    const renderTree = sectionsToBands(res.tree);
    const bodyHtml = renderToStaticMarkup(
      createElement(Fragment, null, renderBuilderNodes(renderTree, { publicPathPrefix: "" })),
    );
    for (const theme of THEMES) {
      const file = `${c.name}--${theme.id}.html`;
      writeFileSync(join(OUT_DIR, file), pageHtml(bodyHtml, theme, c.name), "utf8");
      index.push(`<li><a href="/_eval/${file}">${c.name} — ${theme.label}</a> · ${res.nodeCount} nodes${res.repaired ? " (repaired)" : ""}</li>`);
    }
    console.log(`[ok] ${c.name}: ${res.nodeCount} nodes${res.repaired ? " (repaired)" : ""}, ${THEMES.length} themes`);
  }
  const indexHtml = `<!doctype html><html><head><meta charset="utf-8"><title>AI builder eval</title>
<style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7}h1{font-size:20px}li{margin:6px 0}</style>
</head><body><h1>AI page-builder eval output</h1><ul>${index.join("\n")}</ul></body></html>`;
  writeFileSync(join(OUT_DIR, "index.html"), indexHtml, "utf8");
  console.log(`\nWrote ${index.length} pages to public/_eval/ — open /_eval/index.html`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
