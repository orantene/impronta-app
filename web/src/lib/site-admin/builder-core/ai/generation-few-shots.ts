/**
 * Few-shot exemplars for the AI page-builder system prompt. Extracted from
 * generate-nodes.ts to keep that file under the 800-line lint cap; these are
 * pure prompt DATA (hero/services/split-hero/testimonial/split/CTA/FAQ/pricing,
 * plus a Spanish exemplar gated on locale). Each entry is a prompt line: an
 * "EXAMPLE (...)" label followed by a JSON.stringify of a sample tree.
 *
 * Every exemplar must obey the prompt RULES (no em/en dashes, talent-agency
 * vocabulary, verb-led CTAs, one level:1 in the hero, uppercase section eyebrows)
 * and must coerce to a valid tree — both are locked by generate-nodes.test.ts.
 */
export function buildFewShotExamples(locale?: string): string[] {
  return [
    "EXAMPLE (one hero section):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Hero",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "m", align: "center", style: { paddingY: "xl", minHeight: "78svh", maxWidth: "reading" } },
              children: [
                { kind: "paragraph", props: { text: "A boutique modeling agency", style: { align: "center", size: "sm", textTransform: "uppercase", tone: "muted" } } },
                { kind: "heading", props: { text: "Faces that move culture", level: 1, style: { size: "display", align: "center" } } },
                { kind: "paragraph", props: { text: "A boutique roster of models booked by the brands setting the pace.", style: { align: "center", maxWidth: "reading" } } },
                {
                  kind: "cta_group",
                  props: { align: "center" },
                  children: [{ kind: "button", props: { label: "Book a model", href: "/inquire", tone: "primary" } }],
                },
                { kind: "image", props: { role: "hero", alt: "Model on a studio runway" } },
              ],
            },
          ],
        },
      ],
    }),
    "",
    "EXAMPLE (a 3-card services grid):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Services",
          children: [
            { kind: "paragraph", props: { text: "What we offer", style: { align: "center", size: "sm", tone: "muted", textTransform: "uppercase" } } },
            { kind: "heading", props: { text: "Casting, built around the brief", level: 2, style: { align: "center" } } },
            {
              kind: "container",
              props: { layout: "grid", columns: 3, gap: "m" },
              children: [
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Editorial", level: 3 } },
                    { kind: "paragraph", props: { text: "Campaign and lookbook casting for print and digital." } },
                  ],
                },
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Runway", level: 3 } },
                    { kind: "paragraph", props: { text: "Season fittings and show bookings across fashion weeks." } },
                  ],
                },
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Commercial", level: 3 } },
                    { kind: "paragraph", props: { text: "Brand, lifestyle, and product work with usage handled." } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
    "EXAMPLE (an alternate hero: image beside copy, not a centered stack):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Hero",
          children: [
            {
              kind: "split",
              props: { ratio: "60-40", gap: "l", style: { paddingY: "l" } },
              children: [
                {
                  kind: "container",
                  props: { layout: "stack", gap: "m", align: "start", style: { maxWidth: "reading" } },
                  children: [
                    { kind: "paragraph", props: { text: "Voice and on-camera talent", style: { size: "sm", textTransform: "uppercase", tone: "muted" } } },
                    { kind: "heading", props: { text: "The voices behind the brands you know", level: 1, style: { size: "display", align: "left" } } },
                    { kind: "paragraph", props: { text: "A signed roster of voice actors and presenters, booked directly through our team." } },
                    { kind: "cta_group", props: { align: "start" }, children: [{ kind: "button", props: { label: "Book a voice", href: "/inquire", tone: "primary" } }] },
                  ],
                },
                {
                  kind: "container",
                  props: { layout: "stack" },
                  children: [{ kind: "image", props: { role: "portrait", alt: "Voice actor in a recording booth" } }],
                },
              ],
            },
          ],
        },
      ],
    }),
    "EXAMPLE (a testimonial with named attribution):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Testimonial",
          children: [
            { kind: "paragraph", props: { text: "What clients say", style: { align: "center", size: "sm", textTransform: "uppercase", tone: "muted" } } },
            { kind: "heading", props: { text: "Booked again within the week", level: 2, style: { align: "center" } } },
            {
              kind: "container",
              props: { layout: "stack", gap: "s", align: "center", style: { maxWidth: "reading", paddingY: "m" } },
              children: [
                { kind: "paragraph", props: { text: "\"They understood the brief before we finished it and had three right names on hold by lunch. The shoot ran ahead of schedule.\"", style: { align: "center", size: "lg", fontStyle: "italic" } } },
                { kind: "paragraph", props: { text: "Marta Alvi, Head of Casting at Nord Studio", style: { align: "center", size: "sm", tone: "muted" } } },
              ],
            },
          ],
        },
      ],
    }),
    "EXAMPLE (a 50-50 split: copy beside an image):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Approach",
          children: [
            {
              kind: "split",
              props: { ratio: "50-50", gap: "l", style: { paddingY: "l" } },
              children: [
                {
                  kind: "container",
                  props: { layout: "stack", gap: "m", align: "start", style: { maxWidth: "reading" } },
                  children: [
                    { kind: "paragraph", props: { text: "How we work", style: { size: "sm", textTransform: "uppercase", tone: "muted" } } },
                    { kind: "heading", props: { text: "One producer from brief to wrap", level: 2, style: { align: "left" } } },
                    { kind: "paragraph", props: { text: "A single producer owns your booking end to end, so you brief once and hear back fast." } },
                    { kind: "cta_group", props: { align: "start" }, children: [{ kind: "button", props: { label: "Start an inquiry", href: "/inquire", tone: "secondary" } }] },
                  ],
                },
                {
                  kind: "container",
                  props: { layout: "stack" },
                  children: [{ kind: "image", props: { role: "wide", alt: "Producer reviewing a shot list on set" } }],
                },
              ],
            },
          ],
        },
      ],
    }),
    "EXAMPLE (a closing call-to-action band, the one colored band on the page):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Closing CTA",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "m", align: "center", style: { paddingY: "l", maxWidth: "full", backgroundColor: "#15120e", textColor: "#f3ece0", radius: "lg" } },
              children: [
                { kind: "paragraph", props: { text: "Ready when you are", style: { align: "center", size: "sm", textTransform: "uppercase" } } },
                { kind: "heading", props: { text: "Tell us who you need on set", level: 2, style: { align: "center" } } },
                { kind: "paragraph", props: { text: "Send the brief and we will come back with a shortlist inside a day.", style: { align: "center", maxWidth: "reading" } } },
                { kind: "cta_group", props: { align: "center" }, children: [{ kind: "button", props: { label: "Book talent now", href: "/inquire", tone: "primary" } }] },
              ],
            },
          ],
        },
      ],
    }),
    "EXAMPLE (an FAQ accordion):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "FAQ",
          children: [
            { kind: "paragraph", props: { text: "Good to know", style: { align: "center", size: "sm", textTransform: "uppercase", tone: "muted" } } },
            { kind: "heading", props: { text: "Answers before you inquire", level: 2, style: { align: "center" } } },
            {
              kind: "accordion",
              props: { allowMultiple: false },
              children: [
                { kind: "accordion_item", props: { title: "How fast can you send a shortlist?" }, children: [{ kind: "paragraph", props: { text: "Most briefs get a first shortlist inside one business day." } }] },
                { kind: "accordion_item", props: { title: "Do you handle usage and rights?" }, children: [{ kind: "paragraph", props: { text: "Yes. Every quote lists usage, term, and territory up front." } }] },
                { kind: "accordion_item", props: { title: "Can we book talent outside our city?" }, children: [{ kind: "paragraph", props: { text: "We book across the country and arrange travel when a role calls for it." } }] },
              ],
            },
          ],
        },
      ],
    }),
    "EXAMPLE (pricing copy as a pricing table):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Pricing",
          children: [
            { kind: "paragraph", props: { text: "Ways to book", style: { align: "center", size: "sm", textTransform: "uppercase", tone: "muted" } } },
            { kind: "heading", props: { text: "Bookings that scale with the brief", level: 2, style: { align: "center" } } },
            {
              kind: "pricing_table",
              props: {
                tiers: [
                  { name: "Single booking", price: "$1,200", period: "day", description: "One confirmed talent for a single shoot day.", features: [{ label: "One vetted talent", included: true }, { label: "Usage terms in writing", included: true }, { label: "Same-day shortlist", included: false }], ctaLabel: "Book a day", ctaHref: "/inquire" },
                  { name: "Campaign", price: "$4,800", period: "week", description: "A cast of talent for a multi-day campaign.", highlighted: true, features: [{ label: "Up to five talent on hold", included: true }, { label: "Dedicated producer", included: true }, { label: "Same-day shortlist", included: true }], ctaLabel: "Plan a campaign", ctaHref: "/inquire" },
                  { name: "Retainer", price: "Custom", period: "month", description: "Ongoing casting for brands booking every month.", features: [{ label: "Priority roster access", included: true }, { label: "Named account team", included: true }, { label: "Quarterly talent review", included: true }], ctaLabel: "Talk to the team", ctaHref: "/inquire" },
                ],
              },
            },
          ],
        },
      ],
    }),
    // ES few-shot (AIQ-3): only appears when the target language is Spanish, so
    // the English default prompt stays byte-identical and the token budget lean.
    ...(locale === "es"
      ? [
          "",
          "EXAMPLE (a closing CTA section, Spanish copy):",
          JSON.stringify({
            sections: [
              {
                kind: "section",
                label: "Cierre",
                children: [
                  { kind: "paragraph", props: { text: "Empieza aquí", style: { align: "center", size: "sm", tone: "muted", textTransform: "uppercase" } } },
                  { kind: "heading", props: { text: "Reserva tu próxima campaña", level: 2, style: { align: "center" } } },
                  { kind: "paragraph", props: { text: "Un equipo boutique que acompaña cada reserva de principio a fin.", style: { align: "center", maxWidth: "reading" } } },
                  { kind: "cta_group", props: { align: "center" }, children: [{ kind: "button", props: { label: "Reserva talento", href: "/inquire", tone: "primary" } }] },
                ],
              },
            ],
          }),
        ]
      : []),
  ];
}
