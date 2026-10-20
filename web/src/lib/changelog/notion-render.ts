/**
 * Changelog sync: pure Notion → row mapping and safe HTML rendering (TUL-1390).
 * No I/O. `sync.ts` fetches pages, blocks and images; everything that decides
 * what lands in `changelog_entries` lives here so it is unit-tested.
 *
 * Rendering is an allow-list: only known block types become HTML, every text
 * run is escaped, and links survive only for http(s) and mailto. Nothing from
 * Notion is ever passed through as raw HTML.
 *
 * Bilingual body convention: a top-level heading whose text is "EN" / "English"
 * starts the English body, "ES" / "Español" starts the Spanish one. Blocks
 * before the first marker (or the whole page when there is no marker) go into
 * both languages.
 */

export type NotionRichText = {
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
};

export type NotionFileRef = {
  type?: string;
  name?: string;
  file?: { url?: string };
  external?: { url?: string };
};

export type NotionBlock = {
  id: string;
  type: string;
  [key: string]: unknown;
};

export type NotionProperty = {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  date?: { start?: string } | null;
  url?: string | null;
  files?: NotionFileRef[];
};

export type NotionReleasePage = {
  id: string;
  last_edited_time?: string;
  properties: Record<string, NotionProperty | undefined>;
};

export type ChangelogStatus = "published" | "paused";

export type ChangelogRowFields = {
  notion_page_id: string;
  status: ChangelogStatus;
  kind: string;
  release_id: string | null;
  release_date: string | null;
  tier: number | null;
  badge: string | null;
  title_en: string;
  title_es: string;
  summary_en: string;
  summary_es: string;
  audience: string[];
  plans: string[];
  categories: string[];
  help_url: string | null;
  published_at: string | null;
  notion_last_edited_at: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) and mailto links survive; anything else renders as plain text. */
export function safeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

export function plainText(runs: NotionRichText[] | undefined): string {
  return (runs ?? []).map((r) => r.plain_text ?? "").join("");
}

export function richTextToHtml(runs: NotionRichText[] | undefined): string {
  return (runs ?? [])
    .map((run) => {
      let html = escapeHtml(run.plain_text ?? "").replace(/\n/g, "<br>");
      const a = run.annotations ?? {};
      if (a.code) html = `<code>${html}</code>`;
      if (a.bold) html = `<strong>${html}</strong>`;
      if (a.italic) html = `<em>${html}</em>`;
      if (a.strikethrough) html = `<s>${html}</s>`;
      if (a.underline) html = `<u>${html}</u>`;
      const href = safeHref(run.href);
      if (href) html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${html}</a>`;
      return html;
    })
    .join("");
}

function blockRichText(block: NotionBlock): NotionRichText[] {
  const body = block[block.type] as { rich_text?: NotionRichText[] } | undefined;
  return body?.rich_text ?? [];
}

function blockCaption(block: NotionBlock): NotionRichText[] {
  const body = block[block.type] as { caption?: NotionRichText[] } | undefined;
  return body?.caption ?? [];
}

/** Image URL inside an image block (Notion-hosted or external). */
export function imageBlockSource(block: NotionBlock): string | null {
  if (block.type !== "image") return null;
  const img = block.image as NotionFileRef | undefined;
  return img?.file?.url ?? img?.external?.url ?? null;
}

const LIST_TYPES: Record<string, "ul" | "ol"> = {
  bulleted_list_item: "ul",
  numbered_list_item: "ol",
  to_do: "ul",
};

/**
 * Render top-level blocks. `imageUrls` maps an image block id to the copy in
 * our storage; an image without a copy is dropped (never hotlink Notion).
 */
export function blocksToHtml(blocks: readonly NotionBlock[], imageUrls: ReadonlyMap<string, string>): string {
  const out: string[] = [];
  let openList: "ul" | "ol" | null = null;
  const closeList = () => {
    if (openList) out.push(`</${openList}>`);
    openList = null;
  };

  for (const block of blocks) {
    const listTag = LIST_TYPES[block.type];
    if (listTag) {
      if (openList !== listTag) {
        closeList();
        out.push(`<${listTag}>`);
        openList = listTag;
      }
      out.push(`<li>${richTextToHtml(blockRichText(block))}</li>`);
      continue;
    }
    closeList();
    const text = richTextToHtml(blockRichText(block));
    switch (block.type) {
      case "paragraph":
        if (text) out.push(`<p>${text}</p>`);
        break;
      case "heading_1":
        out.push(`<h2>${text}</h2>`);
        break;
      case "heading_2":
        out.push(`<h3>${text}</h3>`);
        break;
      case "heading_3":
        out.push(`<h4>${text}</h4>`);
        break;
      case "quote":
        out.push(`<blockquote>${text}</blockquote>`);
        break;
      case "callout":
        out.push(`<aside><p>${text}</p></aside>`);
        break;
      case "toggle":
        out.push(`<details><summary>${text}</summary></details>`);
        break;
      case "code":
        out.push(`<pre><code>${escapeHtml(plainText(blockRichText(block)))}</code></pre>`);
        break;
      case "divider":
        out.push("<hr>");
        break;
      case "image": {
        const src = imageUrls.get(block.id);
        if (!src) break;
        const caption = plainText(blockCaption(block));
        out.push(
          `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" loading="lazy">` +
            (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "") +
            "</figure>",
        );
        break;
      }
      default:
        // Unknown block types are skipped on purpose (allow-list).
        break;
    }
  }
  closeList();
  return out.join("");
}

const HEADING_TYPES = new Set(["heading_1", "heading_2", "heading_3"]);

function languageMarker(block: NotionBlock): "en" | "es" | null {
  if (!HEADING_TYPES.has(block.type)) return null;
  const text = plainText(blockRichText(block))
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (text === "en" || text === "english") return "en";
  if (text === "es" || text === "espanol") return "es";
  return null;
}

/** Split a page body into English and Spanish block lists (see file header). */
export function splitBodyByLanguage(blocks: readonly NotionBlock[]): { en: NotionBlock[]; es: NotionBlock[] } {
  const en: NotionBlock[] = [];
  const es: NotionBlock[] = [];
  let current: "both" | "en" | "es" = "both";
  for (const block of blocks) {
    const marker = languageMarker(block);
    if (marker) {
      current = marker;
      continue;
    }
    if (current !== "es") en.push(block);
    if (current !== "en") es.push(block);
  }
  return { en, es };
}

function names(prop: NotionProperty | undefined): string[] {
  return (prop?.multi_select ?? []).map((o) => o.name ?? "").filter(Boolean);
}

function text(prop: NotionProperty | undefined): string {
  return plainText(prop?.rich_text ?? prop?.title).trim();
}

/** Published / Paused map to rows; any other Notion status is not synced. */
export function changelogStatus(page: NotionReleasePage): ChangelogStatus | null {
  const name = page.properties.Status?.status?.name;
  if (name === "Published") return "published";
  if (name === "Paused") return "paused";
  return null;
}

/** "2 Notable" → 2. */
export function parseTier(name: string | undefined): number | null {
  if (!name) return null;
  const n = Number(name.trim().charAt(0));
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

export function mapReleasePage(page: NotionReleasePage): ChangelogRowFields | null {
  const status = changelogStatus(page);
  if (!status) return null;
  const p = page.properties;
  const helpUrl = safeHref(p["Help article"]?.url ?? null);
  return {
    notion_page_id: page.id,
    status,
    kind: p.Kind?.select?.name ?? "Weekly changelog",
    release_id: text(p["Release ID"]) || null,
    release_date: p["Release date"]?.date?.start ?? null,
    tier: parseTier(p.Tier?.select?.name),
    badge: p.Badge?.select?.name ?? null,
    title_en: text(p["Title EN"]) || text(p.Release),
    title_es: text(p["Title ES"]) || text(p["Title EN"]) || text(p.Release),
    summary_en: text(p["Summary EN"]),
    summary_es: text(p["Summary ES"]) || text(p["Summary EN"]),
    audience: names(p.Audience),
    plans: names(p.Plan),
    categories: names(p.Category),
    help_url: helpUrl,
    published_at: p["Published at"]?.date?.start ?? page.last_edited_time ?? null,
    notion_last_edited_at: page.last_edited_time ?? null,
  };
}

/** First cover image URL on the page (Notion-hosted or external). */
export function coverImageSource(page: NotionReleasePage): string | null {
  const first = page.properties["Cover image"]?.files?.[0];
  return first?.file?.url ?? first?.external?.url ?? null;
}

/** Storage path for a copied image: one folder per Notion page. */
export function imageStoragePath(pageId: string, key: string, ext: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "");
  return `${safe(pageId)}/${safe(key)}.${ext}`;
}
