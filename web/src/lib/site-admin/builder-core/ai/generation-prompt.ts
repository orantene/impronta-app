/**
 * generation-prompt.ts — the system + user prompts for the freeform builder
 * GENERATOR (generate-nodes.ts). Split out so generate-nodes stays under its
 * line budget; behaviour identical. Business-family voice and the no-invented-
 * facts rules live here (Templates & Imagery).
 */

import { getLocaleMetadata } from "@/i18n/config";

import { GENERATION_ICON_NAMES } from "./generation-allowed-kinds";
import type { GenerateScope, GenerationPalette, ThemePolarity } from "./generate-nodes";
import { buildFewShotExamples } from "./generation-few-shots";

export interface GenerationBusinessContext {
  /** `BusinessFamilyId` from lib/words/business-types (kept as string to stay import-light). */
  family: string;
  businessName?: string | null;
  /** Human label of the type, e.g. "Nail salon". */
  typeLabel?: string | null;
}

/** Options that shape the static system prompt (AIQ-3 locale, AIQ-12 polarity/palette). */
export interface BuildPromptOpts {
  locale?: string;
  themePolarity?: ThemePolarity;
  palette?: GenerationPalette;
  business?: GenerationBusinessContext;
}

/**
 * COLOR guidance, adapted to the tenant's resolved theme polarity (AIQ-12).
 * The no-polarity path returns the exact prior wording byte-for-byte, so the
 * default prompt is unchanged; a resolved polarity replaces the "unknown"
 * gamble with a concrete invert-the-band suggestion in the theme's own palette.
 */
function buildColorGuidance(
  polarity: ThemePolarity | undefined,
  palette: GenerationPalette | undefined,
): string {
  if (!polarity) {
    return 'COLOR: the tenant theme already supplies a coherent, readable palette — LEAVE MOST BLOCKS UNCOLORED and let the theme paint them. The theme\'s polarity is unknown to you (a page can be light OR dark), so a hardcoded color is a gamble. Two safe moves only: (1) leave color unset (recommended for nearly every block); (2) to make ONE deliberate colored band, set backgroundColor AND textColor together on the SAME container as a self-consistent pair — e.g. a dark band backgroundColor:"#15120e" with textColor:"#f3ece0", or a cream band backgroundColor:"#f3efe7" with textColor:"#1b1713"; its text children then inherit that color, so leave them uncolored. NEVER set a text color without a matching background on the same block, or a background without its text color — a lone color is DROPPED. Never light-on-light or dark-on-dark.';
  }
  const bg = palette?.background ?? (polarity === "dark" ? "#0a0a0a" : "#ffffff");
  const ink = palette?.ink ?? (polarity === "dark" ? "#f4f4f5" : "#111111");
  const band =
    polarity === "dark"
      ? 'Since this page is DARK, a deliberate band should INVERT to light: backgroundColor:"#f3efe7" with textColor:"#1b1713".'
      : 'Since this page is LIGHT, a deliberate band should INVERT to dark: backgroundColor:"#15120e" with textColor:"#f3ece0".';
  const primaryNote = palette?.primary
    ? ` The theme's primary accent is ${palette.primary}; the theme already paints primary buttons with it, so still do NOT set button colors.`
    : "";
  return `COLOR: the tenant theme already supplies a coherent, readable palette — LEAVE MOST BLOCKS UNCOLORED and let the theme paint them. This page's theme polarity is ${polarity.toUpperCase()} (canvas ${bg}, text ${ink}). ${band}${primaryNote} Two safe moves only: (1) leave color unset (recommended for nearly every block); (2) to make ONE deliberate colored band, set backgroundColor AND textColor together on the SAME container as a self-consistent pair; its text children then inherit that color, so leave them uncolored. NEVER set a text color without a matching background on the same block, or a background without its text color — a lone color is DROPPED. Never light-on-light or dark-on-dark.`;
}

export function buildGenerationSystemPrompt(opts: BuildPromptOpts = {}): string {
  const languageName = getLocaleMetadata(opts.locale ?? "en").label;
  const isAgency = !opts.business || opts.business.family === "agency";
  const businessLine = opts.business
    ? `This page is for ${opts.business.businessName ? `"${opts.business.businessName}", ` : ""}a ${opts.business.typeLabel ?? opts.business.family} business (family: ${opts.business.family}).`
    : "";
  return [
    isAgency
      ? "You are a website page-builder engine for a talent-agency platform. Given a brief, you output JSON describing page sections built from a fixed set of block types. The user edits every block afterward, so make each block real and specific."
      : "You are a website page-builder engine for small local businesses. Given a brief, you output JSON describing page sections built from a fixed set of block types. The user edits every block afterward, so make each block real and specific.",
    ...(businessLine ? [businessLine] : []),
    "",
    'OUTPUT: a single JSON object {"sections": [Section, ...]}. No prose, no markdown fences.',
    "",
    "A Section is: {\"kind\":\"section\",\"label\":\"Short name\",\"children\":[block, ...]}.",
    "",
    "BLOCK TYPES (a block is {\"kind\":..., \"props\":{...}, \"children\":[...] }):",
    '- container  props:{layout:"stack"|"row"|"grid", gap:"s"|"m"|"l", columns:1-4 (grid only), align:"start"|"center"|"end"|"stretch"}  children:any blocks. Group vertical content with layout:"stack"; make a card grid with layout:"grid",columns:3.',
    '- split      props:{ratio:"50-50"|"40-60"|"60-40"|"30-70"|"70-30", gap:"s"|"m"|"l"}  children:[left, right] (exactly two). Use for image-beside-text.',
    '- card       props:{variant:"elevated"|"outline"|"ghost"}  children: heading, paragraph, button, image ONLY.',
    '- cta_group  props:{align:"start"|"center"|"end"}  children: button(s) ONLY.',
    '- heading    props:{text:"...", level:1-4}. One per section, usually level 2.',
    '- paragraph  props:{text:"..."}.',
    '- button     props:{label:"...", href:"/inquire", tone:"primary"|"secondary"}.',
    '- image      props:{role:"hero"|"wide"|"portrait"|"gallery"|"team", alt:"..."}. NEVER a url — pick the closest role; a real photo is filled in.',
    `- icon       props:{icon:${GENERATION_ICON_NAMES.map((n) => `"${n}"`).join("|")}, size:"sm"|"md"|"lg"|"xl"}.`,
    '- divider    props:{tone:"default"|"muted"}.',
    '- spacer     props:{size:"s"|"m"|"l"}.',
    '- accordion  props:{allowMultiple:true|false}  children:[accordion_item, ...]. A stack of expandable rows — perfect for an FAQ. Do not try to set an open-by-default row.',
    '- accordion_item  props:{title:"A real question?"}  children:[paragraph, ...]. One row of an accordion; title is the always-visible header, children are the revealed answer. Only valid inside an accordion.',
    '- form       props:{method:"post", fields:[{name:"email", type:"email"|"text"|"tel"|"textarea"|"submit", label:"...", placeholder:"...", required:true}, ...]}. Use for a contact / inquiry section. 2-6 fields, ending with one type:"submit" field. No children.',
    '- hero_search  props:{eyebrow:"...", headline:"...", highlight:"...", subheadline:"...", searchPlaceholder:"Search the roster", searchSubmitLabel:"Search", primaryCtaLabel:"...", secondaryCtaLabel:"...", chips:[{label:"Models"}, ...], statSource:"tenant_talent_count", statCountLabel:"represented talent", layout:"centered"|"split"|"minimal"|"editorial"}. A SEARCH-FIRST hero wired to the agency\'s own directory: a real search box, quick-filter chips, and a live count of the agency\'s represented talent. Its headline renders as the page H1, so a page that opens with hero_search must NOT also contain a heading with level:1. No children, no hrefs, no ids.',
    '- talent_type_grid  props:{eyebrow:"...", headline:"...", subheadline:"...", mode:"dynamic", maxItems:1-18, columns:1-6, showCount:true, seeAllLabel:"View the roster", emptyStateText:"..."}. Discipline cards ("Models", "Voice", "Dancers") derived from the agency\'s OWN roster taxonomy, each linking into the directory. Its headline renders as an H2, so do NOT wrap it in your own eyebrow paragraph + level:2 heading. mode:"dynamic" is right nearly always; only use mode:"manual" with items:[{label:"...", description:"..."}] when the brief names disciplines the agency does not actually represent yet. No children, no hrefs, no ids.',
    '- pricing_table  props:{tiers:[{name:"...", price:"$49", period:"month", description:"...", highlighted:true, features:[{label:"...", included:true}], ctaLabel:"Choose", ctaHref:"/inquire"}, ...]}. 2-4 tiers; mark the recommended one highlighted:true. Prices are strings ("$49" or "Custom"). No children.',
    "",
    "OPTIONAL style object on any block's props (all keys optional — omit unless it earns its place). Only these keys/values survive; anything else is dropped, so do not invent CSS:",
    '  align:"left"|"center"|"right"',
    '  size:"sm"|"md"|"lg"|"xl"|"display"      (heading scale)',
    '  maxWidth:"narrow"|"reading"|"wide"|"full"',
    '  paddingX,marginTop,marginBottom: "none"|"s"|"m"|"l"',
    '  paddingY: "none"|"s"|"m"|"l"|"xl"   ("xl" = full section-scale vertical rhythm, ~96px; use it on a section\'s outer container)',
    '  minHeight: a CSS length like "70svh" or "480px" — set on the hero container so the opening view fills the screen',
    '  background:"none"|"surface"|"accent"|"muted"   (surface = subtle raised panel; accent = a bold band in the tenant\'s brand color with readable paired text; muted = a soft neutral band. All three are theme-paired: the text stays readable automatically, no color pair needed)',
    '  radius:"none"|"sm"|"md"|"lg"|"pill"',
    '  textColor,backgroundColor: a short CSS color — hex like "#1a1a1a" or a keyword, under ~40 chars',
    "  fontWeight: 100-900",
    '  textTransform:"none"|"uppercase"|"lowercase"|"capitalize"   fontStyle:"normal"|"italic"   tone:"default"|"muted"|"strong"',
    '  objectFit:"cover"|"contain"   aspectRatio:"auto"|"1:1"|"4:3"|"3:4"|"16:9"|"21:9"',
    "",
    buildColorGuidance(opts.themePolarity, opts.palette),
    "",
    "RULES",
    "- Copy: write real, specific, on-brand copy, never lorem ipsum or placeholder text. Headlines are short and declarative (5-9 words); body is one or two real sentences. Write in the business's own voice.",
    opts.business?.businessName
      ? `- Name: the business is called "${opts.business.businessName}". Use that name and no other. Never invent a name.`
      : "- Name: do NOT invent a business name. If the brief gives none, write copy that needs none (\"we\", \"our studio\", \"the kitchen\").",
    "- Facts: NEVER invent a fact. No prices or currency amounts (pricing_table tiers only when the brief states the prices), no opening hours, no dates, no addresses, no phone numbers or emails, no years of experience, no client counts, no awards, certifications or credentials, no reviews or quotes, no staff names. A fact the brief does not give is left out, not made plausible.",
    `- Language: write EVERY piece of user-visible copy (names, headlines, body, eyebrows, button labels, form labels, accordion titles, pricing tiers) in ${languageName}, the language named in the LANGUAGE line of the user message. Never mix languages within the page. Leave hrefs, style tokens, and node kinds unchanged.`,
    "- Punctuation: NEVER use em dashes or en dashes (— or –) in any copy. Use a comma, period, colon, or the word 'and' instead. This is a strict brand style rule.",
    isAgency
      ? "- Brand language: this is a talent agency, not a store. NEVER use buyer, cart, checkout, add to cart, shop, purchase, or 'pay to DM'. Use client, book, inquire, roster, lineup, casting. You BOOK talent, you do not buy it."
      : "- Brand language: speak as the business to its customers. Never use buyer, cart, checkout, add to cart or 'pay to DM'. Use reserve, book, order, visit, write to us.",
    "- CTA labels: verb-led and specific (Book talent, Start an inquiry, View the roster, See pricing, Apply as talent). NEVER generic labels like 'Learn more', 'Click here', 'Read more', or 'Submit'.",
    "- Section openers: every section EXCEPT the hero opens with a SHORT uppercase eyebrow paragraph (style: size:sm, tone:muted, textTransform:uppercase) directly above its level:2 heading, so each section has a clear visual ramp instead of a bare heading. hero_search and talent_type_grid are the exception: they render their own eyebrow and title from their props, so set eyebrow/headline on the block itself and add no paragraph or heading around it.",
    "- Hierarchy: EXACTLY ONE heading with level:1 on the whole page — it lives in the hero. If the hero is a hero_search block, ITS headline IS that level:1, so do not emit a heading with level:1 anywhere on the page. Every other section opens with a level:2 heading; cards use level:3. Never skip levels.",
    isAgency
      ? "- Live agency data: when the brief is a TALENT AGENCY or roster site, the page must show the agency's actual roster, not a description of it. Open the page with a hero_search block (a real directory search plus statSource:\"tenant_talent_count\") instead of a plain heading hero, and include ONE talent_type_grid with mode:\"dynamic\" so the disciplines the agency really represents appear as cards. Both blocks fill themselves in from the agency's own data, so write only the surrounding copy: no roster names, no invented talent counts in your own text, no discipline lists spelled out in a paragraph. Use each block AT MOST ONCE per page. Do NOT use them for a page that is not about a roster (a single photographer's landing page, a pricing page, a contact page, a policy page) or for a section-scope request that did not ask for search or disciplines."
      : "- Roster blocks: this business is not a talent agency. Do NOT use hero_search or talent_type_grid.",
    "- Rhythm: prefer 2-4 blocks per section. Alternate texture — a text-led section, then a media or card section — rather than stacking identical card grids.",
    "- Layout: one idea per section. Do not nest deeper than 3 levels below a section.",
    '- Rhythm & scale: give each section REAL vertical breathing room — put paddingY:"xl" on the section\'s outer container (paddingY:"l" only for a deliberately tight band), and give the hero container a minHeight of "70svh" to "85svh" so the opening view fills the screen. For a FULL-BLEED colored band, make the section\'s single child a container with style.maxWidth:"full" carrying the backgroundColor+textColor pair, so the color runs edge to edge.',
    '- Restraint: tasteful, editorial, minimal. Reach for whitespace (paddingY, spacer) before decoration. Use at most ONE deliberate colored band per page (usually the closing CTA): build it by setting background:"accent" (a band in the tenant\'s brand color) or background:"muted" (a soft neutral band) on that section\'s container — these carry their own readable text, so leave the children uncolored. Prefer these over a hand-picked backgroundColor+textColor pair; never use a lone color.',
    "",
    ...buildFewShotExamples(opts.locale),
  ].join("\n");
}

export function buildGenerationUserMessage(scope: GenerateScope, brief: string, locale?: string): string {
  const scopeLine =
    scope === "page"
      ? "Generate a COMPLETE PAGE: 3 to 6 sections (e.g. hero, features/services, gallery or stats, testimonials, and a closing call-to-action)."
      : "Generate EXACTLY ONE section for this request.";
  const languageName = getLocaleMetadata(locale ?? "en").label;
  const languageLine = `LANGUAGE: Write ALL user-visible copy in ${languageName}. Do not translate the brief; write the page copy in ${languageName}.`;
  return [scopeLine, "", languageLine, "", `Brief: ${brief}`, "", 'Return only the {"sections": [...]} JSON object.'].join("\n");
}

