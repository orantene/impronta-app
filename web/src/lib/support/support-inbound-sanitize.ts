/** Pure: turn an inbound email body into the new text of the reply only. */

export const INBOUND_REPLY_MAX_CHARS = 10_000;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .replace(/javascript:/gi, "");
}

const WROTE_RE = /^\s*(on|el)\s.+(wrote|escribi[oó]):?\s*$/i;
const ORIGINAL_RE = /^\s*-{2,}\s*(original message|mensaje original|forwarded message)\s*-{2,}\s*$/i;
const FROM_RE = /^\s*(from|de):\s/i;
const SENT_RE = /^\s*(sent|date|enviado( el)?|fecha):\s/i;

function isOutlookHeaderStart(lines: string[], i: number): boolean {
  if (i >= lines.length || !FROM_RE.test(lines[i])) return false;
  return lines.slice(i + 1, i + 5).some((l) => SENT_RE.test(l));
}

export function sanitizeInboundReplyBody(input: {
  text?: string | null;
  html?: string | null;
}): string {
  const raw = input.text?.trim() ? input.text : input.html ? htmlToText(input.html) : "";
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "-- " || line.trim() === "--") break; // signature delimiter
    if (ORIGINAL_RE.test(line)) break;
    if (/^\s*_{10,}\s*$/.test(line) && isOutlookHeaderStart(lines, i + 1)) break;
    if (isOutlookHeaderStart(lines, i)) break;
    if (WROTE_RE.test(line)) break;
    // "On Tue, ... <a@b>\n wrote:" wrapped across two lines
    if (/^\s*(on|el)\s/i.test(line) && /(wrote|escribi[oó]):?\s*$/i.test(lines[i + 1] ?? "")) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, INBOUND_REPLY_MAX_CHARS);
}
