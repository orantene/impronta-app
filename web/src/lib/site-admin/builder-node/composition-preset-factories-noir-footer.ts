/**
 * Builder-node composition preset — Noir & Or editorial site-shell footer.
 *
 * Freeform `container` tree (htmlTag:"footer") that explodes into individually
 * editable nodes on drop. Colors/fonts bind to token sentinels with the literal
 * Noir & Or palette as the default (espresso #100e13, paper-2 #161320, ink
 * #ece4d3, gold #c6a14e, champagne #e0c074, line rgba(198,161,78,0.26)). EN/ES
 * seeded per text node via the node-level i18n overlay. Caps-bound: the only
 * style values over the 16-char free-field cap (footer top padding, link/social/
 * toggle hover transitions, the gold hairlines) live in `style.customCss`
 * (8000-char cap), scoped to the node via [data-builder-node-id].
 *
 * Backend (all VERIFIED in handoff §8): EN/ES toggle = plain `button`s that set
 * the `?lang=` locale the renderer resolves against the per-node i18n overlay;
 * social_links static (Option A — editable, no dead binding); nav.links manual
 * (Option A — matches mockup). Footer links route to REAL tenant surfaces
 * (/directory, /inquire, /?lang=) — never the mockup's dead /contact|*.html|#.
 * The "Powered by Tulala" rich_text carries lockedProps so it is read-only on
 * tenant surfaces (no migration needed).
 *
 * Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId, randomUuid } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const ESPRESSO = "var(--token-color-background, #100e13)";
const GOLD = "var(--token-color-primary, #c6a14e)";
const CHAMPAGNE = "var(--token-color-accent, #e0c074)";
const LINE = "var(--token-color-border, rgba(198,161,78,0.26))";
const MUTED = "rgba(236,228,211,0.62)";

type Pair = readonly [en: string, es: string];

export function createFooterEditorialPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  // ── Column 1 — oversized champagne wordmark + muted tagline ──────────────
  const wordmark: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "IMPRONTA",
      level: 2,
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: "clamp(2.4rem,5vw,3.6rem)",
        textColor: CHAMPAGNE,
        letterSpacing: "0.02em",
        lineHeight: "1",
        marginBottomFree: "18px",
      },
    },
  };
  const tagline: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "A Tulum-born talent agency representing faces for runway, editorial, and campaign across Mexico and Europe.",
      style: {
        textColor: MUTED,
        maxWidthFree: "34ch",
        fontSize: "0.95rem",
        lineHeight: "1.7",
      },
    },
    i18n: {
      es: {
        text: "Agencia de talento nacida en Tulum que representa rostros para pasarela, editorial y campaña en México y Europa.",
      },
    },
  };
  const col1: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", style: { gap: "0px" } },
    children: [wordmark, tagline],
  };

  // ── Eyebrow heading for cols 2-4 ─────────────────────────────────────────
  const eyebrow = (en: string, es: string): BuilderNode => ({
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: en,
      level: 4,
      style: {
        textColor: CHAMPAGNE,
        textTransform: "uppercase",
        letterSpacing: "0.22em",
        fontSize: "0.7rem",
        marginBottomFree: "16px",
      },
    },
    i18n: { es: { text: es } },
  });

  // ── A per-column link nav. Links are PROPS; per-link es lives in
  //    props.i18n keyed "links.<id>.label" (the i18n overlay namespacing the
  //    renderer reads for nav-link labels). Hover→champagne via customCss on
  //    descendant <a>. Hrefs route to REAL tenant surfaces. ─────────────────
  const linkNav = (
    ariaEn: string,
    links: ReadonlyArray<{ href: string; label: Pair }>,
  ): BuilderNode => {
    const navId = makeId("nav");
    const built = links.map((l) => ({
      id: randomUuid(),
      label: l.label[0],
      href: l.href,
    }));
    const esOverlay: Record<string, string> = {};
    links.forEach((l, i) => {
      esOverlay[`links.${built[i]!.id}.label`] = l.label[1];
    });
    return {
      id: navId,
      kind: "nav",
      props: {
        ariaLabel: ariaEn,
        links: built,
        style: {
          customCss: [
            // Footer columns are always-visible vertical link lists (never a
            // collapsing disclosure). Force the nav-links row→column at all
            // widths and neutralize the disclosure toggle on mobile.
            `.site-builder-node--nav-links { display: flex; flex-direction: column; align-items: flex-start; gap: 0; }`,
            `.site-builder-node--nav-disclosure { display: none; }`,
            // Self/descendant styling via plain descendant selectors (the scoper
            // prefixes these once with this node's id — repeating [data-builder-node-id]
            // would double-prefix and match nothing).
            `a { color: ${MUTED}; text-decoration: none; font-size: 0.92rem; line-height: 2.05; transition: color .3s ease; }`,
            `a:hover, a:focus-visible { color: ${CHAMPAGNE}; }`,
            `@media (max-width: 640px) { .site-builder-node--nav-links { display: flex !important; flex-direction: column !important; gap: 0 !important; } .site-builder-node--nav-disclosure { display: none !important; } }`,
          ].join("\n"),
        },
      },
      i18n: { es: esOverlay },
    };
  };

  // Col 2 — Agency
  const col2: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", style: { gap: "0px" } },
    children: [
      eyebrow("Agency", "Agencia"),
      // Hrefs verified against the real route tree (route groups (public)/(auth)
      // do not appear in the URL): /directory, / and /talent/register all
      // resolve + are served on tenant hosts. (There is no /posts index — only
      // /posts/[slug] — and no /about page, so Campaigns/About point at the
      // homepage where those sections live.)
      linkNav("Agency", [
        { href: "/directory", label: ["The board", "El board"] },
        { href: "/", label: ["Campaigns", "Campañas"] },
        { href: "/", label: ["About", "Nosotros"] },
        { href: "/talent/register", label: ["Get scouted", "Ser descubierto"] },
      ]),
    ],
  };

  // Col 3 — Studios
  const col3: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", style: { gap: "0px" } },
    children: [
      eyebrow("Studios", "Estudios"),
      // `location` is the real directory facet param (search-params.ts reads
      // params.get("location")); `city` was ignored. Slug values land filtered
      // when they match the tenant's location slugs, gracefully unfiltered if not.
      linkNav("Studios", [
        { href: "/directory?location=tulum", label: ["Tulum", "Tulum"] },
        { href: "/directory?location=mexico-city", label: ["Mexico City", "Ciudad de México"] },
        { href: "/directory?location=ibiza", label: ["Ibiza", "Ibiza"] },
      ]),
    ],
  };

  // ── Col 4 — Connect: eyebrow + social_links + a Bookings nav ─────────────
  const socialId = makeId("social_links");
  const social: BuilderNode = {
    id: socialId,
    kind: "social_links",
    props: {
      ariaLabel: "Social links",
      size: "md",
      shape: "bare",
      links: [
        { id: randomUuid(), platform: "instagram", href: "https://instagram.com/" },
        { id: randomUuid(), platform: "tiktok", href: "https://tiktok.com/" },
      ],
      style: {
        marginBottomFree: "14px",
        customCss: [
          `a { color: ${MUTED}; transition: color .3s ease; }`,
          `a:hover, a:focus-visible { color: ${CHAMPAGNE}; }`,
          // Bump the bare social targets to a comfortable 44px tap area on phones.
          `@media (max-width: 640px) { .site-builder-node--social-link { width: 44px !important; height: 44px !important; } }`,
        ].join("\n"),
      },
    },
  };
  const col4: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", style: { gap: "0px" } },
    children: [
      eyebrow("Connect", "Conecta"),
      social,
      linkNav("Connect", [
        { href: "/contact", label: ["Bookings", "Reservas"] },
      ]),
    ],
  };

  // ── Top zone — 4-col asymmetric grid → 2col (tablet) → 1col (mobile) ─────
  const topZoneId = makeId("container");
  const topZone: BuilderNode = {
    id: topZoneId,
    kind: "container",
    props: {
      layout: "grid",
      style: {
        gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
        gap: "40px",
        paddingBottom: "44px",
        containerType: "inline-size",
        responsive: {
          tablet: { gridTemplateColumns: "1fr 1fr", gap: "l" },
          mobile: { gridTemplateColumns: "1fr", gap: "m" },
        },
        customCss: [
          // Single-side hairline (single-side borders → customCss per caps rule).
          `{ border-top: 0; border-left: 0; border-right: 0; border-bottom: 1px solid ${LINE}; }`,
          // Tighten the stacked-column gap on phones (the 40px desktop gap reads
          // as dead space once the 4 columns become one).
          `@media (max-width: 640px) { { gap: 28px !important; } }`,
        ].join("\n"),
      },
    },
    children: [col1, col2, col3, col4],
  };

  // ── Bottom bar — © / EN-ES toggle / Powered by Tulala ───────────────────
  const copyright: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "© 2026 Impronta Models",
      style: {
        textColor: MUTED,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        fontSize: "0.68rem",
      },
    },
    i18n: { es: { text: "© 2026 Impronta Models" } },
  };

  // EN/ES toggle — plain editable buttons setting the ?lang= locale the
  // renderer resolves against the per-node i18n overlays. EN active = champagne.
  const langGroupId = makeId("cta_group");
  const langToggle: BuilderNode = {
    id: langGroupId,
    kind: "cta_group",
    props: {
      layout: "row",
      gap: "s",
      align: "center",
      style: {
        customCss: [
          `{ display: flex; align-items: center; gap: 8px; }`,
          // Give EN / ES real ~44px tap targets on phones without inflating the
          // desktop small-caps look (font-size stays as-is).
          `@media (max-width: 640px) { .site-builder-node--button { min-height: 44px; padding-top: 11px; padding-bottom: 11px; padding-left: 12px; padding-right: 12px; display: inline-flex; align-items: center; } }`,
        ].join("\n"),
      },
    },
    children: [
      {
        id: makeId("button"),
        kind: "button",
        props: {
          label: "EN",
          href: "/?lang=en",
          tone: "secondary",
          style: {
            backgroundColor: "transparent",
            textColor: CHAMPAGNE,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontSize: "0.68rem",
            paddingTop: "2px",
            paddingBottom: "2px",
            paddingLeft: "4px",
            paddingRight: "4px",
            borderWidth: "0px",
          },
        },
      },
      {
        id: makeId("button"),
        kind: "button",
        props: {
          label: "ES",
          href: "/?lang=es",
          tone: "secondary",
          style: {
            backgroundColor: "transparent",
            textColor: MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontSize: "0.68rem",
            paddingTop: "2px",
            paddingBottom: "2px",
            paddingLeft: "4px",
            paddingRight: "4px",
            borderWidth: "0px",
          },
        },
      },
    ],
  };

  // "Powered by Tulala" — Tulala in a champagne <em>. lockedProps:["text"] so
  // tenant surfaces cannot rewrite the attribution (handoff §8 lock, no mig).
  const poweredId = makeId("rich_text");
  const powered: BuilderNode = {
    id: poweredId,
    kind: "rich_text",
    props: {
      text: "Powered by {i}Tulala{/i}",
      style: {
        textColor: MUTED,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        fontSize: "0.68rem",
        customCss: [`em { color: ${CHAMPAGNE}; font-style: italic; }`].join("\n"),
      },
    },
    i18n: { es: { text: "Hecho con {i}Tulala{/i}" } },
    lockedProps: ["text"],
  };

  const bottomBar: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      style: {
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "18px",
        paddingTop: "26px",
      },
    },
    children: [copyright, langToggle, powered],
  };

  // ── Inner wrap ───────────────────────────────────────────────────────────
  const innerWrap: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        maxWidthFree: "1240px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        width: "100%",
        gap: "0px",
        paddingLeft: "24px",
        paddingRight: "24px",
      },
    },
    children: [topZone, bottomBar],
  };

  // ── Root footer — espresso bg, top gold hairline; oversized top padding
  //    (clamp > 16-cap) lives in customCss. ─────────────────────────────────
  const rootId = makeId("container");
  return {
    id: rootId,
    kind: "container",
    props: {
      htmlTag: "footer",
      layout: "stack",
      style: {
        backgroundColor: ESPRESSO,
        paddingBottom: "44px",
        customCss: [
          // Top gold hairline + oversized fluid top padding (both exceed the
          // single-side-border / 16-char free-field caps → scoped here).
          `{ border-top: 1px solid ${GOLD}; padding-top: clamp(56px, 9vh, 96px); }`,
        ].join("\n"),
      },
    },
    children: [innerWrap],
  };
}
