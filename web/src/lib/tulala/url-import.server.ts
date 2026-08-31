/**
 * url-import.server.ts — fetch a link the visitor pasted, and read it.
 *
 * "Paste your Instagram or your website and I will read it" removes more work
 * from an intake than any question can. Someone with a real site has already
 * written their own description, named their services and stated where they are;
 * asking them to retype it is the intake admitting it cannot read.
 *
 * IT IS NOT A SCRAPER, AND THE LIMITS ARE WHAT MAKE THAT TRUE
 * ──────────────────────────────────────────────────────────
 *   • ONE page. No crawling, no link following, no sitemap. `redirect: "manual"`,
 *     so a redirect is a failure rather than a second fetch into somewhere new.
 *   • Rate limited per session AND per IP, in its own namespace so it cannot eat
 *     the conversation's budget or hide behind it.
 *   • SSRF-guarded by the shared `assertPublicHttpUrl`, the same guard the link
 *     previews use.
 *   • HTML only, 512KB cap, 5s timeout.
 *
 * Without those it becomes a general-purpose fetch endpoint that anyone can
 * point anywhere, which is a liability rather than a feature.
 *
 * NOTHING IT IMPORTS IS TRUSTED
 * ─────────────────────────────
 * Every fact lands `source: url_import`, `status: needs_approval`, and the
 * confidence is capped BELOW what the same claim would get from the person
 * saying it. A website is often out of date, and it is frequently not even theirs
 * — people paste the salon they work at. So the import proposes and the visitor
 * confirms, which is decision L20 applied to a source that cannot be questioned.
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { assertPublicHttpUrl, readCappedText } from "@/lib/ssrf-guard";
import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";

import { recordFacts, type BriefOwner } from "./brief-store.server";
import type { Brief, FactInput } from "./brief-store";
import { EXTRACTION_SCHEMA, parseExtraction } from "./extraction";
import { buildImportPrompt, buildImportMessage } from "./prompts";
import {
  extractHandles,
  extractPageText,
  isWorthExtracting,
  readMeta,
  type ImportedPage,
} from "./url-import";
import { packForBrief } from "./pack-for-brief";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const EXTRACTION_MAX_TOKENS = 1200;

/**
 * Confidence ceiling for anything read off a page.
 *
 * Below the extractor's own ceiling for conversation, deliberately. A sentence
 * someone typed to us a moment ago is better evidence about their business than
 * a paragraph on a site that may be two years old and may belong to their
 * employer. The gap is what makes a later conversational answer win.
 */
export const MAX_IMPORT_CONFIDENCE = 0.6;

export type ImportResult =
  | {
      ok: true;
      host: string;
      /** Facts written, for the confirmation UI to list back. */
      facts: Array<{ factKey: string; value: unknown }>;
    }
  | { ok: false; error: string };

export async function importFromUrl(input: {
  owner: BriefOwner;
  brief: Brief;
  url: string;
  locale: "en" | "es";
}): Promise<ImportResult> {
  const checked = await assertPublicHttpUrl(input.url);
  if (!checked.ok) {
    // One message for every refusal reason. Naming which internal range was
    // rejected would turn the error into a port scanner with a friendly UI.
    return { ok: false, error: "That link does not look like a public web page." };
  }

  const page = await fetchPage(checked.url);
  if (!page) {
    return { ok: false, error: "I could not open that page. Is it public?" };
  }

  const facts: FactInput[] = handleFacts(page);

  if (isWorthExtracting(page)) {
    const gate = await assertAiInvocationAllowed();
    if (gate.ok) {
      facts.push(...(await extractFromPage(page, input.brief, input.locale)));
    }
    // A closed gate is not an error for the caller: the handles are already
    // worth having, and "the assistant is at its limit" is not something the
    // visitor can act on.
  }

  if (facts.length === 0) {
    return { ok: false, error: "I read that page but could not find anything useful on it." };
  }

  const written = await recordFacts(input.brief.id, facts);
  for (const bad of written.rejected) {
    // A recurring rejection here is a prompt or vocabulary bug, and this is the
    // only place it surfaces.
    logServerError("tulala.import.rejected", new Error(`${bad.factKey}: ${bad.error}`));
  }
  if (written.written.length === 0) {
    return {
      ok: false,
      error: "I read that page but nothing on it was new.",
    };
  }

  const writtenKeys = new Set(written.written);
  return {
    ok: true,
    host: page.host,
    facts: facts
      .filter((f) => writtenKeys.has(f.factKey))
      .map((f) => ({ factKey: f.factKey, value: f.value })),
  };
}

/** Fetch and strip one page. Null on any failure, which is common and fine. */
async function fetchPage(url: URL): Promise<ImportedPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      // No auto-follow: a redirect could land on an internal host that the
      // pre-flight DNS check never saw.
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": "TulalaIntake/1.0 (+https://tulala.digital)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en,es;q=0.8",
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(contentType)) return null;

  const html = await readCappedText(res, MAX_BYTES);
  if (!html) return null;

  const meta = readMeta(html);
  return {
    url: url.toString(),
    host: url.hostname.replace(/^www\./, ""),
    title: meta.title,
    description: meta.description,
    siteName: meta.siteName,
    handles: extractHandles(html),
    text: extractPageText(html),
  };
}

/**
 * Facts from the page's own links, with no model involved.
 *
 * Deterministic and near-perfect, so it runs even when the AI gate is closed and
 * even when the page has no readable prose. A link to instagram.com/glowstudio
 * IS the handle.
 *
 * Still `needs_approval`, because the handle being correctly READ does not make
 * it theirs — plenty of sites link the salon's account, or a photographer's.
 */
function handleFacts(page: ImportedPage): FactInput[] {
  const facts: FactInput[] = [];
  const base = {
    source: "url_import" as const,
    sourceUrl: page.url,
    confidence: MAX_IMPORT_CONFIDENCE,
  };

  if (page.handles.instagram) {
    facts.push({
      ...base,
      factKey: "presence.instagram_handle",
      value: page.handles.instagram,
      sourceExcerpt: `instagram.com/${page.handles.instagram}`,
    });
  }

  // The page they pasted IS a website they have, which is the one thing an
  // import can assert about itself without reading a word.
  facts.push({
    ...base,
    factKey: "presence.website_url",
    value: page.url,
    sourceExcerpt: page.host,
    // Higher than the rest: that this URL exists and serves a page is
    // established by having just fetched it, not inferred from its contents.
    confidence: 0.9,
  });

  return facts;
}

/** Ask the model to read the page prose into facts. */
async function extractFromPage(
  page: ImportedPage,
  brief: Brief,
  locale: "en" | "es",
): Promise<FactInput[]> {
  try {
    const adapter = await resolveAiChatAdapter();
    const completion = await adapter.chatCompletion({
      systemPrompt: buildImportPrompt({ pack: packForBrief(brief), locale }),
      userMessage: buildImportMessage(page, brief),
      jsonSchema: EXTRACTION_SCHEMA,
      maxTokens: EXTRACTION_MAX_TOKENS,
      temperature: 0,
    });

    if (!completion.ok) {
      logServerError("tulala.import.extract", new Error(completion.code));
      return [];
    }

    void recordAiUsageEstimate().catch(() => {});

    const parsed = parseExtraction(completion.text, {
      // No question produced these, so there is no question to attribute the
      // yield to. Leaving these null keeps the import out of the per-question
      // metrics, where it would look like a question with superhuman yield.
      questionId: null,
      questionVersion: null,
      // A website never establishes what somebody's body looks like.
      allowPhysicalAttributes: false,
    });

    return parsed.facts.map((fact) => ({
      ...fact,
      source: "url_import" as const,
      sourceUrl: page.url,
      // Re-capped here rather than trusted from the model. `parseExtraction`
      // applies the conversational ceiling, which is higher than an import has
      // earned.
      confidence: Math.min(MAX_IMPORT_CONFIDENCE, fact.confidence ?? MAX_IMPORT_CONFIDENCE),
    }));
  } catch (error) {
    logServerError("tulala.import.extract", error);
    return [];
  }
}
